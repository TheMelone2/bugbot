import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { DiscordForumScraper } from "../scraper/DiscordForumScraper.js";

async function main() {
  if (!config.scraperDiscordForumUrls.length) {
    console.error(
      "No SCRAPER_DISCORD_FORUM_URLS configured. Set it in your env (comma-separated)."
    );
    process.exit(1);
  }

  const scraper = new DiscordForumScraper(config.scraperDiscordForumUrls);
  const results = await scraper.scrape();

  if (!results.length) {
    console.warn("No bug report examples scraped.");
    return;
  }

  const dataDir = path.join(process.cwd(), "data");
  const filePath = path.join(dataDir, "bug_reports.jsonl");

  await fs.promises.mkdir(dataDir, { recursive: true });

  const lines = results.map((r) => JSON.stringify(r));
  await fs.promises.appendFile(filePath, `${lines.join("\n")}\n`, "utf8");

  console.log(`Saved ${results.length} examples to ${filePath}`);
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});