import axios from "axios";
import * as cheerio from "cheerio";
import type { ScrapedBugExample, SourceScraper } from "./SourceScraper.js";

/**
 * Simple Web Scraper - won't work due to Cloudflare
 */
export class DiscordForumScraper implements SourceScraper {
  constructor(private readonly urls: string[]) {}

  async scrape(): Promise<ScrapedBugExample[]> {
    const results: ScrapedBugExample[] = [];

    for (const url of this.urls) {
      try {
        const html = (await axios.get(url)).data as string;
        const $ = cheerio.load(html);

        // Heuristic: forum topic cards
        $(".topic, .community-topic, .post, .article-list-item").each(
          (_idx, el) => {
            const $el = $(el);

            const title =
              $el.find(".topic-title, .title, a").first().text().trim() ||
              "Bug report";

            const body =
              $el
                .find(
                  ".topic-body, .body, .excerpt, .post-body, .article-list-item-description"
                )
                .first()
                .text()
                .trim() || "";

            const link =
              $el.find("a").first().attr("href") ||
              url.split("#")[0] ||
              url;

            // Very rough heuristic: tags / labels
            const tags = $el
              .find(".tag, .label, .topic-tag")
              .map((_i, tagEl) => $(tagEl).text().trim())
              .get()
              .filter(Boolean);

            const example: ScrapedBugExample = {
              sourceUrl: link.startsWith("http") ? link : url,
              title,
              description: body,
              stepsToReproduce: [],
              environment: {},
              severity: undefined,
              component: tags.join(", "),
            };

            results.push(example);
          }
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to scrape ${url}:`, err);
      }
    }

    return results;
  }
}