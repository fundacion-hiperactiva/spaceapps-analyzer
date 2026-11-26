import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { BrowserContext } from "playwright";
import { settle } from "./capture.js";
import type { ContentEvidence } from "./types.js";
import { cleanText, shortHash, toRelative, validatePublicHttpUrl, writeUtf8 } from "./utils.js";

const TEXT_EXTENSIONS = new Set([
  ".md", ".mdx", ".txt", ".rst", ".json", ".yaml", ".yml", ".toml", ".csv",
  ".ts", ".tsx", ".js", ".jsx", ".py", ".ipynb", ".java", ".kt", ".swift",
  ".go", ".rs", ".c", ".h", ".cpp", ".hpp", ".cs", ".html", ".css", ".scss",
  ".sql", ".sh", ".graphql", ".vue", ".svelte",
]);
const MAX_FILES = 60;
const MAX_FILE_CHARS = 80_000;
const MAX_TOTAL_CHARS = 200_000;
const execFileAsync = promisify(execFile);

export async function collectExternalContent(input: {
  context: BrowserContext;
  projectUrl: string | null;
  demoUrl: string | null;
  resourceUrls?: string[];
  outputRoot: string;
  relativeDir: string;
  timeoutMs: number;
}): Promise<ContentEvidence[]> {
  const evidence: ContentEvidence[] = [];
  const urls = [...new Set([input.projectUrl, input.demoUrl, ...(input.resourceUrls ?? [])].filter((value): value is string => Boolean(value)))];
  const repositoryUrl = urls.map(toRepositoryUrl).find((value): value is string => Boolean(value));
  const videoUrl = urls.find((value) => youtubeId(value));
  if (repositoryUrl) evidence.push(...await collectRepository(repositoryUrl, input.outputRoot, input.relativeDir, input.timeoutMs));
  if (videoUrl) evidence.push(await collectYouTubeTranscript(input.context, videoUrl, input.outputRoot, input.relativeDir, input.timeoutMs));
  for (const presentationUrl of urls.filter(isPresentationUrl)) {
    if (presentationUrl !== videoUrl && presentationUrl !== repositoryUrl) evidence.push(await collectPresentation(presentationUrl, input.outputRoot, input.relativeDir, input.timeoutMs));
  }
  return evidence;
}

