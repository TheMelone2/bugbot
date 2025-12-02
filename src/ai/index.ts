/* eslint-disable @typescript-eslint/no-unused-vars */
import type { BugReport, BugReportInput } from "../types/BugReport.js";
import { config } from "../config.js";
import { generateBugReportWithOllama } from "./ollamaClient.js";
import { generateBugReportWithOpenAI } from "./openaiClient.js";
import { loadFewShotExamples } from "../prompt/fewShotExamples.js";

export async function generateBugReport(
  input: BugReportInput
): Promise<BugReport> {
  const fewShot = await loadFewShotExamples();

  if (config.aiBackend === "ollama") {
    try {
      return await generateBugReportWithOllama(input, fewShot);
    } catch (err) {
      if (config.openaiApiKey) {
        return await generateBugReportWithOpenAI(input, fewShot);
      }
      throw err;
    }
  }

  if (config.aiBackend === "openai") {
    try {
      return await generateBugReportWithOpenAI(input, fewShot);
    } catch (err) {
      return await generateBugReportWithOllama(input, fewShot);
    }
  }

  return await generateBugReportWithOllama(input, fewShot);
}