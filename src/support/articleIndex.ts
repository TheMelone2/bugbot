/* eslint-disable prefer-const */
import fs from "node:fs";
import path from "node:path";
import type { SupportArticle } from "../types/SupportArticle.js";

const DATA_FILE = path.join(process.cwd(), "data", "support_articles.jsonl");

interface IndexedArticle {
  article: SupportArticle;
  titleTokens: Set<string>;
  bodyTokens: Set<string>;
  allTokens: Set<string>;
  lengthNorm: number;
  bodyLength: number;
}

let loaded = false;
let indexedArticles: IndexedArticle[] = [];

const tokenIndex: Map<string, Set<number>> = new Map();
const dfIndex: Map<string, number> = new Map();

let avgDocLength = 1;

// BM25 constants
const BM25_K1 = 1.4;
const BM25_B = 0.65;

// debug mode toggle
const DEBUG = process.env.DEBUG_SUPPORT_SEARCH === "true";

// tokenization
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\-]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

// load full index -> once
async function loadIndexIfNeeded(): Promise<void> {
  if (loaded) return;
  loaded = true;

  const loadStart = performance.now();

  try {
    const raw = await fs.promises.readFile(DATA_FILE, "utf8");
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

    let totalLength = 0;

    lines.forEach((line) => {
      try {
        const article = JSON.parse(line) as SupportArticle;

        const titleTokensArr = tokenize((article.title ?? "").slice(0, 2000));
        const bodyTokensArr = tokenize((article.content ?? "").slice(0, 10_000));

        const titleTokens = new Set(titleTokensArr);
        const bodyTokens = new Set(bodyTokensArr);

        const allTokens = new Set([...titleTokens, ...bodyTokens]);
        const bodyLength = bodyTokensArr.length || 1;

        totalLength += bodyLength;

        const lengthNorm = Math.sqrt(allTokens.size || 1);

        const index = indexedArticles.length;
        indexedArticles.push({
          article,
          titleTokens,
          bodyTokens,
          allTokens,
          lengthNorm,
          bodyLength,
        });

        for (const token of allTokens) {
          let set = tokenIndex.get(token);
          if (!set) {
            set = new Set();
            tokenIndex.set(token, set);
          }
          set.add(index);
        }
      } catch {
        /* ignore */
      }
    });

    // compute document frequency
    for (const [token, ids] of tokenIndex.entries()) {
      dfIndex.set(token, ids.size);
    }

    avgDocLength = totalLength / Math.max(1, indexedArticles.length);

    const loadEnd = performance.now();
    console.log(
      `[BugBot][SupportIndex] Loaded ${indexedArticles.length} articles in ${(loadEnd - loadStart).toFixed(1)}ms`
    );
  } catch (err) {
    console.warn(`[BugBot][SupportIndex] Failed loading:`, err);
  }
}

// BM25 core scoring
function bm25Score(
  tf: number,
  df: number,
  docLen: number,
  totalDocs: number
): number {
  const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
  const norm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + (BM25_B * docLen) / avgDocLength));
  return idf * norm;
}

export interface ScoredArticle {
  article: SupportArticle;
  score: number;
  debug?: string;
}

// main search
export async function searchSupportArticles(
  query: string,
  maxResults = 3
): Promise<ScoredArticle[]> {
  await loadIndexIfNeeded();
  if (!indexedArticles.length) return [];

  const qTokens = tokenize(query);
  if (!qTokens.length) return [];

  const searchStart = performance.now();

  const tokenTimings: Record<string, number> = {};

  const scores = new Map<number, number>();
  const debugInfo = new Map<number, string[]>();

  const totalDocs = indexedArticles.length;

  for (const token of qTokens) {
    const tStart = performance.now();

    const ids = tokenIndex.get(token);
    if (!ids) {
      tokenTimings[token] = performance.now() - tStart;
      continue;
    }

    const df = dfIndex.get(token) || 1;

    for (const idx of ids) {
      const item = indexedArticles[idx];

      // term frequency (title weighted)
      let tf = 0;

      if (item.titleTokens.has(token)) tf += 3; // heavy title boost
      if (item.bodyTokens.has(token)) tf += 1;

      if (tf === 0) continue;

      const s = bm25Score(tf, df, item.bodyLength, totalDocs);

      scores.set(idx, (scores.get(idx) ?? 0) + s);

      if (DEBUG) {
        const line = `token=${token}, tf=${tf}, df=${df}, doclen=${item.bodyLength.toFixed(
          0
        )}, score=${s.toFixed(2)}`;
        (debugInfo.get(idx) ?? debugInfo.set(idx, []).get(idx)!).push(line);
      }
    }

    tokenTimings[token] = performance.now() - tStart;
  }

  // no candidates
  if (!scores.size) {
    console.log(`[BugBot][Search] no results for "${query}"`);
    return [];
  }

  // collect top N
  const result = [...scores.entries()]
    .map(([idx, score]) => ({
      article: indexedArticles[idx].article,
      score,
      debug: DEBUG ? debugInfo.get(idx)?.join("\n") ?? "" : undefined,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  const searchEnd = performance.now();

  // log timings
  const sortedTokens = Object.entries(tokenTimings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tok, time]) => `${tok}=${time.toFixed(2)}ms`)
    .join(", ");

  console.log(
    `[BugBot][Search] query="${query}" tokens=${qTokens.length} results=${result.length} total=${(
      searchEnd - searchStart
    ).toFixed(2)}ms slowest_tokens=[${sortedTokens}]`
  );

  return result;
}