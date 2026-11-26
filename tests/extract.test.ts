import { describe, expect, it } from "vitest";
import { extractHttpUrls } from "../src/extract.js";

describe("extractHttpUrls", () => {
  it("finds repository URLs written as plain text and trims punctuation", () => {
    const text = "Code repository:\nhttps://gitlab.com/nasa-space-apps-challenge2/hotspot-harmonizers.\nMore details follow.";
    expect(extractHttpUrls(text)).toEqual([
      "https://gitlab.com/nasa-space-apps-challenge2/hotspot-harmonizers",
    ]);
  });
});
