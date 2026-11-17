import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { evaluateTeam } from "./analyze.js";
import { captureCurrentPage, capturePage, captureTab, checkPublicLink, settle } from "./capture.js";
import { collectExternalContent } from "./content.js";
import { eventIdentity, eventTeamListings, extractChallengeLink, extractMembers, extractProject, extractRoster, visibleTabPanelText, type TeamListing } from "./extract.js";
import type { AuditOptions, CapturedPage, ChallengeEvidence, EventAudit, LinkCheck, RosterEvidence, TeamAudit } from "./types.js";
import { cleanText, extractYearAndSlug, mapLimit, slugify, validatePublicHttpUrl } from "./utils.js";

export const TOOL_VERSION = "0.2.0";

export async function auditEvent(inputUrl: string, options: AuditOptions): Promise<EventAudit> {
  const sourceUrl = validatePublicHttpUrl(inputUrl);
  const { year, slug } = extractYearAndSlug(sourceUrl);
  const startedAt = new Date().toISOString();
  const outputDir = path.resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: !options.headed });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      locale: "en-US",
      colorScheme: "light",
      serviceWorkers: "block",
      ignoreHTTPSErrors: true,
    });
    const linkContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      serviceWorkers: "block",
      ignoreHTTPSErrors: true,
    });
    const eventPage = await context.newPage();
    const eventPages: Record<string, CapturedPage> = {};
    eventPages.details = await capturePage(eventPage, sourceUrl.href, outputDir, "event/details", options.timeoutMs);
    const identity = await eventIdentity(eventPage);

    for (const tabName of ["Details", "Local Event Schedule", "Teams"]) {
      const captured = await captureTab(eventPage, tabName, outputDir, `event/${slugify(tabName)}`);
      if (captured) eventPages[slugify(tabName)] = captured;
    }
    const discovered = await eventTeamListings(eventPage, year);
    let roster: RosterEvidence | undefined;
    let eligible = discovered;
    if (options.rosterUrl) {
      const rosterUrl = validatePublicHttpUrl(options.rosterUrl);
      const rosterPage = await context.newPage();
      const captured = await capturePage(rosterPage, rosterUrl.href, outputDir, "event/roster", options.timeoutMs);
      const extracted = await extractRoster(rosterPage);
      const completedUrls = new Set(extracted.filter((team) => team.status === "completed" && team.url).map((team) => canonicalTeamUrl(team.url!)));
      eligible = discovered.filter((team) => completedUrls.has(canonicalTeamUrl(team.url)));
      const auditedUrls = new Set(eligible.map((team) => canonicalTeamUrl(team.url)));
      const teams = extracted.map((team) => ({ ...team, audited: Boolean(team.url && auditedUrls.has(canonicalTeamUrl(team.url))) }));
      roster = {
        sourceUrl: rosterUrl.href,
        page: captured,
        teams,
        registered: teams.length,
        completed: teams.filter((team) => team.status === "completed").length,
        noShow: teams.filter((team) => team.status === "no_show").length,
        abandoned: teams.filter((team) => team.status === "abandoned").length,
        unknown: teams.filter((team) => team.status === "unknown").length,
      };
      await rosterPage.close();
    }
    const listings = options.maxTeams === undefined ? eligible : eligible.slice(0, options.maxTeams);

    const teams = await mapLimit(listings, options.concurrency, (listing) => auditTeam({
      listing,
      year,
      outputDir,
      timeoutMs: options.timeoutMs,
      context,
      linkContext,
      checkExternalLinks: options.checkExternalLinks,
      extractContent: options.extractContent,
    }));

    await Promise.all([eventPage.close(), context.close(), linkContext.close()]);
    const completedAt = new Date().toISOString();
    return {
      schemaVersion: "1.0",
      toolVersion: TOOL_VERSION,
      startedAt,
      completedAt,
      sourceUrl: sourceUrl.href,
      ...(options.supplementalSources?.length
        ? { supplementalSources: options.supplementalSources.map((value) => validatePublicHttpUrl(value).href) }
        : {}),
      event: {
        name: identity.name,
        country: identity.country,
        year,
        slug,
        pages: eventPages,
      },
      teams,
      ...(roster ? { roster } : {}),
      summary: summarize(teams),
      limitations: [
        "Automated checks observe public web behavior at capture time; later availability can change.",
        "Authentication-wall detection uses status codes, redirects, and visible text patterns and can produce false positives or negatives.",
        "Challenge coverage is an explainable NLP signal combining normalized concept coverage and semantic similarity. A human judge must decide true scientific and functional compliance.",
        "Repository text is downloaded for analysis but code is never executed. Video evidence depends on captions being publicly exposed by the video provider.",
        "The CLI does not execute downloaded code, grant permissions, submit forms, or bypass access controls.",
      ],
    };
  } finally {
    await browser?.close();
  }
}

function canonicalTeamUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
}

