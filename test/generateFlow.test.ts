import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/ai/ollamaClient.js", () => ({
  generateBugReportWithOllama: vi.fn(),
}));
vi.mock("../src/ai/openaiClient.js", () => ({
  generateBugReportWithOpenAI: vi.fn(),
}));

import { generateBugReport } from "../src/ai/index.js";
import { config } from "../src/config.js";
import { NeedMoreInfoError } from "../src/ai/errors.js";
import { generateBugReportWithOllama } from "../src/ai/ollamaClient.js";
import { generateBugReportWithOpenAI } from "../src/ai/openaiClient.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateBugReport integration", () => {
  it("uses Ollama by default and returns its result", async () => {
    config.aiBackend = "ollama";
    (generateBugReportWithOllama as unknown as vi.Mock).mockResolvedValue({ title: "ok" });

    const res = await generateBugReport({ rawSummary: "s" } as any);
    expect(res.title).toBe("ok");
    expect(generateBugReportWithOllama).toHaveBeenCalled();
  });

  it("falls back to OpenAI when Ollama errors and openaiApiKey is set", async () => {
    config.aiBackend = "ollama";
    config.openaiApiKey = "dummy";

    (generateBugReportWithOllama as unknown as vi.Mock).mockRejectedValue(new Error("network"));
    (generateBugReportWithOpenAI as unknown as vi.Mock).mockResolvedValue({ title: "from-openai" });

    const res = await generateBugReport({ rawSummary: "s" } as any);
    expect(res.title).toBe("from-openai");
    expect(generateBugReportWithOllama).toHaveBeenCalled();
    expect(generateBugReportWithOpenAI).toHaveBeenCalled();
  });

  it("propagates NeedMoreInfoError from Ollama immediately", async () => {
    config.aiBackend = "ollama";
    (generateBugReportWithOllama as unknown as vi.Mock).mockRejectedValue(new NeedMoreInfoError(["appVersion"], "need"));

    await expect(generateBugReport({ rawSummary: "s" } as any)).rejects.toBeInstanceOf(NeedMoreInfoError);
  });
});