export async function collectRepository(url: string, outputRoot: string, relativeDir: string, timeoutMs: number): Promise<ContentEvidence[]> {
  const source = new URL(url);
  const host = source.hostname.replace(/^www\./, "");
  const segments = source.pathname.split("/-/")[0]!.split("/").filter(Boolean);
  const repositorySegments = host === "github.com" ? segments.slice(0, 2) : segments;
  const repo = repositorySegments.at(-1)?.replace(/\.git$/i, "");
  const owner = repositorySegments.slice(0, -1).join("/");
  if (!owner || !repo) return [{ kind: "repository", sourceUrl: url, status: "unknown", title: "Repository", text: "", reason: "The repository owner or name could not be resolved" }];

  try {
    const cloneDir = path.join(outputRoot, relativeDir, "repository");
    const exists = await stat(path.join(cloneDir, ".git")).then(() => true).catch(() => false);
    if (!exists) {
      await mkdir(path.dirname(cloneDir), { recursive: true });
      const cloneUrl = `${source.origin}/${[...repositorySegments.slice(0, -1), repo].join("/")}.git`;
      await execFileAsync("git", ["clone", "--depth", "1", "--single-branch", cloneUrl, cloneDir], { timeout: Math.max(timeoutMs, 120_000), maxBuffer: 2_000_000 });
    }
    const allFiles = await listFiles(cloneDir);
    const candidates = allFiles.filter((item) => isTextPath(item)).sort((a, b) => priority(a) - priority(b) || a.localeCompare(b)).slice(0, MAX_FILES);
    const sections: string[] = [];
    const files: string[] = [];
    let total = 0;
    for (const item of candidates) {
      if (total >= MAX_TOTAL_CHARS) break;
      const file = path.join(cloneDir, item);
      const size = await stat(file).then((value) => value.size).catch(() => 0);
      if (!size || size > MAX_FILE_CHARS * 2) continue;
      const value = cleanText((await readFile(file, "utf8").catch(() => "")).slice(0, MAX_FILE_CHARS));
      if (!value) continue;
      const remaining = MAX_TOTAL_CHARS - total;
      const clipped = value.slice(0, remaining);
      sections.push(`FILE: ${item}\n${clipped}`);
      files.push(item);
      total += clipped.length;
    }
    const text = sections.join("\n\n");
    const textFile = path.join(outputRoot, relativeDir, "repository.txt");
    const manifestFile = path.join(outputRoot, relativeDir, "repository.json");
    await Promise.all([
      writeUtf8(textFile, text),
      writeUtf8(manifestFile, `${JSON.stringify({ sourceUrl: url, repository: `${owner}/${repo}`, clonePath: toRelative(outputRoot, cloneDir), files, characters: text.length }, null, 2)}\n`),
    ]);
    const repositoryEvidence: ContentEvidence = {
      kind: "repository",
      sourceUrl: url,
      status: text.length >= 200 ? "pass" : "unknown",
      title: `${owner}/${repo}`,
      text,
      reason: text.length >= 200 ? `Cloned the repository and indexed ${files.length} text files without executing repository code` : "The repository was cloned, but no readable text content was extracted",
      textPath: toRelative(outputRoot, textFile),
      metadataPath: toRelative(outputRoot, manifestFile),
      artifactPath: toRelative(outputRoot, cloneDir),
      items: files,
    };
    const presentationFiles = allFiles.filter((item) => /\.(?:pdf|pptx?)$/i.test(item)).slice(0, 20);
    const presentations = await Promise.all(presentationFiles.map((item) => collectClonedPresentation({
      repositoryUrl: url,
      file: path.join(cloneDir, item),
      repositoryPath: item,
      outputRoot,
      relativeDir,
      timeoutMs,
    })));
    return [repositoryEvidence, ...presentations];
  } catch (cause) {
    return [{ kind: "repository", sourceUrl: url, status: "unknown", title: `${owner}/${repo}`, text: "", reason: cause instanceof Error ? cause.message : String(cause) }];
  }
}

async function collectClonedPresentation(input: { repositoryUrl: string; file: string; repositoryPath: string; outputRoot: string; relativeDir: string; timeoutMs: number }): Promise<ContentEvidence> {
  const extension = path.extname(input.file).toLowerCase();
  const text = await extractPresentationText(input.file, extension, input.timeoutMs);
  const textFile = path.join(input.outputRoot, input.relativeDir, `presentation-repository-${shortHash(input.repositoryPath)}.txt`);
  await writeUtf8(textFile, text);
  return {
    kind: "presentation",
    sourceUrl: input.repositoryUrl,
    status: text.length >= 80 ? "pass" : "warn",
    title: input.repositoryPath,
    text,
    reason: text.length >= 80 ? "Found a presentation in the cloned repository and extracted its text locally" : "Found a presentation in the cloned repository, but little readable text could be extracted",
    textPath: toRelative(input.outputRoot, textFile),
    artifactPath: toRelative(input.outputRoot, input.file),
    items: [input.repositoryPath],
  };
}

async function listFiles(root: string, current = ""): Promise<string[]> {
  const directory = path.join(root, current);
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(".next")) continue;
    const relative = path.posix.join(current.split(path.sep).join(path.posix.sep), entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result;
}

