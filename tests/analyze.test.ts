import { describe, expect, it } from "vitest";
import { challengeCoverage, evaluateTeam, projectLanguage } from "../src/analyze.js";
import type { ChallengeEvidence, ContentEvidence, ProjectEvidence } from "../src/types.js";

const challenge: ChallengeEvidence = {
  title: "Create Health Monitoring Software for Astronauts on Space Missions",
  url: "https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/",
  excerpt: "Build health monitoring software that gathers astronaut health indicators and enables astronauts to evaluate and act on their health during long-duration space missions.",
};

const project: ProjectEvidence = {
  name: "CircaLuna",
  summary: "Health monitoring software for astronauts that evaluates sleep, circadian indicators, alertness, and light exposure during long-duration space missions.",
  details: "The offline application gathers daily sleep and light health indicators, estimates internal circadian phase, and gives astronauts a concrete action plan.",
  nasaData: "Create Health Monitoring Software for Astronauts on Space Missions https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/",
  demoUrl: "https://example.com/demo",
  projectUrl: "https://example.com/project",
  submitted: true,
};

describe("challengeCoverage", () => {
  it("passes a project that cites and covers its challenge", () => {
    const result = challengeCoverage(project, challenge);
    expect(result.status).toBe("pass");
    expect(result.ratio).not.toBeNull();
    expect(result.matchedTerms).toContain("astronauts");
  });

  it("returns unknown when the brief is unavailable", () => {
    const result = challengeCoverage(project, { ...challenge, excerpt: "", title: "Short" });
    expect(result.status).toBe("unknown");
    expect(result.ratio).toBeNull();
  });

  it("uses repository and transcript evidence to improve sparse form coverage", () => {
    const sparse = { ...project, summary: "A compact astronaut assistant.", details: "See the public implementation and narrated demonstration.", nasaData: "NASA health challenge" };
    const baseline = challengeCoverage(sparse, challenge);
    const evidence: ContentEvidence[] = [{
      kind: "repository", sourceUrl: "https://github.com/example/health", status: "pass", title: "example/health", reason: "extracted", text:
        "The software gathers astronaut sleep, circadian rhythm, alertness and light exposure indicators. It evaluates health during long duration missions and recommends actions.",
    }];
    const enriched = challengeCoverage(sparse, challenge, evidence);
    expect(enriched.ratio).toBeGreaterThan(baseline.ratio ?? 0);
    expect(enriched.evidenceSources).toContain("repository");
    expect(enriched.status).not.toBe("fail");
  });

  it("normalizes bilingual and synonymous domain concepts", () => {
    const trainerChallenge: ChallengeEvidence = {
      title: "Build a Junior Astronaut Mission Trainer",
      url: null,
      excerpt: "Create an interactive mission trainer where an astronaut balances radiation shielding, oxygen, food, energy, and other resources in a Martian outpost.",
    };
    const spanishProject: ProjectEvidence = {
      ...project,
      name: "Misión Marte",
      summary: "Un juego inmersivo y simulador de vida humana en Marte.",
      details: "Los jugadores administran oxígeno, alimentos, energía y otros recursos mientras protegen el hábitat de la radiación.",
      nasaData: "Datos y referencias sobre Marte",
    };
    const result = challengeCoverage(spanishProject, trainerChallenge);
    expect(result.status).not.toBe("fail");
    expect(result.matchedTerms).toContain("trainer");
    expect(result.matchedTerms).toContain("martian");
  });
});

describe("evaluateTeam", () => {
  it("records missing required evidence", () => {
    const result = evaluateTeam({
      project: { ...project, demoUrl: null, nasaData: "" },
      challenge,
      links: [],
    });
    expect(result.findings.find((finding) => finding.code === "DEMO_LINK")?.status).toBe("fail");
    expect(result.findings.find((finding) => finding.code === "NASA_DATA")?.status).toBe("fail");
    expect(result.status).toBe("fail");
  });
});

describe("projectLanguage", () => {
  it("passes substantive English submission fields", () => {
    expect(projectLanguage(project).status).toBe("pass");
  });

  it("fails when a substantive field is written in Spanish", () => {
    const result = projectLanguage({
      ...project,
      summary: "Nuestro proyecto ayuda a los astronautas durante las misiones espaciales y permite cuidar su salud.",
    });
    expect(result.status).toBe("fail");
    expect(result.nonEnglishFields).toContain("summary");
  });
});
