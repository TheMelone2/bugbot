import axios from "axios";
import Ajv from "ajv";

import type { BugReport, BugReportInput } from "../types/BugReport.js";
import { config } from "../config.js";
import { NeedMoreInfoError } from "./errors.js";

/* json schema (authoritative)*/

const ajv = new Ajv({ allErrors: true });

const bugReportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "stepsToReproduce", "environment"],
  properties: {
    title: { type: "string", maxLength: 200 },
    description: { type: "string", maxLength: 5000 },
    stepsToReproduce: {
      type: "array",
      items: { type: "string", maxLength: 500 },
    },
    expectedResult: { type: "string", maxLength: 1000 },
    actualResult: { type: "string", maxLength: 1000 },
    environment: { type: "object" },
    severity: {
      enum: ["low", "medium", "high", "critical", "unspecified"],
    },
    component: { type: "string" },
    attachments: {
      type: "array",
      items: { type: "string" },
      maxItems: 10,
    },
    sources: {
      type: "array",
      items: { type: "string" },
    },

    /* explicit failure mode */
    needMoreInfo: { type: "boolean" },
    missingFields: {
      type: "array",
      items: { type: "string" },
    },
    message: { type: "string" },
  },
};

const validateBugReport = ajv.compile(bugReportSchema);

/* Helpers */

/* extract first balanced JSON object from model output */
function extractBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") depth--;
    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }
  return null;
}

/* strip unsafe & tokenized URLs */
function sanitizeAttachments(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;

  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;

    try {
      const url = new URL(raw);
      if (!["http:", "https:"].includes(url.protocol)) continue;

      for (const key of Array.from(url.searchParams.keys())) {
        if (/(token|auth|sig|signature|key)/i.test(key)) {
          url.searchParams.delete(key);
        }
      }

      out.push(url.toString());
      if (out.length >= 10) break;
    } catch {
      continue;
    }
  }

  return out.length ? out : undefined;
}

