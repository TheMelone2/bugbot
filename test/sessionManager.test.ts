import { describe, it, expect } from "vitest";
import { looksLikeFieldProvided } from "../src/sessions/BugReportSessionManager.js";

describe("looksLikeFieldProvided", () => {
  it("detects appVersion-like strings", () => {
    expect(looksLikeFieldProvided("appVersion", "stable 475201 (1ab94f2)")).toBe(true);
    expect(looksLikeFieldProvided("appVersion", "Chrome 129.0.1")).toBe(true);
  });

  it("detects OS strings", () => {
    expect(looksLikeFieldProvided("os", "Windows 11")).toBe(true);
    expect(looksLikeFieldProvided("os", "iOS 17")).toBe(true);
  });

  it("detects platform strings", () => {
    expect(looksLikeFieldProvided("platform", "Mobile")).toBe(true);
    expect(looksLikeFieldProvided("platform", "Desktop")).toBe(true);
  });

  it("detects network info", () => {
    expect(looksLikeFieldProvided("networkInfo", "using VPN")).toBe(true);
    expect(looksLikeFieldProvided("networkInfo", "wifi")).toBe(true);
  });

  it("detects steps to reproduce", () => {
    expect(looksLikeFieldProvided("stepsToReproduce", "1. Open app\n2. Crash")).toBe(true);
    expect(looksLikeFieldProvided("stepsToReproduce", "click the button")).toBe(false);
  });

  it("detects detailed description content", () => {
    expect(looksLikeFieldProvided("detailedDescription", "App freezes when opening settings")).toBe(true);
    expect(looksLikeFieldProvided("detailedDescription", "ok")).toBe(false);
  });
});