async function collectPresentation(url: string, outputRoot: string, relativeDir: string, timeoutMs: number): Promise<ContentEvidence> {
  try {
    const downloadUrl = validatePublicHttpUrl(presentationDownloadUrl(url)).href;
    const response = await fetch(downloadUrl, { redirect: "follow", signal: AbortSignal.timeout(Math.max(timeoutMs, 60_000)), headers: { "User-Agent": "spaceapps-analyzer" } });
    if (!response.ok) throw new Error(`Presentation download returned HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 50_000_000) throw new Error("Presentation exceeds the 50 MB download limit");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 50_000_000) throw new Error("Presentation exceeds the 50 MB download limit");
    const type = response.headers.get("content-type") || "";
    const extension = type.includes("presentationml") || /\.pptx(?:$|[?#])/i.test(downloadUrl) ? ".pptx"
      : type.includes("pdf") || /\.pdf(?:$|[?#])/i.test(downloadUrl) || downloadUrl.includes("format=pdf") ? ".pdf"
        : type.includes("powerpoint") || /\.ppt(?:$|[?#])/i.test(downloadUrl) ? ".ppt"
          : ".html";
    const basename = `presentation-${shortHash(url)}`;
    const artifact = path.join(outputRoot, relativeDir, `${basename}${extension}`);
    await mkdir(path.dirname(artifact), { recursive: true });
    await writeFile(artifact, bytes);
    const text = await extractPresentationText(artifact, extension, timeoutMs);
    const textFile = path.join(outputRoot, relativeDir, `${basename}.txt`);
    await writeUtf8(textFile, text);
    return { kind: "presentation", sourceUrl: url, status: text.length >= 80 ? "pass" : "warn", title: path.basename(new URL(url).pathname) || "Presentation", text, reason: text.length >= 80 ? "Downloaded the public presentation and extracted its text locally" : "Downloaded the public presentation, but little readable text could be extracted", textPath: toRelative(outputRoot, textFile), artifactPath: toRelative(outputRoot, artifact), items: [path.basename(artifact)] };
  } catch (cause) {
    return { kind: "presentation", sourceUrl: url, status: "unknown", title: "Presentation", text: "", reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

async function extractPresentationText(file: string, extension: string, timeoutMs: number): Promise<string> {
  if (extension === ".pdf") {
    const output = `${file}.txt`;
    await execFileAsync("pdftotext", ["-layout", file, output], { timeout: Math.max(timeoutMs, 60_000) }).catch(() => undefined);
    return cleanText(await readFile(output, "utf8").catch(() => ""));
  }
  if (extension === ".pptx") {
    const options = { timeout: Math.max(timeoutMs, 60_000), maxBuffer: 20_000_000 };
    const slides = await execFileAsync("unzip", ["-p", file, "ppt/slides/slide*.xml"], options).catch(() => ({ stdout: "" }));
    const notes = await execFileAsync("unzip", ["-p", file, "ppt/notesSlides/notesSlide*.xml"], options).catch(() => ({ stdout: "" }));
    return cleanText(`${String(slides.stdout)}\n${String(notes.stdout)}`.replace(/<a:br\s*\/>/g, "\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  }
  if (extension === ".ppt") {
    const result = await execFileAsync("strings", [file], { timeout: Math.max(timeoutMs, 60_000), maxBuffer: 20_000_000 }).catch(() => ({ stdout: "" }));
    return cleanText(String(result.stdout));
  }
  return cleanText(await readFile(file, "utf8").catch(() => "").then((value) => value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")));
}

function isPresentationUrl(value: string): boolean {
  try { const url = new URL(value); return /\.(?:pdf|pptx?)(?:$|[?#])/i.test(value) || /(^|\.)docs\.google\.com$/.test(url.hostname) && url.pathname.includes("/presentation/") || /(^|\.)(?:canva\.com|prezi\.com)$/.test(url.hostname); } catch { return false; }
}

function presentationDownloadUrl(value: string): string {
  const url = new URL(value);
  const google = url.hostname === "docs.google.com" ? url.pathname.match(/\/presentation\/d\/([^/]+)/) : null;
  if (google?.[1]) return `https://docs.google.com/presentation/d/${google[1]}/export/pdf`;
  if (url.hostname === "github.com" && url.pathname.includes("/blob/")) {
    url.hostname = "raw.githubusercontent.com";
    url.pathname = url.pathname.replace("/blob/", "/");
  }
  return url.href;
}

async function collectYouTubeTranscript(context: BrowserContext, url: string, outputRoot: string, relativeDir: string, timeoutMs: number): Promise<ContentEvidence> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await settle(page, timeoutMs).catch(() => undefined);
    const title = cleanText(await page.title());
    const tracks = await page.evaluate(() => {
      const player = (window as unknown as { ytInitialPlayerResponse?: { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Array<{ baseUrl: string; languageCode?: string; name?: { simpleText?: string } }> } } } }).ytInitialPlayerResponse;
      return player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    }).catch(() => []);
    const track = tracks.find((item) => item.languageCode?.startsWith("en"))
      ?? tracks.find((item) => item.languageCode?.startsWith("es"))
      ?? tracks[0];
    if (!track?.baseUrl) {
      const uiText = await extractTranscriptFromUi(page);
      if (uiText) return saveTranscript({ url, title, text: uiText, language: undefined, outputRoot, relativeDir, reason: "Extracted the public transcript rendered by the video page" });
      const downloaded = await extractTranscriptWithYtDlp(url, outputRoot, relativeDir, timeoutMs);
      if (downloaded) return saveTranscript({ url, title, text: downloaded.text, language: downloaded.language, outputRoot, relativeDir, reason: downloaded.reason });
      return { kind: "video", sourceUrl: url, status: "unknown", title, text: "", reason: "No public caption track was exposed by the video" };
    }
    const separator = track.baseUrl.includes("?") ? "&" : "?";
    const response = await context.request.get(`${track.baseUrl}${separator}fmt=json3`, { timeout: timeoutMs, headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok()) return { kind: "video", sourceUrl: url, status: "unknown", title, text: "", reason: `Caption request returned HTTP ${response.status()}` };
    const raw = await response.text();
    let text = "";
    if (raw.trim()) {
      try {
        const payload = JSON.parse(raw) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
        text = cleanText((payload.events ?? []).flatMap((event) => event.segs ?? []).map((segment) => segment.utf8 || "").join(" "));
      } catch {
        text = cleanText(decodeXml(raw.replace(/<[^>]+>/g, " ")));
      }
    }
    if (!text) text = await extractTranscriptFromUi(page);
    if (!text) {
      const downloaded = await extractTranscriptWithYtDlp(url, outputRoot, relativeDir, timeoutMs);
      if (downloaded) return saveTranscript({ url, title, text: downloaded.text, language: downloaded.language, outputRoot, relativeDir, reason: downloaded.reason });
    }
    if (!text) return { kind: "video", sourceUrl: url, status: "unknown", title, text: "", reason: "The public caption track contained no readable transcript" };
    return saveTranscript({ url, title, text, language: track.languageCode, outputRoot, relativeDir, reason: `Extracted public ${track.languageCode || "unknown-language"} captions` });
  } catch (cause) {
    return { kind: "video", sourceUrl: url, status: "unknown", title: "YouTube video", text: "", reason: cause instanceof Error ? cause.message : String(cause) };
  } finally {
    await page.close();
  }
}