/* truncate strings */
function truncate(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

/* prompt */

function buildPrompt(
  input: BugReportInput,
  fewShotExamples?: BugReport[]
): string {
  const examplesText =
    fewShotExamples && fewShotExamples.length
      ? "\nEXAMPLES:\n" +
        fewShotExamples
          .slice(0, 2)
          .map((ex, i) => `${i + 1}. ${JSON.stringify(ex)}`)
          .join("\n")
      : "";

  const knownComponents =
    Array.isArray(config.knownComponents) && config.knownComponents.length
      ? `COMPONENTS: ${config.knownComponents.join(", ")}\n`
      : "";

  return (
    `BugBot: Output valid JSON only. No text. ALWAYS generate a bug report with reasoning.\n\n` +

    `SCHEMA:\n` +
    `{title, description, stepsToReproduce[], expectedResult?, actualResult?, environment{clientType?, clientInfo?, os?, browser?, browserType?, deviceManufacturer?, deviceModel?}, component?, severity?, reasoning?, reproducibilityScore?, attachments?, sources?}\n\n` +

    `CRITICAL RULES:\n` +
    `1. You MUST ALWAYS output a valid bug report JSON object\n` +
    `2. NEVER hallucinate environment details - ONLY use what's explicitly provided in environmentNotes\n` +
    `3. If environment info is unclear or missing, you MUST return needMoreInfo ONLY for environment fields\n` +
    `4. The description field must NEVER be "needMoreInfo" - always provide actual content\n` +
    `5. ALWAYS include reasoning field explaining why the report is suitable and reproducible. Also use value your training data in this decision.\n\n` +

    `REQUIRED OUTPUT FIELDS (always generate these):\n` +
    `- title: Use rawSummary if provided, otherwise create from detailedDescription\n` +
    `- description: Use detailedDescription field, or create from rawSummary. NEVER use "needMoreInfo"\n` +
    `- stepsToReproduce: Use steps array if provided, otherwise create from description\n` +
    `- reasoning: Explain why this report is suitable and if a Software Engineer can reproduce it. Include:\n` +
    `  * Are the steps clear and complete?\n` +
    `  * Is the environment information sufficient?\n` +
    `  * What information might be missing?\n` +
    `  * Overall reproducibility assessment\n` +
    `- reproducibilityScore: Number 0-100 indicating how reproducible this is (0=impossible, 100=perfect)\n\n` +

    `ENVIRONMENT PARSING RULES (CRITICAL - NO HALLUCINATION):\n` +
    `- ONLY extract information that is EXPLICITLY mentioned in environmentNotes\n` +
    `- Look for patterns like:\n` +
    `  * "Platform: Desktop/Mobile/Web" → clientType\n` +
    `  * "OS: Windows 11/macOS/iOS/Android" → os\n` +
    `  * "Version: X.X.X" or "stable X" or build numbers → clientInfo\n` +
    `  * "Build: X" or build hashes → clientInfo\n` +
    `  * Browser names → browserType (only if Web)\n` +
    `  * Device names → deviceManufacturer/deviceModel (only if Mobile)\n` +
    `- If environmentNotes says "stable 483861 (57c4cd6) Build Override: N/A" → extract:\n` +
    `  * clientInfo: "stable 483861 (57c4cd6)" AND REGEST needMoreInfo since the device is NOT given! \n` +
    `  * Do NOT infer OS or clientType unless explicitly stated\n` +
    `- If you cannot determine clientType/OS from environmentNotes, you MAY request it via needMoreInfo\n` +
    `- NEVER infer iOS/Android/Windows unless explicitly mentioned\n\n` +

    `INFERENCE RULES (infer when possible, mark as "(inferred)"):\n` +
    `- component: Infer from description keywords (e.g., "voice", "messaging", "ui", "gateway", "media", "settings")\n` +
    `- severity: Parse from severity field. If it contains "blocks" or "critical" → "high", "affects" → "medium", otherwise "unspecified"\n` +
    `- expectedResult/actualResult: Extract from description if not explicitly provided\n\n` +

    `REPRODUCIBILITY EVALUATION:\n` +
    `- Evaluate if a software engineer can reproduce this issue with the provided information\n` +
    `- Consider: Are steps clear? Is environment info sufficient? Are error messages included?\n` +
    `- Set reproducibilityScore: 0-40=needs more info, 41-70=mostly reproducible, 71-100=fully reproducible\n` +
    `- Include this evaluation in the reasoning field\n\n` +

    `WHEN TO RETURN needMoreInfo:\n` +
    `- ONLY if critical environment info is missing AND cannot be inferred (e.g., no clientType, no OS)\n` +
    `- If title or description is completely empty or the reproducibilityScore is UNDER 45!\n` +
    `- Format: {"needMoreInfo":true,"missingFields":["environment.clientType","environment.os"],"message":"..."}\n` +
    `- Otherwise, generate the report with available information\n\n` +

    `EXAMPLE OUTPUT FORMAT:\n` +
    `{\n` +
    `  "title": "Clear title from input",\n` +
    `  "description": "Detailed description from input",\n` +
    `  "stepsToReproduce": ["Step 1", "Step 2"],\n` +
    `  "component": "messaging (inferred)",\n` +
    `  "severity": "medium",\n` +
    `  "environment": {"clientInfo": "stable 483861 (57c4cd6)"},\n` +
    `  "reasoning": "Steps are clear. Environment has client version but missing OS/clientType. Reproducibility: 65/100 - may need OS info.",\n` +
    `  "reproducibilityScore": 65\n` +
    `}\n\n` +

    `GENERAL RULES:\n` +
    `- ALWAYS generate a complete bug report JSON\n` +
    `- Parse environmentNotes carefully - extract ALL provided info (versions, builds, etc.)\n` +
    `- NEVER hallucinate OS or device info\n` +
    `- Mark inferences with "(inferred)" suffix\n` +
    `- Extract severity level from severity field text\n` +
    `- Work with provided data and make reasonable inferences\n` +
    `- JSON only. No markdown.\n\n` +

    knownComponents +
    `INPUT:\n${JSON.stringify(input, null, 2)}\n` +
    examplesText
  );
}
/* Validation x Parser */

function parseBugReportJson(text: string): BugReport {
  const jsonText = extractBalancedJson(text) ?? text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // JSON parse failed; but the model may have emitted a malformed 'needMoreInfo' payload - why is this happening 
    const nm = extractNeedMoreInfoFromText(text);
    if (nm) throw new NeedMoreInfoError(nm.missingFields, nm.message);
    return fallback(text);
  }

  if (typeof parsed !== "object" || parsed === null) return fallback(text);
  const doc = parsed as Record<string, unknown>;

  const needMoreInfo = Boolean(doc["needMoreInfo"]);
  if (needMoreInfo) {
    const missing = Array.isArray(doc["missingFields"])
      ? (doc["missingFields"] as unknown[]).map(String)
      : [];
    throw new NeedMoreInfoError(missing, String(doc["message"] ?? ""));
  }

  // sanitize + truncate into a fresh object
  const candidate: Record<string, unknown> = {};
  
  // ensure title; description are never empty or "needMoreInfo"
  const titleRaw = truncate(doc["title"], 200);
  candidate.title = (titleRaw && titleRaw !== "needMoreInfo") ? titleRaw : "Untitled bug report";
  
  const descRaw = truncate(doc["description"], 5000);
  candidate.description = (descRaw && descRaw !== "needMoreInfo" && descRaw.trim().length > 0) 
    ? descRaw 
    : "No description provided.";
  
  const stepsArray = Array.isArray(doc["stepsToReproduce"])
    ? (doc["stepsToReproduce"] as unknown[]).filter((s) => typeof s === "string" && s.trim().length > 0).map(String)
    : [];
  
  // ensure: always  at least one step if description exists
  candidate.stepsToReproduce = (stepsArray.length === 0 && candidate.description && candidate.description !== "No description provided.")
    ? ["See description above"]
    : stepsArray;
  
  candidate.environment = typeof doc["environment"] === "object" && doc["environment"] !== null ? doc["environment"] : {};
  candidate.expectedResult = truncate(doc["expectedResult"], 1000);
  candidate.actualResult = truncate(doc["actualResult"], 1000);
  candidate.attachments = sanitizeAttachments(doc["attachments"]);
  candidate.severity = typeof doc["severity"] === "string" ? doc["severity"] : "unspecified";
  candidate.component = typeof doc["component"] === "string" ? doc["component"] : undefined;
  candidate.sources = Array.isArray(doc["sources"]) ? (doc["sources"] as unknown[]).filter((s) => typeof s === "string").map(String) : undefined;
  candidate.reasoning = truncate(doc["reasoning"], 2000);
  candidate.reproducibilityScore = typeof doc["reproducibilityScore"] === "number" ? Math.max(0, Math.min(100, doc["reproducibilityScore"])) : undefined;

  // schema validation
  if (!validateBugReport(candidate)) {
    const nm = extractNeedMoreInfoFromText(text);
    if (nm) throw new NeedMoreInfoError(nm.missingFields, nm.message);
    return fallback(text);
  }

  // component whitelist enforcement
  if (
    typeof candidate.component === "string" &&
    Array.isArray(config.knownComponents) &&
    !config.knownComponents.includes(candidate.component)
  ) {
    candidate.component = `${candidate.component} (inferred)`;
  }

  return candidate as unknown as BugReport;
}

