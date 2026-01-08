/* eslint-disable @typescript-eslint/no-unused-vars */
import type { BugReport, BugReportInput } from "../types/BugReport.js";
import { config } from "../config.js";
import { generateBugReportWithOllama } from "./ollamaClient.js";
import { generateBugReportWithOpenAI } from "./openaiClient.js";
import { loadFewShotExamples } from "../prompt/fewShotExamples.js";
import { NeedMoreInfoError } from "./errors.js";

export async function generateBugReport(
  input: BugReportInput
): Promise<BugReport> {
  const fewShot = await loadFewShotExamples();

  if (config.aiBackend === "ollama") {
    try {
      return await generateBugReportWithOllama(input, fewShot);
    } catch (err) {
      if (err instanceof NeedMoreInfoError) throw err;
      if (config.openaiApiKey) {
        try {
          return await generateBugReportWithOpenAI(input, fewShot);
        } catch (err2) {
          if (err2 instanceof NeedMoreInfoError) throw err2;
          throw err;
        }
      }
      throw err;
    }
  }

  if (config.aiBackend === "openai") {
    try {
      return await generateBugReportWithOpenAI(input, fewShot);
    } catch (err) {
      if (err instanceof NeedMoreInfoError) throw err;
      try {
        return await generateBugReportWithOllama(input, fewShot);
      } catch (err2) {
        if (err2 instanceof NeedMoreInfoError) throw err2;
        throw err;
      }
    }
  }

  // Default: try Ollama first
  return await generateBugReportWithOllama(input, fewShot);
}