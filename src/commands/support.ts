import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "./Command.js";
import { searchSupportArticles } from "../support/articleIndex.js";

const SUPPORT_COLOR = 0x57f287; // discord "success" green-ish

export const supportCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Search official Discord support articles that match your issue.")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Describe your issue or question.")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const query = interaction.options.getString("query", true);

    await interaction.deferReply({ ephemeral: true });

    const results = await searchSupportArticles(query, 3);
    if (!results.length) {
      await interaction.editReply(
        "I couldn’t find any matching Discord support articles in my local cache. Try rephrasing your query or a different keyword."
      );
      return;
    }

    const embeds = results.map(({ article, score }, idx) => {
      const snippet = article.content
        .replace(/<[^>]+>/g, " ") // strip basic HTML tags
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);

      const embed = new EmbedBuilder()
        .setColor(SUPPORT_COLOR)
        .setTitle(`${idx + 1}. ${article.title}`)
        .setURL(article.htmlUrl)
        .setDescription(snippet || "No preview available.")
        .addFields({
          name: "Match score",
          value: score.toFixed(1),
          inline: true,
        });

      if (article.createdAt) {
        embed.addFields({
          name: "Published",
          value: new Date(article.createdAt).toLocaleDateString(),
          inline: true,
        });
      }

      return embed;
    });

    await interaction.editReply({
      content:
        "Here are the most relevant Discord support articles I found for your query:",
      embeds,
    });
  },
};