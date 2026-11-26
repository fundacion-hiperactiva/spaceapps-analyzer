import type { ChallengeEvidence, ContentEvidence, EvaluationCriterionCheck, EvaluationCriterionKey, ProjectEvidence } from "./types.js";

interface Source { label: string; text: string }
interface Criterion { key: EvaluationCriterionKey; dimensions: RegExp[]; present: string; partial: string; absent: string }

const CRITERIA: Criterion[] = [
  { key: "impact", dimensions: [/(?:problem|need|risk|challenge|issue|problema|necesidad|riesgo)/i, /(?:impact|benefit|help|improv|reduce|prevent|save|assist|beneficio|ayuda|mejora|reduc|prev)/i, /(?:people|community|users?|society|environment|astronauts?|crews?|farmers?|students?|patients?|personas|comunidad|usuarios?|sociedad|ambiente|astronautas?|tripulaci[oó]n|productores?|estudiantes?|pacientes?)/i], present: "The recorded evidence identifies a problem or beneficiary and describes a potential impact.", partial: "The recorded evidence mentions impact, but does not document all of the problem, beneficiary, and expected change.", absent: "No explicit impact statement was found in the recorded evidence." },
  { key: "creativity", dimensions: [/(?:novel|original|innovative|innovation|new approach|unique|creative|noved|original|innov|nuevo enfoque|creativ)/i, /(?:unlike|different|instead|combine|adapt|improv|alternative|diferent|combina|adapta|mejora|alternativ)/i], present: "The recorded evidence explicitly describes an original, innovative, or meaningfully improved approach.", partial: "A distinct approach is described, but its originality or improvement over existing ideas is not fully explicit.", absent: "No explicit originality, innovation, or meaningful improvement claim was found." },
  { key: "validity", dimensions: [/(?:research|scientific|science|model|algorithm|method|evidence|data|investig|cient[ií]fic|modelo|algorit|m[eé]todo|evidencia|datos)/i, /(?:test|validat|verify|accuracy|result|prototype|experiment|prueba|valid|verific|precisi[oó]n|resultado|prototipo|experimento)/i, /(?:feasib|usable|usability|accessible|real.world|deploy|implement|practical|factib|usab|accesib|mundo real|desplieg|implement|pr[aá]ctic)/i], present: "The recorded evidence documents a technical or scientific basis plus validation, feasibility, or real-world usability.", partial: "A technical or scientific basis is present, but validation, feasibility, or usability is only partly documented.", absent: "No clear scientific/technical basis or feasibility evidence was found." },
  { key: "relevance", dimensions: [/(?:challenge|desaf[ií]o|mission|misi[oó]n)/i, /(?:nasa|earthdata|modis|viirs|spherex|landsat|satellite|space agency|sat[eé]lite)/i, /(?:integrat|dataset|api|source|input|use[s|d]? data|integra|conjunto de datos|fuente|entrada|usa datos)/i], present: "The recorded evidence connects the solution to the selected challenge and documents use or integration of relevant data.", partial: "The challenge or relevant data is mentioned, but the connection to the proposed method is incomplete.", absent: "No explicit connection between the challenge, relevant data, and the proposed method was found." },
  { key: "presentation", dimensions: [/(?:summary|overview|problem|objective|resumen|descripci[oó]n|problema|objetivo)/i, /(?:solution|method|approach|how it works|soluci[oó]n|m[eé]todo|enfoque|funcionamiento)/i, /(?:result|impact|conclusion|next steps|resultado|impacto|conclusi[oó]n|pr[oó]ximos pasos)/i], present: "The recorded material communicates the project with a discernible problem, method/solution, and outcome or significance.", partial: "The project is communicated, but one or more core narrative elements are not explicit in the recorded material.", absent: "The recorded material does not contain enough structured project communication to establish presentation coverage." },
];

export function checkEvaluationCriteria(project: ProjectEvidence, challenge: ChallengeEvidence, content: ContentEvidence[]): EvaluationCriterionCheck[] {
  const sources: Source[] = [
    { label: "NASA submission", text: [project.name, project.summary, project.details, project.nasaData].join("\n") },
    ...content.filter((item) => item.text.trim()).map((item) => ({ label: item.kind === "video" ? "video transcript" : item.kind, text: item.text })),
  ];
  const hasEvidence = sources.some((source) => source.text.trim().length >= 40);
  return CRITERIA.map((criterion) => {
    const dimensions = criterion.dimensions.map((pattern) => findEvidence(pattern, sources)).filter((value): value is { source: string; excerpt: string } => Boolean(value));
    if (criterion.key === "relevance" && challenge.title && normalize(sources.map((source) => source.text).join(" ")).includes(normalize(challenge.title))) {
      dimensions.unshift({ source: "NASA submission", excerpt: `Selected challenge: ${challenge.title}` });
    }
    const required = criterion.key === "creativity" ? 2 : 3;
    const unique = dimensions.filter((item, index) => dimensions.findIndex((other) => other.excerpt === item.excerpt) === index);
    const status = !hasEvidence ? "unknown" : dimensions.length >= required ? "pass" : dimensions.length ? "warn" : "fail";
    return { key: criterion.key, status, explanation: status === "pass" ? criterion.present : status === "warn" ? criterion.partial : status === "fail" ? criterion.absent : "There is not enough recorded evidence to check this criterion.", evidence: unique.slice(0, 3) };
  });
}

function findEvidence(pattern: RegExp, sources: Source[]): { source: string; excerpt: string } | null {
  for (const source of sources) {
    const match = pattern.exec(source.text);
    if (!match || match.index === undefined) continue;
    const start = Math.max(0, match.index - 90);
    const end = Math.min(source.text.length, match.index + match[0].length + 140);
    return { source: source.label, excerpt: source.text.slice(start, end).replace(/\s+/g, " ").trim() };
  }
  return null;
}

function normalize(value: string): string { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
