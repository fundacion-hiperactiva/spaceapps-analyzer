import type { AuditFinding, AuditStatus, ChallengeEvidence, ContentEvidence, LinkCheck, ProjectEvidence } from "./types.js";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "build", "challenge", "create", "data", "does", "enable", "for", "from",
  "have", "into", "more", "nasa", "that", "the", "their", "them", "then", "this", "through", "using", "with", "your",
  "como", "con", "crear", "datos", "del", "desafio", "desde", "esta", "este", "para", "por", "que", "una", "uno", "usar",
]);

interface EvidenceSource { label: string; text: string }

export function evaluateTeam(input: {
  project: ProjectEvidence;
  challenge: ChallengeEvidence;
  links: LinkCheck[];
  contentEvidence?: ContentEvidence[];
}): {
  findings: AuditFinding[];
  coverage: ReturnType<typeof challengeCoverage>;
  status: AuditStatus;
} {
  const { project, challenge, links, contentEvidence = [] } = input;
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

  const coverage = challengeCoverage(project, challenge, contentEvidence);
  if (coverage.status !== "pass") {
    findings.push({
      code: coverage.status === "unknown" ? "CHALLENGE_ALIGNMENT_UNKNOWN" : "LOW_CHALLENGE_COVERAGE",
      severity: "warning",
      status: coverage.status,
      message: coverage.explanation,
      evidence: [challenge.url, ...contentEvidence.filter((item) => item.text).map((item) => item.sourceUrl)].filter((value): value is string => Boolean(value)),
    });
  }

  return { findings, coverage, status: overallStatus(findings) };
}

export function challengeCoverage(project: ProjectEvidence, challenge: ChallengeEvidence, contentEvidence: ContentEvidence[] = []) {
  const challengeText = `${challenge.title} ${challenge.excerpt}`.trim();
  if (challengeText.length < 40) {
    return {
      status: "unknown" as const,
      ratio: null,
      evidenceSources: [] as string[],
      matchedTerms: [] as string[],
      missingTerms: [] as string[],
      explanation: "The challenge brief could not be resolved, so alignment cannot be assessed",
    };
  }

  const sources: EvidenceSource[] = [{ label: "NASA submission", text: `${project.name} ${project.summary} ${project.details} ${project.nasaData}` }];
  for (const item of contentEvidence) {
    if (!item.text.trim()) continue;
    sources.push({ label: item.kind === "repository" ? "repository" : "video transcript", text: item.text });
  }

  const terms = keywordTerms(challengeText).slice(0, 28);
  const evidenceStems = new Set(sources.flatMap((source) => tokens(source.text).map((token) => token.stem)));
  const matchedTerms = terms.filter((term) => evidenceStems.has(term.stem)).map((term) => term.original);
  const missingTerms = terms.filter((term) => !evidenceStems.has(term.stem)).map((term) => term.original);
  const lexicalRatio = terms.length ? matchedTerms.length / terms.length : 0;
  const semanticSimilarity = Math.max(...sources.flatMap((source) => chunks(source.text).map((chunk) => cosine(challengeText, chunk))), 0);
  const ratio = round(lexicalRatio * 0.7 + semanticSimilarity * 0.3);
  const exactChallengeReference = normalize(project.nasaData).includes(normalize(challenge.title))
    || (challenge.url ? project.nasaData.includes(new URL(challenge.url).pathname) : false);
  const status: AuditStatus = exactChallengeReference && ratio >= 0.15
    ? "pass"
    : ratio >= 0.28
      ? "pass"
      : ratio >= 0.10
        ? "warn"
        : "fail";
  return {
    status,
    ratio,
    lexicalRatio: round(lexicalRatio),
    semanticSimilarity: round(semanticSimilarity),
    evidenceSources: sources.map((source) => source.label),
    matchedTerms,
    missingTerms,
    explanation: status === "pass"
      ? "The documented evidence has meaningful NLP coverage of the selected challenge concepts"
      : status === "warn"
        ? "Some challenge concepts are supported by the documented evidence, but coverage remains incomplete"
        : "The combined submission, repository, and transcript evidence has low documented NLP coverage of the challenge; manual review is required",
  };
}

export function overallStatus(findings: AuditFinding[]): AuditStatus {
  if (findings.some((finding) => finding.severity === "error" && finding.status === "fail")) return "fail";
  if (findings.some((finding) => finding.status === "warn" || finding.status === "fail" || finding.status === "unknown")) return "warn";
  return "pass";
}

function requireText(findings: AuditFinding[], code: string, condition: boolean, passMessage: string, failMessage: string): void {
  findings.push({ code, severity: condition ? "info" : "error", status: condition ? "pass" : "fail", message: condition ? passMessage : failMessage, evidence: [] });
}

function keywordTerms(text: string): Array<{ original: string; stem: string; count: number }> {
  const values = new Map<string, { original: string; stem: string; count: number }>();
  for (const token of tokens(text)) {
    const current = values.get(token.stem);
    if (current) current.count += 1;
    else values.set(token.stem, { ...token, count: 1 });
  }
  return [...values.values()].sort((a, b) => b.count - a.count || b.original.length - a.original.length);
}

function tokens(text: string): Array<{ original: string; stem: string }> {
  return normalize(text).split(/\s+/).filter(Boolean).flatMap((original) => {
    if (original.length < 4 || STOP_WORDS.has(original)) return [];
    const value = stem(original);
    return value.length >= 3 && !STOP_WORDS.has(value) ? [{ original, stem: value }] : [];
  });
}

function stem(value: string): string {
  let result = value;
  for (const suffix of ["amientos", "imiento", "aciones", "adores", "adoras", "acion", "mente", "idades", "idad", "iendo", "ando", "ments", "ation", "ingly", "edly", "ing", "ies", "ed", "es", "os", "as", "s"]) {
    if (result.length - suffix.length >= 4 && result.endsWith(suffix)) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }
  return result;
}

function chunks(text: string): string[] {
  const paragraphs = text.split(/\n{2,}|(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > 1_500) {
      result.push(current);
      current = "";
    }
    current += `${current ? " " : ""}${paragraph.slice(0, 1_500)}`;
  }
  if (current) result.push(current);
  return result.length ? result.slice(0, 400) : [text.slice(0, 1_500)];
}

function cosine(left: string, right: string): number {
  const a = frequencies(left);
  const b = frequencies(right);
  let dot = 0;
  for (const [term, count] of a) dot += count * (b.get(term) ?? 0);
  const normA = Math.sqrt([...a.values()].reduce((sum, value) => sum + value * value, 0));
  const normB = Math.sqrt([...b.values()].reduce((sum, value) => sum + value * value, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

function frequencies(text: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const token of tokens(text)) result.set(token.stem, (result.get(token.stem) ?? 0) + 1);
  return result;
}

function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function round(value: number): number { return Math.round(value * 10_000) / 10_000; }
