/* eslint-disable @typescript-eslint/no-unused-vars */
import axios from "axios";
import type { BugReport, BugReportInput } from "../types/BugReport.js";
import { config } from "../config.js";

export async function generateBugReportWithOllama(
  input: BugReportInput,
  fewShotExamples?: BugReport[]
): Promise<BugReport> {
  const prompt = buildPrompt(input, fewShotExamples);

  // eslint-disable-next-line no-console
  console.log("[BugBot][Ollama] Requesting bug report generation…");

  const response = await axios.post(
    `${config.ollamaBaseUrl}/api/generate`,
    {
      model: config.ollamaModel,
      prompt,
      stream: false,
    },
    {
      // Large local models (like 20B+) can take a while to spin up,
      // especially on first use, so we give them more time.
      timeout: 300_000,
    }
  );

  const text: string = response.data.response ?? response.data;
  // eslint-disable-next-line no-console
  console.log("[BugBot][Ollama] Received response from model.");
  return parseBugReportJson(text);
}

function buildPrompt(
  input: BugReportInput,
  fewShotExamples?: BugReport[]
): string {
  const examplesText =
    fewShotExamples && fewShotExamples.length
      ? "\n\nHere are example high-quality bug reports (JSON):\n" +
        fewShotExamples
          .slice(0, 3)
          .map((ex, idx) => `Example ${idx + 1}:\n${JSON.stringify(ex)}`)
          .join("\n\n")
      : "";

  return (
    `You are BugBot, an expert bug report writer for Discord platform issues.\n` +
    `Transform the following user input into a clean, structured bug, well-written report.\n` +
    `Respond ONLY with a single JSON object matching this TypeScript interface:\n` +
    `interface BugReport {\n` +
    `  title: string;\n` +
    `  description: string;\n` +
    `  stepsToReproduce: string[];\n` +
    `  expectedResult?: string;\n` +
    `  actualResult?: string;\n` +
    `  environment: {\n` +
    `    platform?: string;\n` +
    `    os?: string;\n` +
    `    appVersion?: string;\n` +
    `    networkInfo?: string;\n` +
    `    additionalDetails?: string;\n` +
    `  };\n` +
    `  severity?: string;\n` +
    `  component?: string;\n` +
    `  attachments?: string[];\n` +
    `}\n` +
    `User input (raw, may be messy and unlogical, you are allowed to kinda predict the user's steps if not given.):\n` +
    JSON.stringify(input, null, 2) +
    examplesText +
    `\n\nReturn ONLY JSON.`
  );
}

function parseBugReportJson(text: string): BugReport {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : text;

  try {
    const parsed = JSON.parse(candidate);
    return {
      title: parsed.title || "Untitled bug report",
      description: parsed.description || "",
      stepsToReproduce: Array.isArray(parsed.stepsToReproduce)
        ? parsed.stepsToReproduce.map((s: unknown) => String(s))
        : [],
      expectedResult: parsed.expectedResult,
      actualResult: parsed.actualResult,
      environment: parsed.environment || {},
      severity: parsed.severity,
      component: parsed.component,
      attachments: parsed.attachments,
    };
  } catch (err) {
    return {
      title: "Untitled bug report",
      description: text.slice(0, 1900),
      stepsToReproduce: [],
      environment: {},
    };
  }
}