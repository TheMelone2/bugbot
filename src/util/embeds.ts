import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import type { BugReport } from "../types/BugReport.js";

const BUGBOT_COLOR = 0x5865f2; // blurple ig

export function buildBugReportEmbed(
  report: BugReport,
  url: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🐞 Bug report prepared")
    .setDescription(
      "Here’s your polished Discord bug report. Review it, then open the official form to submit."
    )
    .setColor(BUGBOT_COLOR)
    .addFields(
      {
        name: "Title",
        value: truncate(report.title || "Untitled bug report", 256),
      },
      {
        name: "Summary",
        value: truncate(report.description || "No description provided.", 1024),
      },
      {
        name: "Status",
        value: "✅ Ready to submit",
      }
    )
    .setURL(url)
    .setFooter({
      text: "Bugot · Built for power reporters and everyday Discord users",
    });

  return embed;
}

export function buildBugReportComponents(
  url: string,
  detailsCustomId?: string
) {
  const linkButton = new ButtonBuilder()
    .setLabel("Open Discord bug form")
    .setStyle(ButtonStyle.Link)
    .setURL(url);

  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton),
  ];

  if (detailsCustomId) {
    const detailsButton = new ButtonBuilder()
      .setCustomId(detailsCustomId)
      .setLabel("View full report")
      .setStyle(ButtonStyle.Secondary);

    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(detailsButton)
    );
  }

  return rows;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}