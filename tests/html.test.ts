import { describe, expect, it } from "vitest";
import { renderHtml } from "../src/html.js";
import type { EventAudit } from "../src/types.js";

describe("renderHtml", () => {
  it("renders a self-contained report and escapes participant content", () => {
    const audit = {
      schemaVersion: "1.0",
      toolVersion: "0.1.0",
      startedAt: "2026-11-17T12:00:00.000Z",
      completedAt: "2026-11-17T12:01:00.000Z",
      sourceUrl: "https://www.spaceappschallenge.org/2026/local-events/test/",
      event: { name: "Test <script>", country: "Argentina", year: "2026", slug: "test", pages: {} },
      teams: [],
      summary: { totalTeams: 0, pass: 0, warn: 0, fail: 0, unknown: 0, findings: 0 },
      limitations: ["Human review required"],
    } satisfies EventAudit;
    const html = renderHtml(audit, "en");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Test &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("@media print");
  });

  it("renders Spanish labels in a separate document", () => {
    const audit = {
      schemaVersion: "1.0", toolVersion: "0.1.0", startedAt: "2026-11-17T12:00:00.000Z", completedAt: "2026-11-17T12:01:00.000Z",
      sourceUrl: "https://www.spaceappschallenge.org/2026/local-events/test/",
      event: { name: "Test", country: "Argentina", year: "2026", slug: "test", pages: {} }, teams: [],
      summary: { totalTeams: 0, pass: 0, warn: 0, fail: 0, unknown: 0, findings: 0 }, limitations: [],
    } satisfies EventAudit;
    const html = renderHtml(audit, "es");
    expect(html).toContain('lang="es"');
    expect(html).toContain("Resumen ejecutivo");
    expect(html).toContain("Método y limitaciones");
    expect(html).not.toContain("Executive summary");
  });
});
