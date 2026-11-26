import { coverageExplanation, findingLabel, findingMessage, localizedLink, statusLabel, tr, translatedLimitations, type Locale } from "./i18n.js";
import type { EventAudit, TeamAudit } from "./types.js";
import { challengeGroups, comparisonObservation, criterionPresenceCount, criterionStatus as matrixCriterionStatus, projectApproach, resourceSummary } from "./challenge-matrix.js";

export function renderMarkdown(audit: EventAudit, locale: Locale): string {
  const rows = audit.teams.map((team) => {
    const failures = team.findings.filter((finding) => finding.status !== "pass").length;
    return `| ${escapeCell(team.name)} | ${statusIcon(team.status)} ${statusLabel(locale, team.status)} | ${escapeCell(team.challenge.title || tr(locale, "unresolved"))} | ${team.members.length || "-"} | ${failures} |`;
  }).join("\n");
  const details = audit.teams.map((team) => renderTeam(team, locale)).join("\n\n");
  const rosterRows = audit.roster?.teams.map((team) => `| ${escapeCell(team.name)} | ${rosterStatus(locale, team.status)} | ${escapeCell(team.challenge || "-")} | ${team.audited ? tr(locale, "yes") : tr(locale, "no")} |`).join("\n") ?? "";
  const rosterSection = audit.roster ? `\n## ${tr(locale, "roster")}\n\n${tr(locale, "rosterHelp")}\n\n- ${tr(locale, "registered")}: **${audit.roster.registered}**\n- ${tr(locale, "completedTeams")}: **${audit.roster.completed}**\n- ${tr(locale, "noShow")}: **${audit.roster.noShow}**\n- ${tr(locale, "abandoned")}: **${audit.roster.abandoned}**\n- ${tr(locale, "source")}: ${link(audit.roster.sourceUrl, audit.roster.sourceUrl)}\n\n| ${tr(locale, "team")} | ${tr(locale, "rosterStatus")} | ${tr(locale, "challenge")} | ${tr(locale, "auditIncluded")} |\n| --- | --- | --- | --- |\n${rosterRows}\n` : "";
  const challengeMatrix = renderChallengeMatrix(audit, locale);

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
${challengeMatrix}

## ${tr(locale, "teamAudits")}

${details || tr(locale, "noTeams")}

## ${tr(locale, "method")}

${tr(locale, "methodologyIntro")}

${translatedLimitations(locale, audit.limitations).map((item) => `- ${item}`).join("\n")}
`;
}

function renderChallengeMatrix(audit: EventAudit, locale: Locale): string {
  const groups = challengeGroups(audit.teams);
  const criteria = ["impact", "creativity", "validity", "relevance", "presentation"] as const;
  const rows = groups.flatMap((group) => group.teams.map((team) => `| ${escapeCell(group.title)} | ${link(team.url, team.name)}<br>${escapeCell(team.project.name || "-")} | ${criteria.map((key) => `${statusIcon(matrixCriterionStatus(team, key))} ${criterionStatus(locale, matrixCriterionStatus(team, key))}`).join(" | ")} | ${escapeCell(resourceSummary(team, locale))} |`)).join("\n");
  const comparisons = groups.filter((group) => group.teams.length > 1).map((group) => `### ${escapeCell(group.title)}\n\n| ${tr(locale, "team")} / ${locale === "es" ? "proyecto" : "project"} | ${locale === "es" ? "Enfoque registrado" : "Documented approach"} | ${locale === "es" ? "Criterios presentes" : "Criteria present"} | ${locale === "es" ? "Recursos" : "Resources"} |\n| --- | --- | ---: | --- |\n${group.teams.map((team) => `| **${escapeCell(team.name)}**<br>${escapeCell(team.project.name || "-")} | ${escapeCell(projectApproach(team))} | ${criterionPresenceCount(team)}/5 | ${escapeCell(resourceSummary(team, locale))} |`).join("\n")}\n\n**${locale === "es" ? "Lectura comparativa" : "Comparative reading"}:** ${escapeCell(comparisonObservation(group, locale))}`).join("\n\n");

  return `## ${locale === "es" ? "Matriz de desafíos y equipos" : "Challenge and team matrix"}\n\n${locale === "es" ? "Se omiten los desafíos sin equipos registrados en Córdoba. Los estados verifican presencia documental y no constituyen una nota." : "Challenges without registered Córdoba teams are omitted. States verify documented presence and are not a grade."}\n\n| ${tr(locale, "challenge")} | ${tr(locale, "team")} / ${locale === "es" ? "proyecto" : "project"} | ${criteria.map((key) => criterionName(locale, key)).join(" | ")} | ${locale === "es" ? "Recursos extraídos" : "Extracted resources"} |\n| --- | --- | ${criteria.map(() => ":---:").join(" | ")} | --- |\n${rows}\n\n## ${locale === "es" ? "Comparación entre equipos del mismo desafío" : "Comparison of teams in the same challenge"}\n\n${locale === "es" ? "La comparación contrasta enfoque, presencia de criterios y verificabilidad de recursos, sin ordenar ni puntuar equipos." : "The comparison contrasts approach, criteria presence, and resource verifiability without ranking or scoring teams."}\n\n${comparisons}`;
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
  const content = (team.contentEvidence ?? []).map((item) => `| ${contentKind(locale, item.kind)} | ${statusIcon(item.status)} ${statusLabel(locale, item.status)} | ${link(item.sourceUrl, tr(locale, "source"))} | ${escapeCell(translateContentReason(locale, item.reason))} | ${item.items?.length ?? item.language ?? "-"} | ${[item.textPath ? link(`./${item.textPath}`, tr(locale, "text")) : "", item.artifactPath ? link(`./${item.artifactPath}`, locale === "es" ? "artefacto local" : "local artifact") : ""].filter(Boolean).join(" · ") || "-"} |`).join("\n");
  const criteria = (team.evaluationCriteria ?? []).map((item) => `| ${criterionName(locale, item.key)} | ${statusIcon(item.status)} ${criterionStatus(locale, item.status)} | ${escapeCell(criterionExplanation(locale, item.key, item.status, item.explanation))} | ${item.evidence.map((evidence) => `${escapeCell(localizedSource(locale, evidence.source))}: “${escapeCell(evidence.excerpt)}”`).join("<br>") || "-"} |`).join("\n");

  return `### ${team.name}

**${tr(locale, "result")}:** ${statusIcon(team.status)} ${statusLabel(locale, team.status).toUpperCase()}  
**${tr(locale, "nasaTeamPage")}:** ${link(team.url, team.url)}  
**${tr(locale, "challenge")}:** ${team.challenge.url ? link(team.challenge.url, team.challenge.title || team.challenge.url) : escapeCell(team.challenge.title || tr(locale, "unresolved"))}  
**${tr(locale, "membersFound")}:** ${team.members.length ? team.members.map(escapeCell).join(", ") : tr(locale, "noneExtracted")}

#### ${tr(locale, "submissionCompleteness")}

| ${locale === "es" ? "Verificación" : "Check"} | ${tr(locale, "result")} | ${locale === "es" ? "Detalle" : "Detail"} |
| --- | --- | --- |
${team.findings.filter((finding) => ["PROJECT_SUBMITTED", "PROJECT_SUMMARY", "PROJECT_DETAILS", "DEMO_LINK", "PROJECT_LINK", "NASA_DATA", "PROJECT_LANGUAGE"].includes(finding.code)).map((finding) => `| ${findingLabel(locale, finding.code)} | ${statusIcon(finding.status)} ${statusLabel(locale, finding.status)} | ${escapeCell(findingMessage(locale, finding))} |`).join("\n")}

#### ${tr(locale, "publicLinks")}

| ${tr(locale, "link")} | ${tr(locale, "result")} | HTTP | URL | ${tr(locale, "reason")} | ${tr(locale, "evidence")} |
| --- | --- | ---: | --- | --- | --- |
${links || `| - | ${tr(locale, "unknown")} | - | - | ${tr(locale, "noExternal")} | - |`}

#### ${tr(locale, "extractedContent")}

| ${tr(locale, "contentType")} | ${tr(locale, "result")} | URL | ${tr(locale, "reason")} | ${tr(locale, "filesAnalyzed")} / ${tr(locale, "language")} | ${tr(locale, "evidence")} |
| --- | --- | --- | --- | --- | --- |
${content || `| - | ${tr(locale, "unknown")} | - | - | - | - |`}

#### ${tr(locale, "challengeCoverage")}

- ${tr(locale, "signal")}: **${statusLabel(locale, team.challengeCoverage.status)}**
- ${tr(locale, "combinedScore")}: ${percentage(team.challengeCoverage.ratio)}
- ${tr(locale, "conceptCoverage")}: ${percentage(team.challengeCoverage.lexicalRatio)}
- ${tr(locale, "semanticSimilarity")}: ${percentage(team.challengeCoverage.semanticSimilarity)}
- ${tr(locale, "evidenceSources")}: ${(team.challengeCoverage.evidenceSources ?? []).map((value) => localizedSource(locale, value)).join(", ") || tr(locale, "none")}
- ${tr(locale, "matchedTerms")}: ${team.challengeCoverage.matchedTerms.join(", ") || tr(locale, "none")}
- ${tr(locale, "missingTerms")}: ${team.challengeCoverage.missingTerms.join(", ") || tr(locale, "none")}
- ${tr(locale, "interpretation")}: ${coverageExplanation(locale, team.challengeCoverage.status)}

#### ${locale === "es" ? "Criterios de evaluación (verificación de presencia)" : "Evaluation criteria (presence check)"}

${locale === "es" ? "Estos estados indican si el criterio está documentado; no constituyen una nota." : "These states indicate whether the criterion is documented; they are not a grade."}

| ${locale === "es" ? "Criterio" : "Criterion"} | ${locale === "es" ? "Presencia" : "Presence"} | ${locale === "es" ? "Explicación" : "Explanation"} | ${tr(locale, "evidence")} |
| --- | --- | --- | --- |
${criteria || `| - | ${criterionStatus(locale, "unknown")} | - | - |`}

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
function percentage(value: number | null | undefined): string { return value === null || value === undefined ? "-" : `${Math.round(value * 100)}%`; }
function contentKind(locale: Locale, kind: string): string { return kind === "repository" ? tr(locale, "repository") : kind === "video" ? tr(locale, "videoTranscript") : locale === "es" ? "Presentación" : "Presentation"; }
function criterionName(locale: Locale, key: string): string { const names: Record<string, [string, string]> = { impact: ["Impact", "Impacto"], creativity: ["Creativity", "Creatividad"], validity: ["Validity", "Validez"], relevance: ["Relevance", "Relevancia"], presentation: ["Presentation", "Presentación"] }; return names[key]?.[locale === "es" ? 1 : 0] ?? key; }
function criterionStatus(locale: Locale, status: string): string { const labels: Record<string, [string, string]> = { pass: ["Present", "Presente"], warn: ["Partial", "Parcial"], fail: ["Not found", "No encontrado"], unknown: ["Insufficient evidence", "Sin evidencia suficiente"] }; return labels[status]?.[locale === "es" ? 1 : 0] ?? status; }
function criterionExplanation(locale: Locale, key: string, status: string, fallback: string): string {
  if (locale === "en") return fallback;
  const messages: Record<string, Record<string, string>> = {
    impact: { pass: "La evidencia registrada identifica un problema o beneficiario y describe un impacto potencial.", warn: "La evidencia menciona impacto, pero no documenta por completo el problema, el beneficiario y el cambio esperado.", fail: "No se encontró una declaración explícita de impacto." },
    creativity: { pass: "La evidencia describe explícitamente un enfoque original, innovador o mejorado de forma significativa.", warn: "Se describe un enfoque distinto, pero su originalidad o mejora no queda completamente explícita.", fail: "No se encontró una afirmación explícita de originalidad, innovación o mejora significativa." },
    validity: { pass: "La evidencia documenta una base técnica o científica y además validación, factibilidad o usabilidad real.", warn: "Hay una base técnica o científica, pero la validación, factibilidad o usabilidad está documentada sólo parcialmente.", fail: "No se encontró una base científica/técnica clara ni evidencia de factibilidad." },
    relevance: { pass: "La evidencia conecta la solución con el desafío y documenta el uso o integración de datos relevantes.", warn: "Se menciona el desafío o los datos relevantes, pero su conexión con el método propuesto está incompleta.", fail: "No se encontró una conexión explícita entre desafío, datos relevantes y método propuesto." },
    presentation: { pass: "El material comunica el proyecto con problema, método/solución y resultado o importancia discernibles.", warn: "El proyecto se comunica, pero faltan elementos centrales explícitos de su narrativa.", fail: "El material registrado no alcanza para establecer la presencia del criterio de presentación." },
  };
  return status === "unknown" ? "No hay suficiente evidencia registrada para verificar este criterio." : messages[key]?.[status] ?? fallback;
}
function localizedSource(locale: Locale, value: string): string { if (locale === "en") return value; return value === "NASA submission" ? "entrega de NASA" : value === "repository" ? "repositorio" : value === "video transcript" ? "transcripción del video" : value; }
function translateContentReason(locale: Locale, value: string): string {
  if (locale === "en") return value;
  return value
    .replace(/Cloned the repository and indexed (\d+) text files without executing repository code/i, "Se clonó el repositorio y se indexaron $1 archivos de texto sin ejecutar su código")
    .replace(/Found a presentation in the cloned repository and extracted its text locally/i, "Se encontró una presentación en el repositorio clonado y se extrajo su texto localmente")
    .replace(/Found a presentation in the cloned repository, but little readable text could be extracted/i, "Se encontró una presentación en el repositorio clonado, pero se pudo extraer poco texto legible")
    .replace(/Downloaded the public presentation and extracted its text locally/i, "Se descargó la presentación pública y se extrajo su texto localmente")
    .replace(/Downloaded the public presentation, but little readable text could be extracted/i, "Se descargó la presentación pública, pero se pudo extraer poco texto legible")
    .replace(/Presentation download returned HTTP (\d+)/i, "La descarga de la presentación devolvió HTTP $1")
    .replace(/Extracted (\d+) public text files without executing repository code/i, "Se extrajeron $1 archivos de texto públicos sin ejecutar el código del repositorio")
    .replace(/No readable public repository content was extracted/i, "No se pudo extraer contenido público legible del repositorio")
    .replace(/No public caption track was exposed by the video/i, "El video no expuso una pista pública de subtítulos")
    .replace(/The public caption track contained no readable transcript/i, "La pista pública de subtítulos no contenía una transcripción legible")
    .replace(/Extracted public ([^ ]+) captions/i, "Se extrajeron subtítulos públicos en $1");
}