async function extractTranscriptWithYtDlp(url: string, outputRoot: string, relativeDir: string, timeoutMs: number): Promise<{ text: string; language: string | undefined; reason: string } | null> {
  const executable = process.env.SPACEAPPS_YT_DLP || "yt-dlp";
  const directory = path.join(outputRoot, relativeDir, "yt-dlp");
  await mkdir(directory, { recursive: true });
  const template = path.join(directory, "captions.%(language)s.%(ext)s");
  try {
    await execFileAsync(executable, [
      "--ignore-config", "--no-playlist", "--skip-download", "--write-subs", "--write-auto-subs",
      "--sub-langs", "en.*,es.*", "--sub-format", "vtt", "--output", template, url,
    ], { timeout: Math.max(timeoutMs, 60_000), maxBuffer: 2_000_000 });
    const files = (await readdir(directory)).filter((name) => name.endsWith(".vtt")).sort((a, b) => subtitlePriority(a) - subtitlePriority(b) || a.localeCompare(b));
    const selected = files[0];
    if (!selected) return null;
    const text = cleanText(parseVtt(await readFile(path.join(directory, selected), "utf8")));
    if (!text) return null;
    const language = selected.match(/captions\.([^.]+)/)?.[1];
    return { text, language, reason: `Extracted public ${language || "unknown-language"} captions with yt-dlp` };
  } catch { return null; }
}