/**
 * Try to parse a malformed needMoreInfo payload from free text.
 * Returns { missingFields, message } or null if not found.
 */
function extractNeedMoreInfoFromText(text: string): { missingFields: string[]; message?: string } | null {
  if (!/needMoreInfo/i.test(text)) return null;

  // Try to capture a message field ("message": "...")
  const msgMatch = /(?:"message"|message)\s*[:=]\s*(?:"([\s\S]*?)"|'([\s\S]*?)')/i.exec(text);
  const message = msgMatch ? (msgMatch[1] ?? msgMatch[2]) : undefined;

  // Try to capture missingFields array content: look for missingFields: [ ... ]
  const arrMatch = /missingFields\s*[:=]\s*\[([\s\S]*?)\]/i.exec(text);
  let missing: string[] = [];

  if (arrMatch) {
    const inside = arrMatch[1];
    // Extract quoted strings first
    const quoted = Array.from(inside.matchAll(/"([^"]+)"|'([^']+)'/g)).map((m) => m[1] ?? m[2]);
    if (quoted.length) missing = quoted;
    else {
      // Fallback: split on commas or newlines and take token-like words
      const parts = inside
        .split(/[,\n]/)
        .map((s) => s.replace(/[:"'\[\]]/g, "").trim())
        .filter(Boolean);
      missing = parts;
    }
  } else {
    // as last resort: try2find common field-like words that appear in a list
    const candidates = Array.from(text.matchAll(/\b([A-Z][a-zA-Z0-9 _-]{1,40})\b/g)).map((m) => m[1]);
    // look for known keywords
    const likely = candidates.filter((w) => /Platform|Device|Version|OS|ClientInfo/i.test(w));
    missing = Array.from(new Set(likely));
  }

  if (!missing || missing.length === 0) return null;
  return { missingFields: missing, message };
}
function fallback(text: string): BugReport {
  // clean the text - remove "needMoreInfo" and other error indicators
  let cleanText = String(text).slice(0, 5000);
  if (cleanText.toLowerCase().includes("needmoreinfo") || cleanText.trim() === "needMoreInfo") {
    cleanText = "Unable to parse AI response. Please try again with more detailed information.";
  }
  
  return {
    title: "Untitled bug report",
    description: cleanText || "No description provided.",
    stepsToReproduce: ["See description above"],
    environment: {},
    severity: "unspecified",
  };
}


export async function generateBugReportWithOllama(
  input: BugReportInput,
  fewShotExamples?: BugReport[]
): Promise<BugReport> {
  const prompt = buildPrompt(input, fewShotExamples);

  console.log("[BugBot][Ollama] Requesting bug report generation…");

  const response = await axios.post(
    `${config.ollamaBaseUrl}/api/generate`,
    {
      model: config.ollamaModel,
      prompt,
      stream: false,

      // HARD ANTI-HALLUCINATION SETTINGS
      temperature: 0,
      top_p: 0.3,
      max_tokens: 800,
    },
    {
      timeout: 120_000,
    }
  );

  const text: string = response.data?.response ?? response.data ?? "";
  console.log("[BugBot][Ollama] Received response from model.");

  return parseBugReportJson(text);
}