/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from "discord.js";
import type { Command } from "./Command.js";
import { searchSupportArticles } from "../support/articleIndex.js";
import type { SupportArticle } from "../types/SupportArticle.js";

const SUPPORT_COLOR = 0x57f287; // discord "success" green-ish
export const SUPPORT_VIEW_ARTICLE_PREFIX = "bugbot-support-view:";

type CachedArticle = SupportArticle & { _sections?: Record<string, { title: string; html: string; text: string }>; };

const articleCache = new Map<string, CachedArticle>();


const COMPONENT_TEXT_TOTAL_LIMIT = 3800; // combined length across all TextDisplayBuilder content
const PER_BLOCK_SAFE_LIMIT = 1800; // split long content into blocks <= this length

function buildSafeTextDisplays(contents: string[]): TextDisplayBuilder[] {
  const displays: TextDisplayBuilder[] = [];
  let total = 0;

  const truncationNotice = "\n\n*...Content truncated. Open the original article to read more.*";

  for (let i = 0; i < contents.length; i++) {
    let s = String(contents[i] ?? "").trim();
    if (!s) continue;

    if (s.length > PER_BLOCK_SAFE_LIMIT) {
      s = s.slice(0, PER_BLOCK_SAFE_LIMIT);
    }

    if (total + s.length > COMPONENT_TEXT_TOTAL_LIMIT) {
      const remaining = Math.max(0, COMPONENT_TEXT_TOTAL_LIMIT - total);
      if (remaining <= 0) break;

      const reserveForNotice = truncationNotice.length;
      const chunkSize = Math.max(0, remaining - reserveForNotice);
      const truncated = s.slice(0, chunkSize).trimEnd() + truncationNotice;
      displays.push(new TextDisplayBuilder().setContent(truncated));
      total += truncated.length;
      break;
    }

    displays.push(new TextDisplayBuilder().setContent(s));
    total += s.length;
  }

  // if nothing added, atleast placeholder
  if (!displays.length) {
    displays.push(new TextDisplayBuilder().setContent("No preview available."));
  }

  return displays;
}

function splitIntoParagraphChunks(text: string): string[] {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (para.length > PER_BLOCK_SAFE_LIMIT) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      for (let i = 0; i < para.length; i += PER_BLOCK_SAFE_LIMIT) {
        chunks.push(para.slice(i, i + PER_BLOCK_SAFE_LIMIT).trim());
      }
      continue;
    }

    if ((current + "\n\n" + para).length > PER_BLOCK_SAFE_LIMIT && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function slugify(text: string) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractSectionsFromHtml(html: string) {
  const sections: Record<string, { title: string; html: string; text: string }> = {};
  // capture heading + following content until next heading
  const re = /<h([1-6])[^>]*?(?:id=["']?([^"'\s>]+)["']?)?[^>]*>(.*?)<\/h\1>([\s\S]*?)(?=(?:<h[1-6][^>]*>)|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, , idRaw, rawTitle, rawContent] = m as unknown as string[];
    const title = String(rawTitle).replace(/<[^>]+>/g, "").trim();
    const id = idRaw || slugify(title) || `section-${Object.keys(sections).length + 1}`;
    const fullHtml = `<h${m[1]}>${rawTitle}</h${m[1]}>${rawContent}`;
    const text = fullHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    sections[id] = { title, html: fullHtml, text };
  }
  return sections;
}

function storeArticle(article: SupportArticle): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // build sections map & store inside wrapper object
  const sections = extractSectionsFromHtml(article.content || "");
  const wrapped = { ...article, _sections: sections };

  articleCache.set(id, wrapped as unknown as SupportArticle & { _sections?: Record<string, { title: string; html: string; text: string }> } );

  // Cleanup: After 30 mins
  setTimeout(() => {
    articleCache.delete(id);
  }, 1000 * 60 * 30).unref?.();

  return id;
}