async function auditTeam(input: {
  listing: TeamListing;
  year: string;
  outputDir: string;
  timeoutMs: number;
  context: BrowserContext;
  linkContext: BrowserContext;
  checkExternalLinks: boolean;
  extractContent: boolean;
}): Promise<TeamAudit> {
  const { listing, year, outputDir, timeoutMs, context, linkContext, checkExternalLinks, extractContent } = input;
  const teamSlug = new URL(listing.url).pathname.split("/").filter(Boolean).at(-1) || slugify(listing.name);
  const base = `teams/${teamSlug}`;
  const page = await context.newPage();
  const pages: Record<string, CapturedPage> = {};

  try {
    pages.page = await capturePage(page, listing.url, outputDir, `${base}/page`, timeoutMs);

    let about = "";
    const aboutCapture = await captureTeamTab(page, "About", outputDir, `${base}/about`);
    if (aboutCapture) {
      pages.about = aboutCapture;
      about = await visibleTabPanelText(page);
    }
    const aboutChallengeLink = await extractChallengeLink(page, year, listing.challenge);

    const projectCapture = await captureTeamTab(page, "Project", outputDir, `${base}/project`);
    if (projectCapture) pages.project = projectCapture;
    const project = await extractProject(page);
    const projectChallengeLink = await extractChallengeLink(page, year, listing.challenge);
    const challengeLink = projectChallengeLink.url ? projectChallengeLink : aboutChallengeLink;

    const membersCapture = await captureTeamTab(page, "Members", outputDir, `${base}/members`);
    if (membersCapture) pages.members = membersCapture;
    const members = await extractMembers(page);

    const challenge = await captureChallenge({
      page,
      title: challengeLink.title || listing.challenge,
      url: challengeLink.url,
      fallbackExcerpt: challengeExcerptFromAbout(about),
      outputDir,
      relativeBase: `${base}/challenge`,
      timeoutMs,
    });

    const links: LinkCheck[] = [];
    if (checkExternalLinks) {
      const candidates = uniqueLinks([
        ["Project demonstration", project.demoUrl],
        ["Project/prototype", project.projectUrl],
      ]);
      for (const [label, url] of candidates) {
        links.push(await checkPublicLink(linkContext, label, url, outputDir, `${base}/external`, timeoutMs));
      }
    }

    const contentEvidence = extractContent
      ? await collectExternalContent({ context: linkContext, projectUrl: project.projectUrl, demoUrl: project.demoUrl, outputRoot: outputDir, relativeDir: `${base}/content`, timeoutMs })
      : [];
    const result = evaluateTeam({ project, challenge, links, contentEvidence });
    return {
      name: listing.name,
      slug: teamSlug,
      url: listing.url,
      location: listing.location,
      members,
      about,
      pages,
      project,
      challenge,
      links,
      contentEvidence,
      challengeCoverage: result.coverage,
      findings: result.findings,
      status: result.status,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return failedTeam(listing, teamSlug, pages, message);
  } finally {
    await page.close();
  }
}

async function captureTeamTab(page: Page, name: string, outputRoot: string, relativeBase: string): Promise<CapturedPage | null> {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}$`, "i") });
  if (!(await tab.count())) return null;
  await tab.first().click();
  const controls = await tab.first().getAttribute("aria-controls");
  if (controls) await page.locator(`#${controls}`).waitFor({ state: "visible", timeout: 10_000 });
  else await settle(page, 10_000).catch(() => undefined);
  return captureCurrentPage(page, outputRoot, relativeBase, null);
}

async function captureChallenge(input: {
  page: Page;
  title: string;
  url: string | null;
  fallbackExcerpt: string;
  outputDir: string;
  relativeBase: string;
  timeoutMs: number;
}): Promise<ChallengeEvidence> {
  if (!input.url) return { title: input.title, url: null, excerpt: input.fallbackExcerpt };
  const challengePage = await input.page.context().newPage();
  try {
    const captured = await capturePage(challengePage, input.url, input.outputDir, input.relativeBase, input.timeoutMs);
    const panelText = await visibleTabPanelText(challengePage).catch(() => "");
    const mainText = cleanText(await challengePage.locator("main").innerText().catch(() => captured.text));
    const candidate = panelText.length >= 120 ? panelText : mainText;
    const missingPage = /page not found|couldn'?t find what you were looking for|no results found/i.test(candidate);
    const excerpt = missingPage && input.fallbackExcerpt.length >= 120 ? input.fallbackExcerpt : candidate;
    return { title: input.title || await primaryHeading(challengePage), url: input.url, excerpt, page: captured };
  } finally {
    await challengePage.close();
  }
}

function challengeExcerptFromAbout(value: string): string {
  const match = value.match(/ABOUT THE CHALLENGE\s+([\s\S]*?)(?:\s+Team Information|\s+Local Event|$)/i);
  return cleanText(match?.[1] ?? "");
}

async function primaryHeading(page: Page): Promise<string> {
  return cleanText(await page.locator("h1").first().innerText().catch(() => ""));
}

function uniqueLinks(entries: Array<[string, string | null]>): Array<[string, string]> {
  const seen = new Set<string>();
  return entries.flatMap(([label, url]) => {
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [[label, url]];
  });
}

function failedTeam(listing: TeamListing, slug: string, pages: Record<string, CapturedPage>, error: string): TeamAudit {
  return {
    name: listing.name,
    slug,
    url: listing.url,
    location: listing.location,
    members: [],
    about: "",
    pages,
    project: { name: "", summary: "", details: "", nasaData: "", demoUrl: null, projectUrl: null, submitted: false },
    challenge: { title: listing.challenge, url: null, excerpt: "" },
    links: [],
    contentEvidence: [],
    challengeCoverage: { status: "unknown", ratio: null, matchedTerms: [], missingTerms: [], explanation: "Team crawl failed" },
    findings: [{ code: "TEAM_CRAWL_FAILED", severity: "error", status: "fail", message: error, evidence: [listing.url] }],
    status: "fail",
  };
}

function summarize(teams: TeamAudit[]): EventAudit["summary"] {
  return {
    totalTeams: teams.length,
    pass: teams.filter((team) => team.status === "pass").length,
    warn: teams.filter((team) => team.status === "warn").length,
    fail: teams.filter((team) => team.status === "fail").length,
    unknown: teams.filter((team) => team.status === "unknown").length,
    findings: teams.reduce((total, team) => total + team.findings.filter((finding) => finding.status !== "pass").length, 0),
  };
}
