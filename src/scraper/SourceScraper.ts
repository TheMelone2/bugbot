import type { BugReport } from "../types/BugReport.js";

export interface ScrapedBugExample extends BugReport {
  sourceUrl: string;
}

export interface SourceScraper {
  scrape(): Promise<ScrapedBugExample[]>;
}