function subtitlePriority(value: string): number {
  return /\.en(?:[.-]|$)/i.test(value) ? 0 : /\.es(?:[.-]|$)/i.test(value) ? 1 : 2;
}

function parseVtt(value: string): string {
  const lines = value.replace(/<[^>]+>/g, "").split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "WEBVTT" && !/^Kind:|^Language:|^\d+$|-->/.test(line));
  return lines.filter((line, index) => line !== lines[index - 1]).join(" ");
}

async function saveTranscript(input: { url: string; title: string; text: string; language: string | undefined; outputRoot: string; relativeDir: string; reason: string }): Promise<ContentEvidence> {
  const textFile = path.join(input.outputRoot, input.relativeDir, "video-transcript.txt");
  await writeUtf8(textFile, input.text);
  return { kind: "video", sourceUrl: input.url, status: "pass", title: input.title, text: input.text, reason: input.reason, textPath: toRelative(input.outputRoot, textFile), ...(input.language ? { language: input.language } : {}) };
}

async function extractTranscriptFromUi(page: import("playwright").Page): Promise<string> {
  await page.locator("#expand, tp-yt-paper-button#expand").first().click({ timeout: 3_000 }).catch(() => undefined);
  const button = page.getByRole("button", { name: /show transcript|mostrar transcripci[oó]n/i }).or(page.locator("button").filter({ hasText: /show transcript|mostrar transcripci[oó]n/i })).first();
  if (!(await button.isVisible({ timeout: 3_000 }).catch(() => false))) return "";
  await button.click().catch(() => undefined);
  const segments = page.locator("ytd-transcript-segment-renderer .segment-text, ytd-transcript-segment-renderer");
  await segments.first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  return cleanText((await segments.allTextContents().catch(() => [])).join(" "));
}

function decodeXml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'");
}

function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname.endsWith("youtube.com")) return url.searchParams.get("v") || (url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] ?? null : null);
    return null;
  } catch { return null; }
}

function toRepositoryUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "");
    if (hostname === "github.com" || hostname === "gitlab.com") return value;
    const githubPages = hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
    if (!githubPages?.[1]) return null;
    const owner = githubPages[1];
    const repository = url.pathname.split("/").filter(Boolean)[0] || `${owner}.github.io`;
    return `https://github.com/${owner}/${repository}`;
  } catch { return null; }
}

function isTextPath(value: string): boolean {
  const basename = path.posix.basename(value).toLowerCase();
  return /^readme(?:\.|$)|^license(?:\.|$)|^dockerfile$|^makefile$/.test(basename) || TEXT_EXTENSIONS.has(path.posix.extname(basename));
}

function priority(value: string): number {
  const lower = value.toLowerCase();
  if (/^readme(?:\.|$)/.test(path.posix.basename(lower))) return 0;
  if (lower.startsWith("docs/") || lower.includes("/docs/")) return 1;
  if (/package\.json$|pyproject\.toml$|requirements.*\.txt$/.test(lower)) return 2;
  return 3;
}