export function getArticleFromCache(id: string): SupportArticle | undefined {
  return articleCache.get(id) as SupportArticle | undefined;
}

export function buildViewArticleCustomId(id: string): string {
  return `${SUPPORT_VIEW_ARTICLE_PREFIX}${id}`;
}

export function extractArticleIdFromCustomId(customId: string): string | null {
  if (!customId.startsWith(SUPPORT_VIEW_ARTICLE_PREFIX)) return null;
  return customId.slice(SUPPORT_VIEW_ARTICLE_PREFIX.length);
}

// Helper: get article titles for autocomplete
async function getArticleTitlesForAutocomplete(
  query: string
): Promise<Array<{ name: string; value: string }>> {
  if (!query || query.length < 2) {
    // if query too short: return common queries 
    return [
      { name: "Messages not loading", value: "messages not loading" },
      { name: "Voice chat issues", value: "voice chat issues" },
      { name: "Account recovery", value: "account recovery" },
      { name: "Two-factor authentication", value: "two factor authentication" },
      { name: "Server permissions", value: "server permissions" },
    ];
  }

  const results = await searchSupportArticles(query, 25);
  return results.map(({ article }) => ({
    name: article.title.slice(0, 100),
    value: article.title.slice(0, 100),
  }));
}

export const supportCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("support")
    .setDescription(
      "Search official Discord support articles that match your issue."
    )
    .setDMPermission(true)
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Describe your issue or question.")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const query = interaction.options.getString("query", true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const results = await searchSupportArticles(query, 3);
    if (!results.length) {
      await interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [
          new ContainerBuilder()
            .setAccentColor(0xfaa61a) // Discord yellow ig
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent("🔍 **No Results Found**"),
              new TextDisplayBuilder().setContent(
                "I couldn't find any matching Discord support articles in my local cache. Try rephrasing your query or using different keywords.\n\n**Tips:**\n- Use specific keywords related to your issue\n- Try shorter search terms\n- Check spelling and try variations"
              )
            ),
        ],
      });
      return;
    }

    // consolidate into fewer components
    const mainContainer = new ContainerBuilder()
      .setAccentColor(SUPPORT_COLOR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("📚 **Support Articles Found**"),
        new TextDisplayBuilder().setContent(
          `Found ${results.length} relevant article${results.length > 1 ? "s" : ""} for your query: "${query}"`
        )
      );

    const components: (ContainerBuilder | SectionBuilder | SeparatorBuilder)[] = [mainContainer];

    // add each article as consolidated section (max 3 articles to stay under limit)
    for (const [idx, { article, score }] of results.entries()) {
      const snippet = article.content
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 350);

      const articleId = storeArticle(article);
      const viewButton = new ButtonBuilder()
        .setLabel("📖 View Full Article")
        .setCustomId(buildViewArticleCustomId(articleId))
        .setStyle(ButtonStyle.Primary);

      // add TOC btn if article has many sections (>3)
      const hasManySections = Boolean((articleCache.get(articleId)?._sections && Object.keys(articleCache.get(articleId)?._sections || {}).length > 3));
      const tocButton = new ButtonBuilder()
        .setLabel("📑 Table of contents")
        .setCustomId(`${buildViewArticleCustomId(articleId)}::toc:page:0`)
        .setStyle(ButtonStyle.Secondary);

      // combine article info + metadata into one section
      const metaInfo = `Relevance: ${score.toFixed(1)}${article.createdAt ? ` • Published: ${new Date(article.createdAt).toLocaleDateString()}` : ""}`;
      const linkText = `[Open on Discord Support](${article.htmlUrl})`;

      const articleSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${idx + 1}. ${article.title}**`),
          new TextDisplayBuilder().setContent(snippet || "No preview available."),
          new TextDisplayBuilder().setContent(`*${metaInfo} • ${linkText}*`)
        )
        .setButtonAccessory(viewButton);

      components.push(articleSection);

      if (hasManySections) {
        components.push(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("🔎 Quick jump:"))
            .setButtonAccessory(tocButton)
        );
      }

      if (idx < results.length - 1) {
        components.push(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small)
        );
      }
    }

    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components,
    });
  },
};

export async function handleSupportAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  const focusedValue = interaction.options.getFocused(true);
  if (focusedValue.name !== "query") return;

  const query = focusedValue.value as string;
  const suggestions = await getArticleTitlesForAutocomplete(query);

  await interaction.respond(
    suggestions.slice(0, 25).map((s) => ({
      name: s.name,
      value: s.value,
    }))
  );
}

type ParseResult = { text: string; images: { src: string; alt?: string }[] };

function htmlToDiscordMarkdown(html: string): ParseResult {
  let text = String(html || "");

  // decode common entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—");

  // collect images (but remove them from text)
  const images: { src: string; alt?: string }[] = [];
  text = text.replace(/<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi,
    (_, src, alt) => {
      images.push({ src, alt: alt || undefined });
      return `\n\n[Image: ${alt || "Image"}]\n\n`;
    });

  // code blocks
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, content) => {
    const cleaned = content.replace(/<[^>]+>/g, "").trim();
    return `\n\`\`\`\n${cleaned}\n\`\`\`\n`;
  });
  text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, (_, content) => {
    const cleaned = content.replace(/<[^>]+>/g, "").trim();
    return `\`${cleaned}\``;
  });

  // blockquote
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const cleaned = content.replace(/<[^>]+>/g, "").trim();
    return `\n> ${cleaned}\n`;
  });

  // lists
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    const items = (content.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || []).map((li: string, i: number) =>
      `${i + 1}. ${li.replace(/<[^>]+>/g, "").trim()}`
    );
    return `\n${items.join("\n")}\n\n`;
  });
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    const items = (content.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || []).map((li: string) =>
      `• ${li.replace(/<[^>]+>/g, "").trim()}`
    );
    return `\n${items.join("\n")}\n\n`;
  });

  // headings -> bold short headings only
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, (_, content) => {
    const cleaned = content.replace(/<[^>]+>/g, "").trim();
    return `\n\n**${cleaned}**\n\n`;
  });

  // links: convert anchor-hrefs (#...) to a placeholder
  text = text.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_, href, linkText) => {
    const cleaned = linkText.replace(/<[^>]+>/g, "").trim();
    if (href.startsWith("#")) {
      // mark anchor links (TODO: special token -> build action buttons later)
      return `[[ANCHOR:${href.slice(1)}|${cleaned}]]`;
    }
    return `[${cleaned}](${href})`;
  });

  // moderate bolding & italics
  text = text.replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, (_, __, inner) => `**${inner.replace(/<[^>]+>/g, "")}**`);
  text = text.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, (_, __, inner) => `*${inner.replace(/<[^>]+>/g, "")}*`);
  text = text.replace(/<u[^>]*>(.*?)<\/u>/gi, (_, inner) => `__${inner.replace(/<[^>]+>/g, "")}__`);

  // paragraphs, breaks
  text = text.replace(/<p[^>]*>/gi, "\n\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<br\s*\/?>>/gi, "\n");

  // remove remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // clean whitespace
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]+$/gm, "");
  text = text.trim();

  // notes
  text = text.replace(/\b(Note:?)\s*/gi, "📝 **Note:** ");

  // emoji for headers
  text = text.replace(/\*\*(How to|Steps|Instructions|Guide|Solution|Fix|Troubleshooting|FAQ)\*\*/gi, "🔹 **$1**");
  text = text.replace(/\*\*(Warning|Caution|Danger)\*\*/gi, "⚠️ **$1**");

  return { text, images };
}

