import { describe, it, expect } from "vitest";
import { parseBugReportJson } from "../src/ai/openaiClient.js";
import { NeedMoreInfoError } from "../src/ai/errors.js";

describe("parseBugReportJson", () => {
  it("parses a valid bug report JSON string", () => {
    const text = `{"title":"T","description":"D","stepsToReproduce":["1","2"],"environment":{"platform":"Mobile"}}`;
    const parsed = parseBugReportJson(text);
    expect(parsed.title).toBe("T");
    expect(parsed.stepsToReproduce).toEqual(["1", "2"]);
    expect(parsed.environment.platform).toBe("Mobile");
  });

  it("throws NeedMoreInfoError with normalized fields", () => {
    const text = `{"needMoreInfo":true,"missingFields":["browser","OS","steps"],"message":"please"}`;
    try {
      parseBugReportJson(text);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NeedMoreInfoError);
      const nm = err as NeedMoreInfoError;
      expect(Array.isArray(nm.missingFields)).toBe(true);
      // browser -> appVersion, OS -> os, steps -> stepsToReproduce (order may vary)
      expect(nm.missingFields).toEqual(expect.arrayContaining(["appVersion", "os", "stepsToReproduce"]));
    }
  });

  it("throws NeedMoreInfoError with empty missingFields for nonsense requests", () => {
    const text = `{"needMoreInfo":true,"missingFields":["something-unknown"],"message":"ask"}`;
    try {
      parseBugReportJson(text);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NeedMoreInfoError);
      const nm = err as NeedMoreInfoError;
      expect(nm.missingFields.length).toBe(0);
    }
  });

  it("returns fallback when text isn't valid JSON", () => {
    const text = "This is some non-json response from the model that is long enough";
    const parsed = parseBugReportJson(text);
    expect(parsed.title).toBe("Untitled bug report");
    expect(parsed.description).toBe(text.slice(0, 1900));
  });
});
