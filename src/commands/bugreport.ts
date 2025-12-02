import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
  type ButtonInteraction,
} from "discord.js";
import type { Command } from "./Command.js";
import type { BugReport, BugReportInput } from "../types/BugReport.js";
import { generateBugReport } from "../ai/index.js";
import { buildBugReportUrl } from "../util/bugSite.js";
import {
  buildBugReportComponents,
  buildBugReportEmbed,
} from "../util/embeds.js";

export const BUGREPORT_MODAL_ID = "bugbot-bugreport-modal";
export const BUGREPORT_DETAILS_BUTTON_PREFIX =
  "bugbot-bugreport-details:";

const inMemoryReports = new Map<string, BugReport>();

function storeBugReport(report: BugReport): string {
  const id = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  inMemoryReports.set(id, report);

  // best-effort cleanup after 30 minutes so memory doesn’t grow unbounded
  setTimeout(() => {
    inMemoryReports.delete(id);
  }, 1000 * 60 * 30).unref?.();

  return id;
}

function buildDetailsCustomId(id: string): string {
  return `${BUGREPORT_DETAILS_BUTTON_PREFIX}${id}`;
}

function extractIdFromCustomId(customId: string): string | null {
  if (!customId.startsWith(BUGREPORT_DETAILS_BUTTON_PREFIX)) return null;
  return customId.slice(BUGREPORT_DETAILS_BUTTON_PREFIX.length);
}

export const bugReportCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("bugreport")
    .setDescription(
      "Open a Discord modal to turn an issue into a polished bug report with AI."
    )
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content:
          "BugBot currently only supports bug reporting inside servers (not DMs).",
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(BUGREPORT_MODAL_ID)
      .setTitle("BugBot – Discord bug report");

    const summaryInput = new TextInputBuilder()
      .setCustomId("summary")
      .setLabel("Short title / summary")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(150);

    const severityInput = new TextInputBuilder()
      .setCustomId("severity")
      .setLabel("Severity (low / medium / high / critical)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(50);

    const descriptionInput = new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Describe what happens")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1900);

    const stepsInput = new TextInputBuilder()
      .setCustomId("steps")
      .setLabel("Steps to reproduce (one per line)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1500);

    const environmentInput = new TextInputBuilder()
      .setCustomId("environment")
      .setLabel("Environment (platform, OS, version)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(summaryInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(severityInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(stepsInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(environmentInput)
    );

    await interaction.showModal(modal);
  },
};

export async function handleBugReportModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  const summary = interaction.fields.getTextInputValue("summary").trim();
  const severityRaw =
    interaction.fields.getTextInputValue("severity")?.trim() ?? "";
  const detailedDescription = interaction.fields
    .getTextInputValue("description")
    .trim();
  const stepsRaw =
    interaction.fields.getTextInputValue("steps")?.trim() ?? "";
  const environmentNotes =
    interaction.fields.getTextInputValue("environment")?.trim() ?? "";

  const severity = severityRaw || undefined;
  const steps = stepsRaw
    ? stepsRaw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  const input: BugReportInput = {
    rawSummary: summary,
    detailedDescription,
    steps,
    environmentNotes,
    severity,
  };

  await interaction.deferReply({ ephemeral: true });

  try {
    console.log(
      `[BugBot] Generating bug report via AI for modal submit ${interaction.id}…`
    );

    const report = await generateBugReport(input);
    const url = buildBugReportUrl(report);
    const embed = buildBugReportEmbed(report, url);
    const storeId = storeBugReport(report);
    const detailsCustomId = buildDetailsCustomId(storeId);

    await interaction.editReply({
      content:
        "Here’s your polished bug report. Review it and then click the button below to open the official Discord bug report form with everything pre-filled.",
      embeds: [embed],
      components: buildBugReportComponents(url, detailsCustomId),
    });
  } catch (err) {
    console.error("Failed to generate bug report from modal:", err);
    await interaction.editReply(
      "Sorry, I couldn’t generate the bug report automatically. Please try again in a moment."
    );
  }
}

export async function handleBugReportDetailsButton(
  interaction: ButtonInteraction
): Promise<void> {
  const id = extractIdFromCustomId(interaction.customId);
  if (!id) {
    await interaction.reply({
      content:
        "I couldn’t find the details for this bug report button. Please run `/bugreport` again.",
      ephemeral: true,
    });
    return;
  }

  const report = inMemoryReports.get(id);
  if (!report) {
    await interaction.reply({
      content:
        "This bug report details link has expired. Please generate a new report with `/bugreport`.",
      ephemeral: true,
    });
    return;
  }

  const lines: string[] = [];
  lines.push(`**Title:** ${report.title || "Untitled bug report"}`);
  lines.push("");
  lines.push(`**Summary:**`);
  lines.push(report.description || "_No description provided._");

  if (report.stepsToReproduce?.length) {
    lines.push("");
    lines.push("**Steps to reproduce:**");
    for (const [idx, step] of report.stepsToReproduce.entries()) {
      lines.push(`${idx + 1}. ${step}`);
    }
  }

  const env = report.environment || {};
  const envParts: string[] = [];
  if (env.platform) envParts.push(`Platform: ${env.platform}`);
  if (env.os) envParts.push(`OS: ${env.os}`);
  if (env.appVersion) envParts.push(`App version: ${env.appVersion}`);
  if (env.networkInfo) envParts.push(`Network: ${env.networkInfo}`);
  if (env.additionalDetails)
    envParts.push(`Additional: ${env.additionalDetails}`);

  if (envParts.length) {
    lines.push("");
    lines.push("**Environment:**");
    lines.push(envParts.join(" | "));
  }

  if (report.severity || report.component) {
    lines.push("");
    lines.push("**Meta:**");
    if (report.severity) lines.push(`Severity: ${report.severity}`);
    if (report.component) lines.push(`Component: ${report.component}`);
  }

  await interaction.reply({
    content: lines.join("\n"),
    ephemeral: true,
  });
}