export async function handleViewArticle(
  interaction: ButtonInteraction
): Promise<void> {
  const articleId = extractArticleIdFromCustomId(interaction.customId);
  if (!articleId) {
    await interaction.reply({
      content:
        "I couldn't find the article details. Please search again with `/support`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const article = getArticleFromCache(articleId) as CachedArticle | undefined;
  if (!article) {
    await interaction.reply({
      content:
        "This article link has expired. Please search again with `/support`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const parsed = htmlToDiscordMarkdown(article.content || "");
  let contentText = parsed.text;

  const anchorButtonBuilders: ButtonBuilder[] = [];

  contentText = contentText.replace(/\[\[ANCHOR:([^|]+)\|([^\]]+)\]\]/g, (_, anchorId, label) => {
    const sections = (article as any)._sections || {};
    if (sections[anchorId]) {
      const sectionCustomId = `${buildViewArticleCustomId(articleId)}::section:${anchorId}`;
      anchorButtonBuilders.push(
        new ButtonBuilder().setLabel(String(label)).setCustomId(sectionCustomId).setStyle(ButtonStyle.Secondary)
      );
      return `🔗 **${label}** (open below)`;
    }
    return String(label);
  });

  const contentParts: string[] = [];
  contentParts.push(`📖 **${article.title}**`);

  if (contentText && contentText.length > 0) {
    const paragraphChunks = splitIntoParagraphChunks(contentText);
    for (const c of paragraphChunks) contentParts.push(c);
  }

  const textDisplays = buildSafeTextDisplays(contentParts);

  const container = new ContainerBuilder()
    .setAccentColor(SUPPORT_COLOR)
    .addTextDisplayComponents(...textDisplays)
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    );

  const linkButton = new ButtonBuilder()
    .setLabel("🌐 Open on Discord Support")
    .setURL(article.htmlUrl)
    .setStyle(ButtonStyle.Link);

  const linkSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("**View Original Article**")
    )
    .setButtonAccessory(linkButton);

  const components: (ContainerBuilder | SectionBuilder | SeparatorBuilder)[] = [container];

  if (anchorButtonBuilders.length) {
    const quick = anchorButtonBuilders.slice(0, 3);
    components.push(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("🔎 Quick jump:"))
        .setButtonAccessory(quick[0])
    );
    for (let i = 1; i < quick.length; i++) {
      components.push(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent("\u200b"))
          .setButtonAccessory(quick[i])
      );
    }

    if (anchorButtonBuilders.length > 3) {
      const tocBtn = new ButtonBuilder()
        .setLabel("📑 Table of contents")
        .setCustomId(`${buildViewArticleCustomId(articleId)}::toc:page:0`)
        .setStyle(ButtonStyle.Secondary);

      components.push(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent("More sections available:"))
          .setButtonAccessory(tocBtn)
      );
    }
  }

  for (const img of parsed.images) {
    const imgSection = new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(img.alt ? `Image: ${img.alt}` : "\u200b")
    );

    if (typeof (imgSection as any).setImageAccessory === "function") {
      (imgSection as any).setImageAccessory(img.src);
    } else {
      imgSection.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Image: ${img.src}`));
    }
    components.push(imgSection);
  }

  components.push(linkSection);

  await interaction.reply({
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components,
  });
}

// customId format: bugbot-support-view:<id>::section:<sectionId>
export async function handleViewArticleSection(interaction: ButtonInteraction) {
  const parts = interaction.customId.split("::section:");
  const base = parts[0];
  const sectionId = parts[1];
  const articleId = extractArticleIdFromCustomId(base);
  if (!articleId || !sectionId) {
    await interaction.reply({ content: "Could not resolve section.", flags: MessageFlags.Ephemeral });
    return;
  }
  const article = getArticleFromCache(articleId) as CachedArticle | undefined;
  if (!article) {
    await interaction.reply({ content: "This article expired. Please search again.", flags: MessageFlags.Ephemeral });
    return;
  }
  const section = (article._sections || {})[sectionId];
  if (!section) {
    await interaction.reply({ content: "Section not found in article.", flags: MessageFlags.Ephemeral });
    return;
  }

  const parsed = htmlToDiscordMarkdown(section.html || "");
  const displayText = `**${section.title}**\n\n${parsed.text}`;

  const sectionDisplays = buildSafeTextDisplays([displayText]);

  const container = new ContainerBuilder()
    .setAccentColor(SUPPORT_COLOR)
    .addTextDisplayComponents(...sectionDisplays);

  for (const img of parsed.images) {
    const imgSection = new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(img.alt ? `Image: ${img.alt}` : "\u200b")
    );
    
    if (typeof (imgSection as any).setImageAccessory === "function") {
      (imgSection as any).setImageAccessory(img.src);
    } else {
      imgSection.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Image: ${img.src}`));
    }
    container.addSectionComponents(imgSection);
  }

  await interaction.reply({
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [container],
  });
}

