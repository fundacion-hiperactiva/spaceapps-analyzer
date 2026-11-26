import { describe, expect, it } from "vitest";
import { challengeGroups, comparisonObservation, normalizedChallengeTitle } from "../src/challenge-matrix.js";
import type { TeamAudit } from "../src/types.js";

function team(name: string, challenge: string, criteria: Array<"pass" | "warn">, repository = false): TeamAudit {
  return {
    name,
    challenge: { title: challenge, url: null, excerpt: "" },
    evaluationCriteria: ["impact", "creativity", "validity", "relevance", "presentation"].map((key, index) => ({
      key: key as "impact" | "creativity" | "validity" | "relevance" | "presentation",
      status: criteria[index] ?? "warn",
      explanation: "",
      evidence: [],
    })),
    contentEvidence: repository ? [{ kind: "repository", sourceUrl: "https://example.com", status: "pass", title: "repo", text: "", reason: "" }] : [],
  } as TeamAudit;
}

describe("challenge matrix", () => {
  it("groups the CONAE statement with the MODIS/VIIRS challenge", () => {
    const canonical = "Harmonization of MODIS and VIIRS Hot Spots";
    const groups = challengeGroups([
      team("A", canonical, ["pass", "pass", "pass", "pass", "pass"]),
      team("B", `CONAE – Challenge statement (${canonical})`, ["pass", "pass", "pass", "pass", "pass"]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe(canonical);
    expect(groups[0].teams).toHaveLength(2);
    expect(normalizedChallengeTitle(`CONAE – Challenge statement (${canonical})`)).toBe(canonical);
  });

  it("compares presence and repository evidence without producing a score", () => {
    const [group] = challengeGroups([
      team("Complete", "Shared challenge", ["pass", "pass", "pass", "pass", "pass"], true),
      team("Partial", "Shared challenge", ["pass", "warn", "warn", "pass", "warn"]),
    ]);
    const observation = comparisonObservation(group, "es");
    expect(observation).toContain("Complete documenta los cinco criterios");
    expect(observation).toContain("Partial");
    expect(observation.toLowerCase()).not.toContain("puntaje");
  });
});
