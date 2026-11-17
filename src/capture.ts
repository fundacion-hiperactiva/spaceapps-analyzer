import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Page, Response } from "playwright";
import type { CapturedPage, LinkCheck } from "./types.js";
import { cleanText, shortHash, slugify, toRelative, validatePublicHttpUrl, writeUtf8 } from "./utils.js";

const LOGIN_PATTERNS = [
  /sign in to continue/i,
  /you need access/i,
  /request access/i,
  /access denied/i,
  /permission denied/i,
  /private (?:repository|project|video|file)/i,
  /this (?:video|file|page) is private/i,
];

export async function settle(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 7_500) }).catch(() => undefined);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  }).catch(() => undefined);
}

export async function capturePage(
  page: Page,
  url: string,
  outputRoot: string,
  relativeBase: string,
  timeoutMs: number,
): Promise<CapturedPage> {
  const base = path.join(outputRoot, relativeBase);
  await mkdir(path.dirname(base), { recursive: true });
  let response: Response | null = null;
  let error: string | undefined;
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await settle(page, timeoutMs);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return captureCurrentPage(page, outputRoot, relativeBase, response?.status() ?? null, error);
}

export async function captureCurrentPage(
  page: Page,
  outputRoot: string,
  relativeBase: string,
  httpStatus: number | null,
  error?: string,
): Promise<CapturedPage> {
  const base = path.join(outputRoot, relativeBase);
  const screenshotPath = `${base}.png`;
  const htmlPath = `${base}.html`;
  const textPath = `${base}.txt`;
  await mkdir(path.dirname(base), { recursive: true });

  const [title, html, text] = await Promise.all([
    page.title().catch(() => ""),
    page.content().catch(() => ""),
    page.locator("body").innerText().catch(() => ""),
  ]);
  await Promise.all([
    page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" }).catch(() => undefined),
    writeUtf8(htmlPath, html),
    writeUtf8(textPath, cleanText(text)),
  ]);
  const result: CapturedPage = {
    url: page.url(),
    finalUrl: page.url(),
    title,
    httpStatus,
    capturedAt: new Date().toISOString(),
    screenshotPath: toRelative(outputRoot, screenshotPath),
    htmlPath: toRelative(outputRoot, htmlPath),
    textPath: toRelative(outputRoot, textPath),
    text: cleanText(text),
  };
  if (error) result.error = error;
  return result;
}

export async function captureTab(
  page: Page,
  tabName: string,
  outputRoot: string,
  relativeBase: string,
): Promise<CapturedPage | null> {
  const tab = page.getByRole("tab", { name: new RegExp(`^${escapeRegex(tabName)}$`, "i") });
  if (!(await tab.count())) return null;
  await tab.first().click();
  await page.locator('[role="tab"][aria-selected="true"]')
    .filter({ hasText: new RegExp(`^${escapeRegex(tabName)}$`, "i") })
    .waitFor({ state: "visible", timeout: 5_000 });
  const controls = await tab.first().getAttribute("aria-controls");
  if (controls) await page.locator(`#${controls}`).waitFor({ state: "visible", timeout: 5_000 });
  if (/^teams$/i.test(tabName)) {
    await page.locator('a[href*="/find-a-team/"]:not([href$="/find-a-team/"])').first()
      .waitFor({ state: "attached", timeout: 10_000 })
      .catch(() => undefined);
    await loadAllTeams(page);
  }
  return captureCurrentPage(page, outputRoot, relativeBase, null);
}

async function loadAllTeams(page: Page): Promise<void> {
  const links = page.locator('a[href*="/find-a-team/"]:not([href$="/find-a-team/"])');
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const expected = Number(bodyText.match(/(?:returning|mostrando|devolviendo)\s+(\d+)\s+teams?/i)?.[1] ?? 0);
  let previous = -1;
  let stableRounds = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const count = await links.count();
    if (expected > 0 && count >= expected) break;
    stableRounds = count === previous ? stableRounds + 1 : 0;
    if (stableRounds >= 3) break;
    previous = count;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

export async function checkPublicLink(
  context: BrowserContext,
  label: string,
  inputUrl: string,
  outputRoot: string,
  relativeDir: string,
  timeoutMs: number,
): Promise<LinkCheck> {
  const checkedAt = new Date().toISOString();
  try {
    validatePublicHttpUrl(inputUrl);
  } catch (cause) {
    return {
      label,
      url: inputUrl,
      status: "fail",
      httpStatus: null,
      finalUrl: inputUrl,
      reason: cause instanceof Error ? cause.message : String(cause),
      checkedAt,
    };
  }

  const page = await context.newPage();
  const slug = `${slugify(label)}-${shortHash(inputUrl)}`;
  const base = path.join(relativeDir, slug);
  try {
    const response = await page.goto(inputUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await settle(page, timeoutMs);
    const finalUrl = page.url();
    const title = await page.title();
    const text = cleanText(await page.locator("body").innerText().catch(() => ""));
    const screenshot = path.join(outputRoot, `${base}.png`);
    const textFile = path.join(outputRoot, `${base}.txt`);
    await Promise.all([
      page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" }).catch(() => undefined),
      writeUtf8(textFile, text),
    ]);

    const httpStatus = response?.status() ?? null;
    const loginWall = /accounts\.google\.com|\/login|\/signin/i.test(finalUrl)
      || LOGIN_PATTERNS.some((pattern) => pattern.test(`${title}\n${text.slice(0, 5_000)}`));
    const badStatus = httpStatus !== null && httpStatus >= 400;
    const empty = text.length < 30 && !/\.pdf(?:$|\?)/i.test(finalUrl);
    const status = badStatus || loginWall ? "fail" : empty ? "warn" : "pass";
    const reason = badStatus
      ? `HTTP ${httpStatus}`
      : loginWall
        ? "The destination requires authentication or access approval"
        : empty
          ? "The page loaded but exposed too little public text to confirm its contents"
          : "The destination loaded in a fresh browser context without an authentication wall";
    return {
      label,
      url: inputUrl,
      status,
      httpStatus,
      finalUrl,
      reason,
      checkedAt,
      screenshotPath: toRelative(outputRoot, screenshot),
      textPath: toRelative(outputRoot, textFile),
    };
  } catch (cause) {
    return {
      label,
      url: inputUrl,
      status: "fail",
      httpStatus: null,
      finalUrl: page.url() || inputUrl,
      reason: cause instanceof Error ? cause.message : String(cause),
      checkedAt,
    };
  } finally {
    await page.close();
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
