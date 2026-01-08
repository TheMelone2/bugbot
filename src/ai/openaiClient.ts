/* eslint-disable @typescript-eslint/no-unused-vars */
/* ! TODO: THIS IS OUTDATED!*/
import OpenAI from "openai";
import type { BugReport, BugReportInput } from "../types/BugReport.js";
import { config } from "../config.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

export async function generateBugReportWithOpenAI(
  input: BugReportInput,
  fewShotExamples?: BugReport[]
): Promise<BugReport> {
  const openai = getClient();
  const prompt = buildPrompt(input, fewShotExamples);

  // eslint-disable-next-line no-console
  console.log("[BugBot][OpenAI] Requesting bug report generation…");

  const resp = await openai.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: 800,
  });

  const text =
    resp.choices[0]?.message?.content ??
    (() => {
      throw new Error("Empty OpenAI response");
    })();

  // eslint-disable-next-line no-console
  console.log("[BugBot][OpenAI] Received response from model.");

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
    `Transform the following user input into a concise, high-quality bug report.\n` +
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
    `IMPORTANT: Only request additional information if it is absolutely necessary to reproduce or diagnose the bug described by the user.\n` +
    `If you need more information, return a JSON object with the shape: { "needMoreInfo": true, "missingFields": ["fieldName"], "message": "brief reason" }.\n` +
    `Do NOT request unrelated fields (for example: generic "server type" for a mobile UI bug) unless the missing information is directly relevant to reproducing or diagnosing the issue.\n` +
    `Avoid asking for fields that are already present in the user input. Request the minimal set of fields needed and prefer friendly, narrow names (e.g. "appVersion" instead of "server type").\n` +
    `User input (raw, may be messy and not logical):\n` +
    JSON.stringify(input, null, 2) +
    examplesText +
    `\n\nReturn ONLY JSON or the minimal {needMoreInfo:true} object when additional data is strictly required.`
  );
}

import { NeedMoreInfoError } from "./errors.js";

export function parseBugReportJson(text: string): BugReport {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : text;

  try {
    const parsed = JSON.parse(candidate);

    if (parsed && parsed.needMoreInfo) {
      const missingRaw = Array.isArray(parsed.missingFields)
        ? parsed.missingFields.map((m: unknown) => String(m))
        : [];

      // Normalize and filter to known, sensible fields
      const allowed = new Set([
        "detailedDescription",
        "description",
        "stepsToReproduce",
        "steps",
        "environment",
        "platform",
        "os",
        "appVersion",
        "networkInfo",
        "additionalDetails",
        "severity",
        "component",
        "attachments",
      ]);

      const mapped: string[] = [];
      for (const m of missingRaw) {
        const lower = m.toLowerCase();
        if (lower.includes("browser") && !mapped.includes("appVersion")) mapped.push("appVersion");
        else if (lower.includes("os") && !mapped.includes("os")) mapped.push("os");
        else if (lower.includes("steps") && !mapped.includes("stepsToReproduce")) mapped.push("stepsToReproduce");
        else if (allowed.has(m)) mapped.push(m);
      }

      const missing = Array.from(new Set(mapped));

      if (missing.length === 0) {
        // If the model asked for nothing useful, treat as not enough info but without re-prompt fields
        throw new NeedMoreInfoError([], parsed.message || "Model requested more info but none of the requested fields are recognized");
      }

      throw new NeedMoreInfoError(missing, parsed.message);
    }

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
    if (err instanceof NeedMoreInfoError) throw err;

    return {
      title: "Untitled bug report",
      description: text.slice(0, 1900),
      stepsToReproduce: [],
      environment: {},
    };
  }
}