import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
  type ButtonInteraction,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { Command } from "./Command.js";
import type { BugReport, BugReportInput } from "../types/BugReport.js";
import { generateBugReport } from "../ai/index.js";
import { buildBugReportUrl } from "../util/bugSite.js";
import { searchSupportArticles } from "../support/articleIndex.js";

export const BUGREPORT_MODAL_ID = "bugbot-bugreport-modal";
export const BUGREPORT_DETAILS_BUTTON_PREFIX =
  "bugbot-bugreport-details:";
export const BUGREPORT_SUGGESTION_PREFIX = "bugbot-bugreport-suggestion:";

const inMemoryReports = new Map<string, BugReport>();

function storeBugReport(report: BugReport): string {
  const id = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  inMemoryReports.set(id, report);

  // cleanup after 30 minutes so memory doesn't grow unbounded
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
    .setDMPermission(true)
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    const modal = new ModalBuilder()
      .setCustomId(BUGREPORT_MODAL_ID)
      .setTitle("BugBot – Discord bug report");

    const summaryInput = new TextInputBuilder()
      .setCustomId("summary")
      .setLabel("Short title / summary")
      .setPlaceholder("e.g., Messages not loading on mobile")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(150);

    const severityInput = new TextInputBuilder()
      .setCustomId("severity")
      .setLabel("Severity (optional)")
      .setPlaceholder("low / medium / high / critical")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(50);

    const descriptionInput = new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Describe what happens")
      .setPlaceholder("Explain the issue in detail...")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1900);

    const stepsInput = new TextInputBuilder()
      .setCustomId("steps")
      .setLabel("Steps to reproduce (optional)")
      .setPlaceholder("1. Open Discord\n2. Go to settings\n3. Click...")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1500);

    const environmentInput = new TextInputBuilder()
      .setCustomId("environment")
      .setLabel("Environment (optional)")
      .setPlaceholder("Platform: Desktop | OS: Windows 11 | Version: 1.0.0")
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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    console.log(
      `[BugBot] Generating bug report via AI for modal submit ${interaction.id}…`
    );

    const report = await generateBugReport(input);
    const url = buildBugReportUrl(report);
    const storeId = storeBugReport(report);
    const detailsCustomId = buildDetailsCustomId(storeId);

    const searchQuery = `${summary} ${detailedDescription}`.slice(0, 200);
    const suggestions = await searchSupportArticles(searchQuery, 3);

    const textDisplays: TextDisplayBuilder[] = [
      new TextDisplayBuilder().setContent("✅ **Bug Report Ready!**"),
      new TextDisplayBuilder().setContent(
        "Your bug report has been polished and is ready to submit. Review the details below, then click the button to open Discord's official bug report form with everything pre-filled."
      ),
      new TextDisplayBuilder().setContent("📋 **Title**"),
      new TextDisplayBuilder().setContent(
        report.title || "Untitled bug report"
      ),
      new TextDisplayBuilder().setContent("📝 **Description**"),
      new TextDisplayBuilder().setContent(
        (report.description || "No description provided.").slice(0, 1000)
      ),
    ];

    if (report.stepsToReproduce?.length) {
      const stepsText = report.stepsToReproduce
        .map((step, idx) => `${idx + 1}. ${step}`)
        .join("\n");
      textDisplays.push(
        new TextDisplayBuilder().setContent("🔢 **Steps to Reproduce**"),
        new TextDisplayBuilder().setContent(stepsText.slice(0, 1000))
      );
    }

    if (report.environment) {
      const envParts: string[] = [];
      if (report.environment.platform)
        envParts.push(`Platform: ${report.environment.platform}`);
      if (report.environment.os) envParts.push(`OS: ${report.environment.os}`);
      if (report.environment.appVersion)
        envParts.push(`App Version: ${report.environment.appVersion}`);
      if (envParts.length) {
        textDisplays.push(
          new TextDisplayBuilder().setContent("💻 **Environment**"),
          new TextDisplayBuilder().setContent(envParts.join(" | "))
        );
      }
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x5865f2) // Discord blurple
      .addTextDisplayComponents(...textDisplays)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small)
      );

    const components: (ContainerBuilder | SeparatorBuilder | ActionRowBuilder<ButtonBuilder>)[] = [container];

    // Add action buttons as ActionRow
    const openFormButton = new ButtonBuilder()
      .setLabel("📤 Open Discord Bug Form")
      .setURL(url)
      .setStyle(ButtonStyle.Link);

    const viewDetailsButton = new ButtonBuilder()
      .setLabel("📄 View Full Report")
      .setCustomId(detailsCustomId)
      .setStyle(ButtonStyle.Secondary);

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      openFormButton,
      viewDetailsButton
    );

    components.push(actionRow);

    if (suggestions.length > 0) {
      components.push(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large)
      );

      const suggestionTexts: TextDisplayBuilder[] = [
        new TextDisplayBuilder().setContent("💡 **Helpful Suggestions**"),
        new TextDisplayBuilder().setContent(
          "Based on your bug report, here are some relevant Discord support articles that might help:"
        ),
      ];

      for (const [idx, { article }] of suggestions.entries()) {
        suggestionTexts.push(
          new TextDisplayBuilder().setContent(`${idx + 1}. ${article.title}`)
        );
      }

      const suggestionsContainer = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(...suggestionTexts);

      components.push(suggestionsContainer);

      const suggestionButtons = suggestions.map(({ article }) =>
        new ButtonBuilder()
          .setLabel(`📚 ${article.title.slice(0, 70)}`)
          .setURL(article.htmlUrl)
          .setStyle(ButtonStyle.Link)
      );

      const suggestionsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...suggestionButtons
      );
      components.push(suggestionsRow);
    }

    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components,
    });
  } catch (err) {
    console.error("Failed to generate bug report from modal:", err);
    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder()
          .setAccentColor(0xed4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("❌ **Error**"),
            new TextDisplayBuilder().setContent(
              "Sorry, I couldn't generate the bug report automatically. Please try again in a moment."
            )
          ),
      ],
    });
  }
}

export async function handleBugReportDetailsButton(
  interaction: ButtonInteraction
): Promise<void> {
  const id = extractIdFromCustomId(interaction.customId);
  if (!id) {
    await interaction.reply({
      content:
        "I couldn't find the details for this bug report button. Please run `/bugreport` again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const report = inMemoryReports.get(id);
  if (!report) {
    await interaction.reply({
      content:
        "This bug report details link has expired. Please generate a new report with `/bugreport`.",
      flags: MessageFlags.Ephemeral,
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
    flags: MessageFlags.Ephemeral,
  });
}