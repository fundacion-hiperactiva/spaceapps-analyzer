import path from "node:path";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { evaluateTeam } from "../dist/analyze.js";

const auditDir = path.resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Usage: node scripts/enrich-local-presentations.mjs <audit-directory>");
const auditPath = path.join(auditDir, "audit.json");
const audit = JSON.parse(await readFile(auditPath, "utf8"));

for (const team of audit.teams) {
  const repositoryDir = path.join(auditDir, "teams", team.slug, "content", "repository");
  if (!await exists(repositoryDir)) continue;
  const extracted = (await listFiles(repositoryDir)).filter((file) => /\.(?:pdf|pptx?)\.txt$/i.test(file));
  const repository = team.contentEvidence.find((item) => item.kind === "repository");
  for (const textFile of extracted) {
    const artifact = textFile.slice(0, -4);
    const text = await readFile(textFile, "utf8");
    const artifactPath = relative(artifact);
    if (team.contentEvidence.some((item) => item.kind === "presentation" && item.artifactPath === artifactPath)) continue;
    team.contentEvidence.push({
      kind: "presentation",
      sourceUrl: repository?.sourceUrl || team.url,
      status: text.trim().length >= 80 ? "pass" : "warn",
      title: path.relative(repositoryDir, artifact).split(path.sep).join("/"),
      text,
      reason: text.trim().length >= 80
        ? "Found a presentation in the cloned repository and extracted its text locally"
        : "Found a presentation in the cloned repository, but little readable text could be extracted",
      textPath: relative(textFile),
      artifactPath,
      items: [path.basename(artifact)],
    });
  }
  const result = evaluateTeam({ project: team.project, challenge: team.challenge, links: team.links, contentEvidence: team.contentEvidence });
  team.projectLanguage = result.language;
  team.challengeCoverage = result.coverage;
  team.evaluationCriteria = result.criteria;
  team.findings = result.findings;
  team.status = result.status;
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
console.log(`Enriched ${auditPath} with locally extracted repository presentations.`);

async function exists(file) { return stat(file).then(() => true).catch(() => false); }
async function listFiles(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(file));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}
function relative(file) { return path.relative(auditDir, file).split(path.sep).join("/"); }
