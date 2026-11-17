import type { AuditFinding, AuditStatus, ChallengeEvidence, LinkCheck, ProjectEvidence } from "./types.js";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "build", "challenge", "create", "data", "does", "enable", "for", "from",
  "have", "into", "more", "nasa", "that", "the", "their", "them", "then", "this", "through", "using", "with", "your",
  "como", "con", "crear", "datos", "del", "desafio", "desde", "esta", "este", "para", "por", "que", "una", "uno", "usar",
]);

export function evaluateTeam(input: {
  project: ProjectEvidence;
  challenge: ChallengeEvidence;
  links: LinkCheck[];
}): {
  findings: AuditFinding[];
  coverage: {
    status: AuditStatus;
    ratio: number | null;
    matchedTerms: string[];
    missingTerms: string[];
    explanation: string;
  };
  status: AuditStatus;
} {
  const { project, challenge, links } = input;
  const findings: AuditFinding[] = [];

  requireText(findings, "PROJECT_SUBMITTED", project.submitted, "A project submission is present", "No project submission content was found");
  requireText(findings, "PROJECT_SUMMARY", project.summary.length >= 80, "The project includes a substantive summary", "The project summary is missing or too short");
  requireText(findings, "PROJECT_DETAILS", project.details.length >= 120, "The project includes implementation details", "Project details are missing or too short");
  requireText(findings, "DEMO_LINK", Boolean(project.demoUrl), "A demonstration link is documented", "The project has no demonstration link");
  requireText(findings, "PROJECT_LINK", Boolean(project.projectUrl), "A project/prototype link is documented", "The project has no project or prototype link");
  requireText(findings, "NASA_DATA", project.nasaData.length >= 20, "NASA data or references are documented", "NASA data/references are missing or too short");

  for (const link of links) {
    if (link.status === "pass") continue;
    findings.push({
      code: link.status === "fail" ? "PUBLIC_LINK_INACCESSIBLE" : "PUBLIC_LINK_UNCONFIRMED",
      severity: link.status === "fail" ? "error" : "warning",
      status: link.status,
      message: `${link.label}: ${link.reason}`,
      evidence: [link.url, link.finalUrl],
    });
  }

  const coverage = challengeCoverage(project, challenge);
  if (coverage.status !== "pass") {
    findings.push({
      code: coverage.status === "unknown" ? "CHALLENGE_ALIGNMENT_UNKNOWN" : "LOW_CHALLENGE_COVERAGE",
      severity: "warning",
      status: coverage.status,
      message: coverage.explanation,
      evidence: challenge.url ? [challenge.url] : [],
    });
  }

  const status = overallStatus(findings);
  return { findings, coverage, status };
}

export function challengeCoverage(project: ProjectEvidence, challenge: ChallengeEvidence) {
  const challengeText = `${challenge.title} ${challenge.excerpt}`.trim();
  if (challengeText.length < 40) {
    return {
      status: "unknown" as const,
      ratio: null,
      matchedTerms: [],
      missingTerms: [],
      explanation: "The challenge brief could not be resolved, so alignment cannot be assessed",
    };
  }
  const projectText = normalize(`${project.name} ${project.summary} ${project.details} ${project.nasaData}`);
  const terms = keywords(challengeText).slice(0, 24);
  const matchedTerms = terms.filter((term) => projectText.includes(term));
  const missingTerms = terms.filter((term) => !projectText.includes(term));
  const ratio = terms.length ? matchedTerms.length / terms.length : null;
  const exactChallengeReference = project.nasaData.toLowerCase().includes(challenge.title.toLowerCase())
    || (challenge.url ? project.nasaData.includes(new URL(challenge.url).pathname) : false);
  const status: AuditStatus = ratio === null
    ? "unknown"
    : exactChallengeReference && ratio >= 0.25
      ? "pass"
      : ratio >= 0.18
        ? "warn"
        : "fail";
  return {
    status,
    ratio,
    matchedTerms,
    missingTerms,
    explanation: status === "pass"
      ? "The submission cites the selected challenge and covers a meaningful subset of its specific concepts"
      : status === "warn"
        ? "Some challenge concepts are present, but the documented evidence is incomplete or the challenge is not cited explicitly"
        : "The documented project has low lexical coverage of the challenge brief; manual semantic review is required",
  };
}

export function overallStatus(findings: AuditFinding[]): AuditStatus {
  if (findings.some((finding) => finding.severity === "error" && finding.status === "fail")) return "fail";
  if (findings.some((finding) => finding.status === "warn" || finding.status === "fail" || finding.status === "unknown")) return "warn";
  return "pass";
}

function requireText(findings: AuditFinding[], code: string, condition: boolean, passMessage: string, failMessage: string): void {
  findings.push({
    code,
    severity: condition ? "info" : "error",
    status: condition ? "pass" : "fail",
    message: condition ? passMessage : failMessage,
    evidence: [],
  });
}

function keywords(text: string): string[] {
  const counts = new Map<string, number>();
  for (const token of normalize(text).split(/\s+/)) {
    if (token.length < 4 || STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(([term]) => term);
}

function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
}
