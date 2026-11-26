import type { Page } from "playwright";
import type { ProjectEvidence, RosterEntry, RosterStatus } from "./types.js";
import { cleanText, slugify } from "./utils.js";

export interface TeamListing {
  name: string;
  url: string;
  challenge: string;
  location: string;
}

export async function eventIdentity(page: Page): Promise<{ name: string; country: string }> {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1,h2")).map((node) => (node.textContent || "").trim()).filter(Boolean);
    return { name: headings[1] || headings[0] || "Unknown event", country: headings[0] || "" };
  });
}

export async function eventTeamListings(page: Page, year: string): Promise<TeamListing[]> {
  const prefix = `/${year}/find-a-team/`;
  return page.locator(`a[href*="${prefix}"]`).evaluateAll((links, expectedPrefix) => {
    const seen = new Set<string>();
    return links.flatMap((node) => {
      const anchor = node as HTMLAnchorElement;
      const url = new URL(anchor.href);
      if (url.pathname === expectedPrefix || seen.has(url.href)) return [];
      seen.add(url.href);
      const text = (anchor.innerText || anchor.textContent || "").trim();
      const heading = anchor.querySelector("h1,h2,h3")?.textContent?.trim() || url.pathname.split("/").filter(Boolean).at(-1) || "Unknown team";
      const challenge = text.match(/Challenge\s*([\s\S]*?)(?:Desired Skills|Languages Spoken|$)/i)?.[1]?.trim() || "";
      const location = text.match(/Location\s*([\s\S]*?)Challenge/i)?.[1]?.trim() || "";
      return [{ name: heading, url: url.href, challenge, location }];
    });
  }, prefix);
}

export async function extractRoster(page: Page): Promise<Omit<RosterEntry, "audited">[]> {
  return page.locator("article").evaluateAll((articles) => articles.flatMap((article) => {
    const heading = article.querySelector("h1,h2,h3");
    if (!heading) return [];
    const name = (heading.textContent || "").trim();
    const text = (article.textContent || "").replace(/\s+/g, " ").trim();
    const link = article.querySelector('a[href*="/find-a-team/"]') as HTMLAnchorElement | null;
    const challengeLink = article.querySelector('a[href*="/challenges/"]') as HTMLAnchorElement | null;
    let status: RosterStatus = "unknown";
    if (/ABANDON(?:Ó|O)|WITHDREW|ABANDONED/i.test(text)) status = "abandoned";
    else if (/NO SE PRESENT(?:Ó|O)|DID NOT PRESENT|NO[- ]SHOW/i.test(text)) status = "no_show";
    else if (/PRESENT(?:Ó|O)|COMPLETED|PRESENTED/i.test(text)) status = "completed";
    return [{ name, url: link?.href ?? null, challenge: (challengeLink?.textContent || "").trim(), status }];
  }));
}

export async function visibleTabPanelText(page: Page): Promise<string> {
  const panels = page.getByRole("tabpanel");
  const count = await panels.count();
  for (let index = 0; index < count; index += 1) {
    const panel = panels.nth(index);
    if (await panel.isVisible()) {
      const text = cleanText(await panel.innerText());
      if (text) return text;
    }
  }
  return "";
}

export async function extractProject(page: Page): Promise<ProjectEvidence> {
  const panel = await selectedPanel(page);
  if (!panel) return emptyProject();
  const text = cleanText(await panel.innerText().catch(() => ""));
  const fields = await panel.locator("h2,h3,h4").evaluateAll((headings) => headings.map((heading) => {
    const container = heading.parentElement;
    const title = (heading.textContent || "").trim();
    const value = (container?.innerText || "").trim().slice(title.length).trim();
    const links = Array.from(container?.querySelectorAll("a[href]") || []).map((node) => (node as HTMLAnchorElement).href)
      .filter((url) => url.startsWith("http://") || url.startsWith("https://"));
    return { title, value, links };
  }));
  const field = (title: string) => fields.find((item) => item.title.toLowerCase() === title.toLowerCase());

  const demoUrl = field("Project Demonstration")?.links[0] ?? null;
  const projectUrl = field("Project")?.links[0] ?? null;
  const resourceUrls = [...new Set([
    ...fields.flatMap((item) => item.links),
    ...fields.flatMap((item) => extractHttpUrls(item.value)),
  ])];
  const summary = cleanText(field("Summary")?.value || "");
  const details = cleanText(field("Project Details")?.value || "");
  const nasaData = cleanText(field("NASA Data")?.value || "");
  const nameMatch = text.match(/User-Generated Content[\s\S]*?\n([^\n]+)\nSummary/i);

  return {
    name: cleanText(nameMatch?.[1] || ""),
    summary,
    details,
    nasaData,
    demoUrl,
    projectUrl,
    resourceUrls,
    submitted: Boolean(summary || details || demoUrl || projectUrl),
  };
}

export function extractHttpUrls(value: string): string[] {
  return [...value.matchAll(/https?:\/\/[^\s<>"']+/gi)].map((match) => match[0].replace(/[),.;\]}]+$/g, ""));
}

export async function extractChallengeLink(page: Page, year: string, fallbackTitle = ""): Promise<{ title: string; url: string | null }> {
  const links = await page.locator(`a[href*="/${year}/challenges/"]`).evaluateAll((nodes) => nodes.map((node) => {
    const anchor = node as HTMLAnchorElement;
    return { title: (anchor.textContent || "").trim(), url: anchor.href };
  }));
  const specific = links.find((link) => new URL(link.url).pathname !== `/${year}/challenges/`);
  if (specific) return specific;
  if (fallbackTitle) {
    return {
      title: fallbackTitle,
      url: new URL(`/${year}/challenges/${slugify(fallbackTitle)}/`, page.url()).href,
    };
  }
  return { title: "", url: null };
}

export async function extractMembers(page: Page): Promise<string[]> {
  const panel = await selectedPanel(page);
  if (!panel) return [];
  const candidates = await panel.locator("h2,h3,h4,[class*='name'],[class*='username']").allTextContents();
  return [...new Set(candidates.map(cleanText).filter((value) => value && !/members?|team information/i.test(value)))];
}

async function selectedPanel(page: Page) {
  const panels = page.getByRole("tabpanel");
  const count = await panels.count();
  for (let index = 0; index < count; index += 1) {
    const panel = panels.nth(index);
    if (await panel.isVisible() && cleanText(await panel.innerText().catch(() => ""))) return panel;
  }
  return null;
}

function emptyProject(): ProjectEvidence {
  return { name: "", summary: "", details: "", nasaData: "", demoUrl: null, projectUrl: null, resourceUrls: [], submitted: false };
}

