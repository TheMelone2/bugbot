import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import type {
  SupportArticle,
  SupportArticleMeta,
} from "../types/SupportArticle.js";

const OWNER = "xhyrom";
const REPO = "discord-datamining";
// In xhyrom/discord-datamining, articles live under:
// data/articles/normal/articles/<article_id>/{meta.json,content.md}
const BASE_PATH = "data/articles/normal/articles";

interface GitHubContent {
  name: string;
  path: string;
  type: "file" | "dir";
}

async function listDirectory(dirPath: string): Promise<GitHubContent[]> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${dirPath}`;
  const resp = await axios.get(url, {
    headers: {
      "User-Agent": "bugbot-sync-script",
    },
  });
  return resp.data as GitHubContent[];
}

async function fetchRawFile(filePath: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/master/${filePath}`;
  const resp = await axios.get(url, { responseType: "text" });
  return resp.data as string;
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("[BugBot][SupportSync] Fetching article list from GitHub…");

  const articleDirs = await listDirectory(BASE_PATH);
  const dirEntries = articleDirs.filter((e) => e.type === "dir");

  const dataDir = path.join(process.cwd(), "data");
  const outFile = path.join(dataDir, "support_articles.jsonl");
  await fs.promises.mkdir(dataDir, { recursive: true });

  const outStream = fs.createWriteStream(outFile, { flags: "w" });

  let count = 0;
  for (const dir of dirEntries) {
    try {
      const metaRaw = await fetchRawFile(`${dir.path}/meta.json`);
      const contentRaw = await fetchRawFile(`${dir.path}/content.md`);

      const meta = JSON.parse(metaRaw) as SupportArticleMeta & {
        url: string;
      };

      const article: SupportArticle = {
        id: meta.id,
        url: meta.url,
        htmlUrl: meta.html_url,
        title: meta.title,
        createdAt: meta.created_at,
        editedAt: meta.edited_at,
        sectionId: meta.section_id,
        content: contentRaw,
      };

      outStream.write(`${JSON.stringify(article)}\n`);
      count += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[BugBot][SupportSync] Failed to sync article directory ${dir.path}:`,
        err
      );
    }
  }

  outStream.end();

  // eslint-disable-next-line no-console
  console.log(
    `[BugBot][SupportSync] Synced ${count} articles to ${outFile}. You can now search them from the bot.`
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[BugBot][SupportSync] Fatal error:", err);
  process.exit(1);
});
