import fs from "node:fs";
import path from "node:path";
import type { SupportArticle } from "../types/SupportArticle.js";

const DATA_FILE = path.join(process.cwd(), "data", "support_articles.jsonl");

interface IndexedArticle {
  article: SupportArticle;
  /**
   *unique tokens that appear in the article title.
   */
  titleTokens: Set<string>;
  /**
   * unique tokens that appear in the article body/content.
   */
  bodyTokens: Set<string>;
  /**
   * Uuion of all tokens for fast “covers all query terms?” checks & cheap document length approximation
   */
  allTokens: Set<string>;
  /**
   * Cached length-normalization factor to slightly down‑weight
   * extremely long articles without doing heavy math per query.
   */
  lengthNorm: number;
}

let loaded = false;
// eslint-disable-next-line prefer-const
let indexedArticles: IndexedArticle[] = [];
const tokenIndex: Map<string, Set<number>> = new Map();
const idfIndex: Map<string, number> = new Map();

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

async function loadIndexIfNeeded(): Promise<void> {
  if (loaded) return;
  loaded = true;

  try {
    const raw = await fs.promises.readFile(DATA_FILE, "utf8");
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    lines.forEach((line, idx) => {
      try {
        const article = JSON.parse(line) as SupportArticle;

        const titleTokens = new Set(
          tokenize((article.title ?? "").slice(0, 2_000))
        );
        const bodyTokens = new Set(
          tokenize((article.content ?? "").slice(0, 10_000))
        );

        const allTokens = new Set<string>([
          ...titleTokens.values(),
          ...bodyTokens.values(),
        ]);

        const lengthNorm = Math.sqrt(allTokens.size || 1);

        const index = indexedArticles.length;
        indexedArticles.push({
          article,
          titleTokens,
          bodyTokens,
          allTokens,
          lengthNorm,
        });

        for (const token of allTokens) {
          let set = tokenIndex.get(token);
          if (!set) {
            set = new Set<number>();
            tokenIndex.set(token, set);
          }
          set.add(index);
        }
      } catch {
        // skip bad lines
      }
    });

    // pre-compute an IDF-style weight per token so queries
    // only do cheap lookups instead of logarithms.
    const totalDocs = indexedArticles.length || 1;
    for (const [token, ids] of tokenIndex.entries()) {
      const df = ids.size || 1;
      // ln(1 + N / df)
      const idf = Math.log(1 + totalDocs / df);
      idfIndex.set(token, idf);
    }

    console.log(
      `[BugBot][SupportIndex] Loaded ${indexedArticles.length} articles from ${DATA_FILE}`
    );
  } catch (err) {
    console.warn(
      `[BugBot][SupportIndex] Could not load support articles from ${DATA_FILE}:`,
      err
    );
  }
}

export interface ScoredArticle {
  article: SupportArticle;
  score: number;
}

export async function searchSupportArticles(
  query: string,
  maxResults = 3
): Promise<ScoredArticle[]> {
  await loadIndexIfNeeded();
  if (!indexedArticles.length) return [];

  const qTokens = tokenize(query);
  if (!qTokens.length) return [];

  const candidateScores = new Map<number, number>();
  const matchedTokenCounts = new Map<number, number>();

  for (const token of qTokens) {
    const ids = tokenIndex.get(token);
    if (!ids) continue;

    const idf = idfIndex.get(token) ?? 0;
    if (idf === 0) continue;

    for (const idx of ids) {
      const item = indexedArticles[idx];

      // start with IDF‑weighted token score
      let tokenScore = idf;

      // strong boost if the token appears in the title,
      // lighter weight if it only appears in the body.
      if (item.titleTokens.has(token)) {
        tokenScore *= 3;
      } else if (item.bodyTokens.has(token)) {
        tokenScore *= 1.5;
      }

      const prev = candidateScores.get(idx) ?? 0;
      candidateScores.set(idx, prev + tokenScore);

      matchedTokenCounts.set(
        idx,
        (matchedTokenCounts.get(idx) ?? 0) + 1
      );
    }
  }

  if (!candidateScores.size) return [];

  const scored: ScoredArticle[] = Array.from(candidateScores.entries())
    .map(([idx, baseScore]) => {
      const item = indexedArticles[idx];
      const matchedCount = matchedTokenCounts.get(idx) ?? 0;

      let score = baseScore;

      // Reward articles that match more of the distinct query tokens.
      if (matchedCount > 1) {
        score += matchedCount * 0.75;
      }

      // Bonus if the article text covers ALL query tokens.
      const coversAll = qTokens.every((t) => item.allTokens.has(t));
      if (coversAll) {
        score += 3;
      }

      // Light document‑length normalization to avoid very long articles always winning.
      const norm = item.lengthNorm || 1;
      score = score / (0.5 + norm * 0.1);

      return {
        article: item.article,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored;
}