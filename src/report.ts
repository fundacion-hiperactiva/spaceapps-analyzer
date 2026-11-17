import { coverageExplanation, findingLabel, findingMessage, localizedLink, statusLabel, tr, translatedLimitations, type Locale } from "./i18n.js";
import type { EventAudit, TeamAudit } from "./types.js";

export function renderMarkdown(audit: EventAudit, locale: Locale): string {
  const rows = audit.teams.map((team) => {
    const failures = team.findings.filter((finding) => finding.status !== "pass").length;
    return `| ${escapeCell(team.name)} | ${statusIcon(team.status)} ${statusLabel(locale, team.status)} | ${escapeCell(team.challenge.title || tr(locale, "unresolved"))} | ${team.members.length || "-"} | ${failures} |`;
  }).join("\n");
  const details = audit.teams.map((team) => renderTeam(team, locale)).join("\n\n");
  const rosterRows = audit.roster?.teams.map((team) => `| ${escapeCell(team.name)} | ${rosterStatus(locale, team.status)} | ${escapeCell(team.challenge || "-")} | ${team.audited ? tr(locale, "yes") : tr(locale, "no")} |`).join("\n") ?? "";
  const rosterSection = audit.roster ? `\n## ${tr(locale, "roster")}\n\n${tr(locale, "rosterHelp")}\n\n- ${tr(locale, "registered")}: **${audit.roster.registered}**\n- ${tr(locale, "completedTeams")}: **${audit.roster.completed}**\n- ${tr(locale, "noShow")}: **${audit.roster.noShow}**\n- ${tr(locale, "abandoned")}: **${audit.roster.abandoned}**\n- ${tr(locale, "source")}: ${link(audit.roster.sourceUrl, audit.roster.sourceUrl)}\n\n| ${tr(locale, "team")} | ${tr(locale, "rosterStatus")} | ${tr(locale, "challenge")} | ${tr(locale, "auditIncluded")} |\n| --- | --- | --- | --- |\n${rosterRows}\n` : "";

  return `# ${locale === "es" ? "Auditoría de sede de Space Apps" : "Space Apps local-event audit"}

## ${tr(locale, "auditScope")}

| ${tr(locale, "field")} | ${tr(locale, "value")} |
| --- | --- |
| ${tr(locale, "event")} | ${escapeCell(audit.event.name)} |
| ${tr(locale, "country")} | ${escapeCell(audit.event.country)} |
| ${tr(locale, "year")} | ${audit.event.year} |
| ${tr(locale, "source")} | ${link(audit.sourceUrl, audit.sourceUrl)} |
${audit.supplementalSources?.map((url) => `| ${tr(locale, "supplementalSources")} | ${link(url, url)} |`).join("\n") ?? ""}
| ${tr(locale, "started")} | ${audit.startedAt} |
| ${locale === "es" ? "Finalización" : "Completed"} | ${audit.completedAt} |
| ${tr(locale, "registered")} | ${audit.roster?.registered ?? audit.summary.totalTeams} |
| ${tr(locale, "audited")} | ${audit.summary.totalTeams} |

## ${tr(locale, "executiveSummary")}

- ${tr(locale, "pass")}: **${audit.summary.pass}**
- ${tr(locale, "warn")}: **${audit.summary.warn}**
- ${tr(locale, "fail")}: **${audit.summary.fail}**
- ${tr(locale, "unknown")}: **${audit.summary.unknown}**
- ${tr(locale, "findingsRecorded")}: **${audit.summary.findings}**

| ${tr(locale, "team")} | ${tr(locale, "result")} | ${tr(locale, "challenge")} | ${tr(locale, "membersFound")} | ${tr(locale, "discrepancies")} |
| --- | --- | --- | ---: | ---: |
${rows || "| - | - | - | - | - |"}
${rosterSection}

## ${tr(locale, "teamAudits")}

${details || tr(locale, "noTeams")}

## ${tr(locale, "method")}

${tr(locale, "methodologyIntro")}

${translatedLimitations(locale, audit.limitations).map((item) => `- ${item}`).join("\n")}
`;
}

