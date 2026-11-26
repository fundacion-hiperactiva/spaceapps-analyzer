import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { collectRepository } from "../dist/content.js";
import { evaluateTeam } from "../dist/analyze.js";
import { extractHttpUrls } from "../dist/extract.js";

const auditDir = path.resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Usage: node scripts/enrich-text-repositories.mjs <audit-directory>");
const auditPath = path.join(auditDir, "audit.json");
const audit = JSON.parse(await readFile(auditPath, "utf8"));
const timeoutMs = 120_000;
let enriched = 0;

for (const team of audit.teams) {
  const writtenUrls = extractHttpUrls([team.project.summary, team.project.details, team.project.nasaData].join("\n"));
  team.project.resourceUrls = [...new Set([...(team.project.resourceUrls || []), ...writtenUrls])];
  const repositoryUrl = team.project.resourceUrls.find((value) => {
    try { return ["github.com", "gitlab.com"].includes(new URL(value).hostname.replace(/^www\./, "")); }
    catch { return false; }
  });
  if (!repositoryUrl || team.contentEvidence.some((item) => item.kind === "repository" && item.status === "pass")) continue;

  const repositoryEvidence = await collectRepository(repositoryUrl, auditDir, `teams/${team.slug}/content`, timeoutMs);
  team.contentEvidence = [...team.contentEvidence.filter((item) => item.kind !== "repository"), ...repositoryEvidence];
  const result = evaluateTeam({ project: team.project, challenge: team.challenge, links: team.links, contentEvidence: team.contentEvidence });
  team.projectLanguage = result.language;
  team.challengeCoverage = result.coverage;
  team.evaluationCriteria = result.criteria;
  team.findings = result.findings;
  team.status = result.status;
  enriched += 1;
}

audit.summary = {
  totalTeams: audit.teams.length,
  pass: audit.teams.filter((team) => team.status === "pass").length,
  warn: audit.teams.filter((team) => team.status === "warn").length,
  fail: audit.teams.filter((team) => team.status === "fail").length,
  unknown: audit.teams.filter((team) => team.status === "unknown").length,
  findings: audit.teams.reduce((total, team) => total + team.findings.filter((finding) => finding.status !== "pass").length, 0),
};
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(`Enriched ${enriched} team(s) with repositories written as plain text.`);
