import fs from "node:fs";
import path from "node:path";
import type { BugReport } from "../types/BugReport.js";

const DATA_FILE = path.join(process.cwd(), "data", "bug_reports.jsonl");

export async function loadFewShotExamples(
  maxExamples = 3
): Promise<BugReport[]> {
  try {
    const raw = await fs.promises.readFile(DATA_FILE, "utf8");
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: BugReport[] = [];
    for (const line of lines) {
      if (parsed.length >= maxExamples) break;
      try {
        const obj = JSON.parse(line);
        parsed.push(obj);
      } catch {
        // ignore bad lines
      }
    }
    return parsed;
  } catch {
    return [];
  }
}