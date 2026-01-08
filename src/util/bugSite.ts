import type { BugReport } from "../types/BugReport.js";

/**
 * TODO: THIS IS OUTDATED!!!!!!!!!!!!!!!
 */
export function buildBugReportUrl(report: BugReport): string {
  // Discord's bug reporting form
  const baseUrl =
    "https://support.discord.com/hc/en-us/requests/new?ticket_form_id=360006586013";

  const title = report.title || "Discord bug report";
  const descriptionParts = [
    "**Description**",
    report.description,
    "",
    "**Steps to Reproduce**",
    report.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`).join("\n") ||
      "- Not specified -",
    "",
    "**Expected Result**",
    report.expectedResult || "- Not specified -",
    "",
    "**Actual Result**",
    report.actualResult || "- Not specified -",
    "",
    "**Discord Client Info**",
    [
      report.environment.platform && `Platform: ${report.environment.platform}`,
      report.environment.clientType && `Client Type: ${report.environment.clientType}`,
      report.environment.os && `OS: ${report.environment.os}`,
      report.environment.appVersion &&
        `App version: ${report.environment.appVersion}`,
      report.environment.clientInfo &&
        `Client Info: ${report.environment.clientInfo}`,
      report.environment.networkInfo &&
        `Network: ${report.environment.networkInfo}`,
      report.environment.additionalDetails,
    ]
      .filter(Boolean)
      .join("\n") || "- Not specified -",
  ].join("\n");

  const params = new URLSearchParams({
    subject: title,
    description: descriptionParts,
  });

  let url = `${baseUrl}&${params.toString()}`;

  // Discord buttons have a hard 512-character limit on URLs.
  // If our auto-filled URL is too long, fall back to the base form URL
  // and rely on the embed text for copy-paste instead of breaking the request.
  // TODO: Will replace this with an URL shortener! 

  if (url.length > 500) {
    url = baseUrl;
  }

  return url;
}