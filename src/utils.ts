import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

export async function writeUtf8(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export function toRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractYearAndSlug(url: URL): { year: string; slug: string } {
  const match = url.pathname.match(/\/(\d{4})\/local-events\/([^/]+)/i);
  if (!match?.[1] || !match[2]) {
    throw new Error("Expected a Space Apps local-event URL such as /2026/local-events/event-slug/");
  }
  return { year: match[1], slug: match[2] };
}

export function validatePublicHttpUrl(input: string): URL {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("Only http:// and https:// URLs are supported");
  }
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.hostname.endsWith('.local')) {
    throw new Error("Local and loopback URLs are not supported");
  }
  return url;
}

export async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function run(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index];
      if (item !== undefined) results[index] = await worker(item, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, run));
  return results;
}
