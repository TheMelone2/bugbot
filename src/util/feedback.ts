import { writeFile, appendFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface MissingInfoFeedback {
  type: "missing_info";
  timestamp: number;
  userId: string;
  missingFields: string[];
  wasSuitable: boolean;
  userComment?: string;
  reportId?: string;
}

export interface ReportFeedback {
  type: "report";
  timestamp: number;
  userId: string;
  reportId: string;
  satisfaction: number; // 1-5 scale
  howToImprove?: string;
  userComment?: string;
}

export type Feedback = MissingInfoFeedback | ReportFeedback;

const FEEDBACK_FILE = path.join(process.cwd(), "data", "feedback.jsonl");

async function ensureFeedbackFile(): Promise<void> {
  const dir = path.dirname(FEEDBACK_FILE);
  if (!existsSync(dir)) {
    await writeFile(dir, "", { flag: "wx" }).catch(() => {});
  }
  if (!existsSync(FEEDBACK_FILE)) {
    await writeFile(FEEDBACK_FILE, "", { flag: "wx" }).catch(() => {});
  }
}

export async function saveFeedback(feedback: Feedback): Promise<void> {
  await ensureFeedbackFile();
  await appendFile(FEEDBACK_FILE, JSON.stringify(feedback) + "\n", "utf-8");
}

export async function loadFeedback(limit = 100): Promise<Feedback[]> {
  await ensureFeedbackFile();
  if (!existsSync(FEEDBACK_FILE)) return [];
  
  try {
    const content = await readFile(FEEDBACK_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const feedback = lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as Feedback);
    return feedback;
  } catch {
    return [];
  }
}