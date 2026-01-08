export interface BugReport {
  title: string;
  description: string;
  stepsToReproduce: string[];
  expectedResult?: string;
  actualResult?: string;
  environment: {
    platform?: string;
    os?: string;
    appVersion?: string;
    networkInfo?: string;
    additionalDetails?: string;
    clientType?: string;
    clientInfo?: string;
    browserType?: string;
    deviceManufacturer?: string;
    deviceModel?: string;
  };
  severity?: "low" | "medium" | "high" | "critical" | string;
  component?: string;
  attachments?: string[];
  reasoning?: string;
  reproducibilityScore?: number;
}

export interface BugReportInput {
  rawSummary: string;
  detailedDescription?: string;
  steps?: string[];
  environmentNotes?: string;
  severity?: string;
  component?: string;
}