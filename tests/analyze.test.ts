import { describe, expect, it } from "vitest";
import { challengeCoverage, evaluateTeam } from "../src/analyze.js";
import type { ChallengeEvidence, ProjectEvidence } from "../src/types.js";

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
