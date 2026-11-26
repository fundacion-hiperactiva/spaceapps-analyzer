import type { EvaluationCriterionKey, TeamAudit } from "./types.js";
import type { Locale } from "./i18n.js";

export interface ChallengeGroup {
  title: string;
  teams: TeamAudit[];
}

const criterionKeys: EvaluationCriterionKey[] = ["impact", "creativity", "validity", "relevance", "presentation"];

export function challengeGroups(teams: TeamAudit[]): ChallengeGroup[] {
  const groups = new Map<string, TeamAudit[]>();
  for (const team of teams) {
    const title = normalizedChallengeTitle(team.challenge.title);
    groups.set(title, [...(groups.get(title) ?? []), team]);
  }
  return [...groups.entries()]
    .map(([title, groupedTeams]) => ({ title, teams: groupedTeams.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.teams.length - a.teams.length || a.title.localeCompare(b.title));
}

export function normalizedChallengeTitle(title: string): string {
  if (/harmonization of modis and viirs hot spots/i.test(title)) return "Harmonization of MODIS and VIIRS Hot Spots";
  return title.trim() || "Unresolved challenge";
}

export function criterionStatus(team: TeamAudit, key: EvaluationCriterionKey): string {
  return team.evaluationCriteria?.find((criterion) => criterion.key === key)?.status ?? "unknown";
}

export function criterionPresenceCount(team: TeamAudit): number {
  return criterionKeys.filter((key) => criterionStatus(team, key) === "pass").length;
}

export function projectApproach(team: TeamAudit, maxLength = 260): string {
  const source = team.project.summary.trim() || team.project.details.trim() || team.project.name;
  const firstSentence = source.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? source;
  if (firstSentence.length <= maxLength) return firstSentence;
  return `${firstSentence.slice(0, maxLength - 1).trimEnd()}…`;
}

export function resourceSummary(team: TeamAudit, locale: Locale): string {
  const labels = locale === "es"
    ? { repository: "Repositorio", presentation: "Presentación", video: "Video" }
    : { repository: "Repository", presentation: "Presentation", video: "Video" };
  const resources = (["repository", "presentation", "video"] as const).flatMap((kind) => {
    const item = team.contentEvidence?.find((evidence) => evidence.kind === kind);
    if (!item) return [];
    const suffix = item.status === "pass" ? "" : item.status === "warn" ? " (parcial)" : locale === "es" ? " (sin evidencia local)" : " (no local evidence)";
    return [`${labels[kind]}${suffix}`];
  });
  return resources.join(" · ") || (locale === "es" ? "Sin recurso local extraído" : "No local resource extracted");
}

export function comparisonObservation(group: ChallengeGroup, locale: Locale): string {
  const complete = group.teams.filter((team) => criterionPresenceCount(team) === criterionKeys.length);
  const partial = group.teams.filter((team) => criterionPresenceCount(team) < criterionKeys.length);
  const withRepository = group.teams.filter((team) => team.contentEvidence?.some((item) => item.kind === "repository" && item.status === "pass"));
  const withoutRepository = group.teams.filter((team) => !withRepository.includes(team));

  if (locale === "en") {
    const criteria = partial.length === 0
      ? "All teams document all five evaluation criteria."
      : `${teamNames(complete, locale)} ${complete.length === 1 ? "documents" : "document"} all five criteria; ${teamNames(partial, locale)} ${partial.length === 1 ? "leaves" : "leave"} at least one criterion only partially documented or unsupported.`;
    const repositories = withoutRepository.length === 0
      ? "Every team published a repository that could be reviewed locally."
      : `${teamNames(withRepository, locale)} published reviewable source code; ${teamNames(withoutRepository, locale)} did not provide an extractable repository.`;
    return `${criteria} ${repositories}`;
  }

  const criteria = partial.length === 0
    ? "Todos los equipos documentan los cinco criterios de evaluación."
    : `${teamNames(complete, locale)} ${complete.length === 1 ? "documenta" : "documentan"} los cinco criterios; ${teamNames(partial, locale)} ${partial.length === 1 ? "deja" : "dejan"} al menos un criterio sólo parcialmente documentado o sin sustento suficiente.`;
  const repositories = withoutRepository.length === 0
    ? "Todos publicaron un repositorio que pudo revisarse localmente."
    : `${teamNames(withRepository, locale)} ${withRepository.length === 1 ? "publicó" : "publicaron"} código fuente revisable; ${teamNames(withoutRepository, locale)} no ${withoutRepository.length === 1 ? "aportó" : "aportaron"} un repositorio extraíble.`;
  return `${criteria} ${repositories}`;
}

function teamNames(teams: TeamAudit[], locale: Locale): string {
  if (teams.length === 0) return locale === "es" ? "Ningún equipo" : "No team";
  if (teams.length === 1) return teams[0]!.name;
  return `${teams.slice(0, -1).map((team) => team.name).join(", ")} ${locale === "es" ? "y" : "and"} ${teams.at(-1)?.name}`;
}