// customId format: bugbot-support-view:<id>::toc:page:<n>
export async function handleViewArticleTOC(interaction: ButtonInteraction) {
  const tok = interaction.customId.split("::toc:page:");
  const base = tok[0];
  const pageStr = tok[1] ?? "0";
  const page = Math.max(0, parseInt(pageStr, 10) || 0);
  const articleId = extractArticleIdFromCustomId(base);
  if (!articleId) {
    await interaction.reply({ content: "Could not resolve article for table of contents.", flags: MessageFlags.Ephemeral });
    return;
  }
  const article = getArticleFromCache(articleId) as CachedArticle | undefined;
  if (!article) {
    await interaction.reply({
      content: "This article expired. Please search again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sections = article._sections || {};
  const sectionIds = Object.keys(sections);
  if (!sectionIds.length) {
    await interaction.reply({
      content: "This article has no table of contents.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // pagination
  const pageSize = 5;
  const totalPages = Math.ceil(sectionIds.length / pageSize);
  const currentPage = Math.min(page, Math.max(0, totalPages - 1));

  const slice = sectionIds.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize
  );

  const tocButtons: ButtonBuilder[] = slice.map((sid) =>
    new ButtonBuilder()
      .setLabel(sections[sid].title.slice(0, 80))
      .setCustomId(`${buildViewArticleCustomId(articleId)}::section:${sid}`)
      .setStyle(ButtonStyle.Secondary)
  );

  const prevBtn =
    currentPage > 0
      ? new ButtonBuilder()
          .setLabel("Previous")
          .setCustomId(
            `${buildViewArticleCustomId(articleId)}::toc:page:${currentPage - 1}`
          )
          .setStyle(ButtonStyle.Primary)
      : null;

  const nextBtn =
    currentPage < totalPages - 1
      ? new ButtonBuilder()
          .setLabel("Next")
          .setCustomId(
            `${buildViewArticleCustomId(articleId)}::toc:page:${currentPage + 1}`
          )
          .setStyle(ButtonStyle.Primary)
      : null;

  const tocParts = [
    `📑 **Table of Contents**`,
    `Page ${currentPage + 1} of ${totalPages}`,
  ];
  const tocDisplays = buildSafeTextDisplays(tocParts);

  const container = new ContainerBuilder()
    .setAccentColor(SUPPORT_COLOR)
    .addTextDisplayComponents(...tocDisplays);

  for (const btn of tocButtons) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("\u200b"))
        .setButtonAccessory(btn)
    );
  }

  const paginationSection = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("\u200b")
  );
  if (prevBtn) paginationSection.setButtonAccessory(prevBtn);
  if (!prevBtn && nextBtn) paginationSection.setButtonAccessory(nextBtn);

  const components: (ContainerBuilder | SectionBuilder | SeparatorBuilder)[] = [
    container,
  ];
  if (prevBtn || nextBtn) components.push(paginationSection);

  await interaction.reply({
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components,
  });
}