import path from "node:path";
import type { BrowserContext } from "playwright";
import { settle } from "./capture.js";
import type { ContentEvidence } from "./types.js";
import { cleanText, toRelative, writeUtf8 } from "./utils.js";

const TEXT_EXTENSIONS = new Set([
  ".md", ".mdx", ".txt", ".rst", ".json", ".yaml", ".yml", ".toml", ".csv",
  ".ts", ".tsx", ".js", ".jsx", ".py", ".ipynb", ".java", ".kt", ".swift",
  ".go", ".rs", ".c", ".h", ".cpp", ".hpp", ".cs", ".html", ".css", ".scss",
  ".sql", ".sh", ".graphql", ".vue", ".svelte",
]);
const MAX_FILES = 60;
const MAX_FILE_CHARS = 80_000;
const MAX_TOTAL_CHARS = 200_000;

export async function collectExternalContent(input: {
  context: BrowserContext;
  projectUrl: string | null;
  demoUrl: string | null;
  outputRoot: string;
  relativeDir: string;
  timeoutMs: number;
}): Promise<ContentEvidence[]> {
  const evidence: ContentEvidence[] = [];
  const urls = [...new Set([input.projectUrl, input.demoUrl].filter((value): value is string => Boolean(value)))];
  const repositoryUrl = urls.find(isRepositoryUrl);
  const videoUrl = urls.find((value) => youtubeId(value));
  if (repositoryUrl) evidence.push(await collectRepository(repositoryUrl, input.outputRoot, input.relativeDir, input.timeoutMs));
  if (videoUrl) evidence.push(await collectYouTubeTranscript(input.context, videoUrl, input.outputRoot, input.relativeDir, input.timeoutMs));
  return evidence;
}

