import { describe, expect, it } from "vitest";
import { extractYearAndSlug, slugify, validatePublicHttpUrl } from "../src/utils.js";

describe("URL handling", () => {
  it("extracts the event year and slug", () => {
    expect(extractYearAndSlug(new URL("https://www.spaceappschallenge.org/2026/local-events/santa-rosa-de-calamuchita/"))).toEqual({
      year: "2026",
      slug: "santa-rosa-de-calamuchita",
    });
  });

  it("rejects local targets", () => {
    expect(() => validatePublicHttpUrl("http://localhost:3000/2026/local-events/test/")).toThrow(/Local/);
  });
});

describe("slugify", () => {
  it("creates filesystem-safe slugs", () => {
    expect(slugify("Santa Rosa de Calamuchita — Córdoba")).toBe("santa-rosa-de-calamuchita-cordoba");
  });
});