function renderTeam(team: TeamAudit, locale: Locale): string {
  const nonPass = team.findings.filter((finding) => finding.status !== "pass");
  const links = team.links.map((item) => {
    const localized = localizedLink(locale, item);
    const evidence = [item.screenshotPath ? link(`./${item.screenshotPath}`, tr(locale, "screenshot")) : "", item.textPath ? link(`./${item.textPath}`, tr(locale, "text")) : ""].filter(Boolean).join(" · ") || "-";
    return `| ${escapeCell(localized.label)} | ${statusIcon(item.status)} ${statusLabel(locale, item.status)} | ${item.httpStatus ?? "-"} | ${link(item.url, tr(locale, "source"))} | ${escapeCell(localized.reason)} | ${evidence} |`;
  }).join("\n");
  const evidence = Object.entries(team.pages).map(([name, page]) => `- ${localizedEvidenceName(locale, name)}: [${tr(locale, "screenshot")}](./${page.screenshotPath}) · [${tr(locale, "text")}](./${page.textPath}) · [HTML](./${page.htmlPath})`).join("\n");
  const challengeEvidence = team.challenge.page ? `\n- ${tr(locale, "challenge").toLowerCase()}: [${tr(locale, "screenshot")}](./${team.challenge.page.screenshotPath}) · [${tr(locale, "text")}](./${team.challenge.page.textPath}) · [HTML](./${team.challenge.page.htmlPath})` : "";

  return `### ${team.name}

**${tr(locale, "result")}:** ${statusIcon(team.status)} ${statusLabel(locale, team.status).toUpperCase()}  
**${tr(locale, "nasaTeamPage")}:** ${link(team.url, team.url)}  
**${tr(locale, "challenge")}:** ${team.challenge.url ? link(team.challenge.url, team.challenge.title || team.challenge.url) : escapeCell(team.challenge.title || tr(locale, "unresolved"))}  
**${tr(locale, "membersFound")}:** ${team.members.length ? team.members.map(escapeCell).join(", ") : tr(locale, "noneExtracted")}

#### ${tr(locale, "submissionCompleteness")}

| ${locale === "es" ? "Verificación" : "Check"} | ${tr(locale, "result")} | ${locale === "es" ? "Detalle" : "Detail"} |
| --- | --- | --- |
${team.findings.filter((finding) => ["PROJECT_SUBMITTED", "PROJECT_SUMMARY", "PROJECT_DETAILS", "DEMO_LINK", "PROJECT_LINK", "NASA_DATA"].includes(finding.code)).map((finding) => `| ${findingLabel(locale, finding.code)} | ${statusIcon(finding.status)} ${statusLabel(locale, finding.status)} | ${escapeCell(findingMessage(locale, finding))} |`).join("\n")}

#### ${tr(locale, "publicLinks")}

| ${tr(locale, "link")} | ${tr(locale, "result")} | HTTP | URL | ${tr(locale, "reason")} | ${tr(locale, "evidence")} |
| --- | --- | ---: | --- | --- | --- |
${links || `| - | ${tr(locale, "unknown")} | - | - | ${tr(locale, "noExternal")} | - |`}

#### ${tr(locale, "challengeCoverage")}

- ${tr(locale, "signal")}: **${statusLabel(locale, team.challengeCoverage.status)}**${team.challengeCoverage.ratio === null ? "" : ` (${Math.round(team.challengeCoverage.ratio * 100)}%)`}
- ${tr(locale, "matchedTerms")}: ${team.challengeCoverage.matchedTerms.join(", ") || tr(locale, "none")}
- ${tr(locale, "missingTerms")}: ${team.challengeCoverage.missingTerms.join(", ") || tr(locale, "none")}
- ${tr(locale, "interpretation")}: ${coverageExplanation(locale, team.challengeCoverage.status)}

#### ${tr(locale, "discrepancies")}

${nonPass.length ? nonPass.map((finding) => `- **${findingLabel(locale, finding.code)}** (${statusLabel(locale, finding.status)}): ${findingMessage(locale, finding)}`).join("\n") : tr(locale, "noDiscrepancies")}

#### ${tr(locale, "evidence")}

${evidence || (locale === "es" ? "No se capturó evidencia." : "No evidence captured.")}${challengeEvidence}`;
}

function localizedEvidenceName(locale: Locale, value: string): string {
  const names: Record<string, [string, string]> = { page: ["page", "página"], about: ["about", "acerca"], project: ["project", "proyecto"], members: ["members", "miembros"] };
  return names[value]?.[locale === "es" ? 1 : 0] ?? value;
}
function statusIcon(status: string): string { return status === "pass" ? "✅" : status === "fail" ? "❌" : status === "warn" ? "⚠️" : "❔"; }
function rosterStatus(locale: Locale, status: string): string { return status === "completed" ? tr(locale, "completedTeams") : status === "no_show" ? tr(locale, "noShow") : status === "abandoned" ? tr(locale, "abandoned") : tr(locale, "unknown"); }
function escapeCell(value: unknown): string { return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " "); }
function link(url: string, label: string): string { return `[${label.replace(/]/g, "\\]")}](${url.replace(/\)/g, "%29")})`; }