async function collectRepository(url: string, outputRoot: string, relativeDir: string, timeoutMs: number): Promise<ContentEvidence> {
  const source = new URL(url);
  if (source.hostname.replace(/^www\./, "") === "gitlab.com") return collectGitLab(url, outputRoot, relativeDir, timeoutMs);
  const [owner, rawRepo] = source.pathname.split("/").filter(Boolean);
  const repo = rawRepo?.replace(/\.git$/i, "");
  if (!owner || !repo) return { kind: "repository", sourceUrl: url, status: "unknown", title: "GitHub repository", text: "", reason: "The GitHub owner or repository name could not be resolved" };

  try {
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "spaceapps-analyzer" };
    const metadata = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`, headers, timeoutMs) as { default_branch?: string; full_name?: string };
    const branch = metadata.default_branch || "main";
    const tree = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, headers, timeoutMs) as { tree?: Array<{ path: string; type: string; size?: number }> };
    const candidates = (tree.tree ?? [])
      .filter((item) => item.type === "blob" && isTextPath(item.path) && (item.size ?? 0) <= MAX_FILE_CHARS * 2)
      .sort((a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path))
      .slice(0, MAX_FILES);
    const sections: string[] = [];
    const files: string[] = [];
    let total = 0;
    for (const item of candidates) {
      if (total >= MAX_TOTAL_CHARS) break;
      const encodedBranch = branch.split("/").map(encodeURIComponent).join("/");
      const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${encodedBranch}/${item.path.split("/").map(encodeURIComponent).join("/")}`;
      const response = await fetch(raw, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "spaceapps-analyzer" } }).catch(() => null);
      if (!response?.ok) continue;
      const value = cleanText((await response.text()).slice(0, MAX_FILE_CHARS));
      if (!value) continue;
      const remaining = MAX_TOTAL_CHARS - total;
      const clipped = value.slice(0, remaining);
      sections.push(`FILE: ${item.path}\n${clipped}`);
      files.push(item.path);
      total += clipped.length;
    }
    const text = sections.join("\n\n");
    const textFile = path.join(outputRoot, relativeDir, "repository.txt");
    const manifestFile = path.join(outputRoot, relativeDir, "repository.json");
    await Promise.all([
      writeUtf8(textFile, text),
      writeUtf8(manifestFile, `${JSON.stringify({ sourceUrl: url, repository: metadata.full_name || `${owner}/${repo}`, branch, files, characters: text.length }, null, 2)}\n`),
    ]);
    return {
      kind: "repository",
      sourceUrl: url,
      status: text.length >= 200 ? "pass" : "unknown",
      title: metadata.full_name || `${owner}/${repo}`,
      text,
      reason: text.length >= 200 ? `Extracted ${files.length} public text files without executing repository code` : "No readable public repository content was extracted",
      textPath: toRelative(outputRoot, textFile),
      metadataPath: toRelative(outputRoot, manifestFile),
      items: files,
    };
  } catch (cause) {
    return { kind: "repository", sourceUrl: url, status: "unknown", title: `${owner}/${repo}`, text: "", reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

async function collectGitLab(url: string, outputRoot: string, relativeDir: string, timeoutMs: number): Promise<ContentEvidence> {
  const source = new URL(url);
  const projectPath = source.pathname.split("/-/")[0]?.split("/").filter(Boolean).join("/") ?? "";
  if (!projectPath.includes("/")) return { kind: "repository", sourceUrl: url, status: "unknown", title: "GitLab repository", text: "", reason: "The GitLab project path could not be resolved" };
  try {
    const projectId = encodeURIComponent(projectPath);
    const metadata = await fetchJson(`https://gitlab.com/api/v4/projects/${projectId}`, {}, timeoutMs) as { id: number; default_branch?: string; path_with_namespace?: string };
    const branch = metadata.default_branch || "main";
    const tree = await fetchJson(`https://gitlab.com/api/v4/projects/${metadata.id}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(branch)}`, {}, timeoutMs) as Array<{ path: string; type: string }>;
    const candidates = tree.filter((item) => item.type === "blob" && isTextPath(item.path))
      .sort((a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path)).slice(0, MAX_FILES);
    const sections: string[] = [];
    const files: string[] = [];
    let total = 0;
    for (const item of candidates) {
      if (total >= MAX_TOTAL_CHARS) break;
      const raw = `https://gitlab.com/api/v4/projects/${metadata.id}/repository/files/${encodeURIComponent(item.path)}/raw?ref=${encodeURIComponent(branch)}`;
      const response = await fetch(raw, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "spaceapps-analyzer" } }).catch(() => null);
      if (!response?.ok) continue;
      const value = cleanText((await response.text()).slice(0, MAX_FILE_CHARS));
      if (!value) continue;
      const clipped = value.slice(0, MAX_TOTAL_CHARS - total);
      sections.push(`FILE: ${item.path}\n${clipped}`);
      files.push(item.path);
      total += clipped.length;
    }
    const text = sections.join("\n\n");
    const textFile = path.join(outputRoot, relativeDir, "repository.txt");
    const manifestFile = path.join(outputRoot, relativeDir, "repository.json");
    await Promise.all([
      writeUtf8(textFile, text),
      writeUtf8(manifestFile, `${JSON.stringify({ sourceUrl: url, repository: metadata.path_with_namespace || projectPath, branch, files, characters: text.length }, null, 2)}\n`),
    ]);
    return {
      kind: "repository", sourceUrl: url, status: text.length >= 200 ? "pass" : "unknown",
      title: metadata.path_with_namespace || projectPath, text,
      reason: text.length >= 200 ? `Extracted ${files.length} public text files without executing repository code` : "No readable public repository content was extracted",
      textPath: toRelative(outputRoot, textFile), metadataPath: toRelative(outputRoot, manifestFile), items: files,
    };
  } catch (cause) {
    return { kind: "repository", sourceUrl: url, status: "unknown", title: projectPath, text: "", reason: cause instanceof Error ? cause.message : String(cause) };
  }
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
    if (!text) return { kind: "video", sourceUrl: url, status: "unknown", title, text: "", reason: "The public caption track contained no readable transcript" };
    return saveTranscript({ url, title, text, language: track.languageCode, outputRoot, relativeDir, reason: `Extracted public ${track.languageCode || "unknown-language"} captions` });
  } catch (cause) {
    return { kind: "video", sourceUrl: url, status: "unknown", title: "YouTube video", text: "", reason: cause instanceof Error ? cause.message : String(cause) };
  } finally {
    await page.close();
  }
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

async function fetchJson(url: string, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status} for ${url}`);
  return response.json();
}

function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname.endsWith("youtube.com")) return url.searchParams.get("v") || (url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] ?? null : null);
    return null;
  } catch { return null; }
}

function isRepositoryUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    return hostname === "github.com" || hostname === "gitlab.com";
  } catch { return false; }
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
