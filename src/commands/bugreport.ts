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
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { Command } from "./Command.js";
import type { BugReport, BugReportInput } from "../types/BugReport.js";
import { generateBugReport } from "../ai/index.js";
import { NeedMoreInfoError } from "../ai/errors.js";
import { buildBugReportUrl } from "../util/bugSite.js";
import { searchSupportArticles } from "../support/articleIndex.js";
import { saveFeedback, type Feedback } from "../util/feedback.js";

export const BUGREPORT_MODAL_ID = "bugbot-bugreport-modal";
export const BUGREPORT_OPEN_MODAL_BUTTON_ID = "bugbot-bugreport-open-modal";
export const BUGREPORT_GUIDE_PAGE_PREFIX = "bugbot-bugreport-guide-page:";
export const BUGREPORT_SKIP_TO_MODAL_BUTTON_ID = "bugbot-bugreport-skip-to-modal";
export const BUGREPORT_DETAILS_BUTTON_PREFIX =
  "bugbot-bugreport-details:";
export const BUGREPORT_SUGGESTION_PREFIX = "bugbot-bugreport-suggestion:";
export const BUGREPORT_FOLLOWUP_BUTTON_PREFIX = "bugbot-bugreport-followup:";
export const BUGREPORT_FOLLOWUP_MODAL_PREFIX = "bugbot-bugreport-followup-modal:";
export const BUGREPORT_REASONING_BUTTON_PREFIX = "bugbot-bugreport-reasoning:";
export const BUGREPORT_GENERATE_ANYWAYS_PREFIX = "bugbot-bugreport-generate-anyways:";
export const BUGREPORT_FEEDBACK_MISSING_PREFIX = "bugbot-feedback-missing:";
export const BUGREPORT_FEEDBACK_REPORT_PREFIX = "bugbot-feedback-report:";
export const BUGREPORT_FEEDBACK_SATISFACTION_PREFIX = "bugbot-feedback-satisfaction:";

const inMemoryReports = new Map<string, BugReport>();
const pendingFollowups = new Map<
  string,
  {
    input: BugReportInput;
    missingFields: { id: string; label: string }[];
    details?: string;
  }
>();
const pendingFollowupTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function setPendingFollowup(id: string, value: { input: BugReportInput; missingFields: { id: string; label: string }[]; details?: string }) {
  pendingFollowups.set(id, value);
  const prev = pendingFollowupTimeouts.get(id);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    pendingFollowups.delete(id);
    pendingFollowupTimeouts.delete(id);
  }, 1000 * 60 * 30);
  pendingFollowupTimeouts.set(id, t);
}

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

/**
 * Checks if a field contains full bug report JSON and extracts  --> Returns the parsed bug report object if found, null otherwise
 */
function extractBugReportFromField(fieldValue: string | undefined | null): Partial<BugReport> | null {
  if (!fieldValue) return null;
  
  let trimmed = fieldValue.trim();
  // rm markdown code blocks
  trimmed = trimmed.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  
  if (!trimmed.startsWith("{")) return null;
  
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const hasTitle = "title" in obj;
      const hasDescription = "description" in obj;
      const hasSteps = "stepsToReproduce" in obj;
      const hasEnvironment = "environment" in obj;
      const hasBugReportFields = (hasTitle || hasDescription || hasSteps || hasEnvironment) && Object.keys(obj).length >= 2;
      
      if (hasBugReportFields) {
        return obj as Partial<BugReport>;
      }
    }
  } catch {
    // not valid JSON
  }
  
  return null;
}

function formatText(text: string | undefined | null, extractField?: string, depth = 0): string {
  if (!text) return "";
  
  // prevent infinite recursion
  if (depth > 2) return text;
  
  let trimmed = text.trim();
  
  // rm markdown code blocks if present (```json ... ``` | ``` ... ```)
  trimmed = trimmed.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return text;
  }
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return trimmed.replace(/\s+/g, " ").slice(0, 1000);
      }
    } else {
      return text;
    }
  }
  
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    
    const hasTitle = "title" in obj;
    const hasDescription = "description" in obj;
    const hasSteps = "stepsToReproduce" in obj;
    const hasEnvironment = "environment" in obj;
    const hasBugReportFields = (hasTitle || hasDescription || hasSteps || hasEnvironment) && Object.keys(obj).length >= 2;
    
      if (hasBugReportFields) {
        const isPlaceholder = (value: string): boolean => {
          const placeholders = [
            "detailed description from input",
            "detailed description",
            "description from input",
            "clear title from input",
            "untitled bug report",
            "no description provided"
          ];
          return placeholders.some(p => value.toLowerCase().includes(p));
        };
        
        if (extractField) {
          if (extractField in obj) {
            const fieldValue = obj[extractField];
            if (typeof fieldValue === "string" && fieldValue.trim()) {
              const trimmed = fieldValue.trim();
              if (isPlaceholder(trimmed)) {
                return formatBugReportObject(obj);
              }
              return trimmed;
            }
            if (Array.isArray(fieldValue)) {
              return formatObject(fieldValue);
            }
            if (fieldValue !== null && fieldValue !== undefined) {
              return String(fieldValue);
            }
          }
          return formatBugReportObject(obj);
        }
        
        return formatBugReportObject(obj);
      }
    
    return formatObject(parsed);
  }
  
  if (Array.isArray(parsed)) {
    return formatObject(parsed);
  }
  
  return String(parsed);
}


function formatBugReportObject(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  
  if (obj.title && typeof obj.title === "string") {
    parts.push(`**Title:** ${obj.title}`);
  }
  
  if (obj.description && typeof obj.description === "string") {
    parts.push(`**Description:**\n${obj.description}`);
  }
  
  if (obj.stepsToReproduce && Array.isArray(obj.stepsToReproduce)) {
    const steps = obj.stepsToReproduce
      .map((step, idx) => `${idx + 1}. ${String(step)}`)
      .join("\n");
    parts.push(`**Steps to Reproduce:**\n${steps}`);
  }
  
  if (obj.environment && typeof obj.environment === "object" && obj.environment !== null) {
    const env = obj.environment as Record<string, unknown>;
    const envParts: string[] = [];
    if (env.platform) envParts.push(`Platform: ${env.platform}`);
    if (env.clientType) envParts.push(`Client: ${env.clientType}`);
    if (env.os) envParts.push(`OS: ${env.os}`);
    if (env.appVersion) envParts.push(`App Version: ${env.appVersion}`);
    if (env.clientInfo) envParts.push(`Client Info: ${env.clientInfo}`);
    if (env.browserType) envParts.push(`Browser: ${env.browserType}`);
    if (envParts.length) {
      parts.push(`**Environment:** ${envParts.join(" | ")}`);
    }
  } 
  
  if (obj.severity && typeof obj.severity === "string") {
    parts.push(`**Severity:** ${obj.severity}`);
  }
  
  if (obj.component && typeof obj.component === "string") {
    parts.push(`**Component:** ${obj.component}`);
  }
  
  if (obj.reasoning && typeof obj.reasoning === "string") {
    parts.push(`**AI Reasoning:**\n${obj.reasoning}`);
  }
  
  if (obj.reproducibilityScore && typeof obj.reproducibilityScore === "number") {
    parts.push(`**Reproducibility Score:** ${obj.reproducibilityScore}/100`);
  }
  
  return parts.join("\n\n");
}


function formatObject(obj: unknown, indent = 0): string {
  if (obj === null) return "null";
  if (obj === undefined) return "undefined";
  
  if (typeof obj === "string") return obj;
  if (typeof obj !== "object") return String(obj);
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj
      .map((item, idx) => {
        const formatted = typeof item === "object" && item !== null
          ? formatObject(item, indent + 1)
          : String(item);
        return `${idx + 1}. ${formatted}`;
      })
      .join("\n");
  }
  
  // It's an object wow
  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  
  return entries
    .map(([key, value]) => {
      const formattedValue = typeof value === "object" && value !== null
        ? formatObject(value, indent + 1)
        : String(value ?? "");
      return `${key}: ${formattedValue}`;
    })
    .join("\n");
}


function buildBugReportModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(BUGREPORT_MODAL_ID)
    .setTitle("BugBot - Discord Bug Report");

  // required
  const summaryInput = new TextInputBuilder()
    .setCustomId("summary")
    .setLabel("📋 Title / Summary (Required)")
    .setPlaceholder("Brief title (e.g., Messages not loading on mobile)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(150);

  const descriptionInput = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("📝 Describe What Happens (Required)")
    .setPlaceholder("What you expected vs what happened, error messages, when it started")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1900);

  // optional
  const stepsInput = new TextInputBuilder()
    .setCustomId("steps")
    .setLabel("🔢 Steps to Reproduce (Required)")
    .setPlaceholder("1. Open Discord 2. Navigate to... 3. Click... 4. Observe issue")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1500);

  const environmentInput = new TextInputBuilder()
    .setCustomId("environment")
    .setLabel("💻 Environment Info (Required)")
    .setPlaceholder("Platform: Desktop | OS: Windows 11 | Version: 1.0.0 | Build: 123456")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  // other
  const severityInput = new TextInputBuilder()
    .setCustomId("severity")
    .setLabel("⚠️ Impact Description (Optional)")
    .setPlaceholder("What it impacts and how much (e.g., messaging - blocks feature)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(50);


  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(summaryInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(stepsInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(environmentInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(severityInput)
  );

  return modal;
}

async function showGuidePage(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  page: number
): Promise<void> {
    const pages = [
      // Page 0 (index): Introduction (What do u need)
      {
        container: new ContainerBuilder()
          .setAccentColor(0x5865f2)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("🤖 **BugBot - AI-Powered Bug Report Assistant**"),
            new TextDisplayBuilder().setContent(
              "BugBot helps you create polished, professional bug reports for Discord. " +
              "This tool **uses AI** to improve and structure your bug reports. Please be advised that **you have to verify all information** before submitting."
            ),
            new TextDisplayBuilder().setContent("**📋 What You Need for a Good Bug Report:**"),
            new TextDisplayBuilder().setContent(
              "• **Clear title** describing the issue\n" +
              "• **Detailed description** of what happens\n" +
              "• **Steps to reproduce** the issue\n" +
              "• **Environment information** (platform, OS, Discord version)\n" +
              "• **Impact description** (what feature is affected and how much)"
            )
          )
          .addSeparatorComponents(
            new SeparatorBuilder()
              .setDivider(true)
              .setSpacing(SeparatorSpacingSize.Small)
          ),
      },
      // Page 1: What BugBot Does (... ig running on a machine?)
      {
        container: new ContainerBuilder()
          .setAccentColor(0x57f287)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("✨ **What BugBot Will Do:**"),
            new TextDisplayBuilder().setContent(
              "BugBot will:\n" +
              "• **Structure** your information into a professional format\n" +
              "• **Polish** your description for clarity and completeness\n" +
              "• **Organize** steps to reproduce in a clear sequence\n" +
              "• **Format** environment details consistently\n" +
              "• **Generate** a pre-filled link to Discord's bug report form"
            ),
            new TextDisplayBuilder().setContent("**⚠️ Important: AI-Generated Content Warning**"),
            new TextDisplayBuilder().setContent(
              "**Always double-check the generated report!**\n" +
              "• AI may infer or add information you didn't provide\n" +
              "• Verify all details are accurate and truthful\n" +
              "• This is a **tool to improve** your reports, not a replacement for your judgment\n" +
              "• **Never trust AI-generated content 100%** - review everything before submitting"
            )
          )
          .addSeparatorComponents(
            new SeparatorBuilder()
              .setDivider(true)
              .setSpacing(SeparatorSpacingSize.Small)
          ),
      },
      // Page 2: Helpful Resources
      {
        container: new ContainerBuilder()
          .setAccentColor(0xf1c40f)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("📚 **Helpful Resources:**"),
            new TextDisplayBuilder().setContent(
              "**Finding Your Client Information:**\n" +
              "Discord requires specific client details to reproduce bugs. " +
              "Click the button below to learn how to find your client info."
            )
          ),
        sections: [
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent("**📚 Discord Support Article**")
            )
            .setButtonAccessory(
              new ButtonBuilder()
                .setLabel("How to Find Client Info")
                .setURL("https://support.discord.com/hc/en-us/articles/360052735334-How-do-I-find-my-client-info")
                .setStyle(ButtonStyle.Link)
            ),
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent("**💻 BugBot on GitHub**")
            )
            .setButtonAccessory(
              new ButtonBuilder()
                .setLabel("View Source Code")
                .setURL("https://github.com/TheMelone2/bugbot")
                .setStyle(ButtonStyle.Link)
            ),
        ],
      },
    ];

    const currentPage = pages[page];
    if (!currentPage) {
      // fallback to page 0 if invalid page
      return showGuidePage(interaction, 0);
    }

    const components: (ContainerBuilder | SectionBuilder | SeparatorBuilder | ActionRowBuilder<ButtonBuilder>)[] = [
      currentPage.container,
    ];

    if (currentPage.sections) {
      components.push(...currentPage.sections);
    }

    // pagination btns
    const prevButton = page > 0
      ? new ButtonBuilder()
          .setLabel("◀ Previous")
          .setCustomId(`${BUGREPORT_GUIDE_PAGE_PREFIX}${page - 1}`)
          .setStyle(ButtonStyle.Secondary)
      : null;

    const nextButton = page < pages.length - 1
      ? new ButtonBuilder()
          .setLabel("Next ▶")
          .setCustomId(`${BUGREPORT_GUIDE_PAGE_PREFIX}${page + 1}`)
          .setStyle(ButtonStyle.Secondary)
      : null;

    const skipButton = new ButtonBuilder()
      .setLabel("✓ I Know, Skip to Form")
      .setCustomId(BUGREPORT_SKIP_TO_MODAL_BUTTON_ID)
      .setStyle(ButtonStyle.Primary);

    const openModalButton = new ButtonBuilder()
      .setLabel("📝 Open Bug Report Form")
      .setCustomId(BUGREPORT_OPEN_MODAL_BUTTON_ID)
      .setStyle(ButtonStyle.Primary);

    const buttonRow: ButtonBuilder[] = [];
    if (prevButton) buttonRow.push(prevButton);
    if (nextButton) buttonRow.push(nextButton);
    buttonRow.push(skipButton);
    if (page === pages.length - 1) {
      buttonRow.push(openModalButton);
    }

    if (buttonRow.length > 0) {
      components.push(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Large),
        new ActionRowBuilder<ButtonBuilder>().addComponents(...buttonRow)
      );
    }

    if (interaction.isButton()) {
      await interaction.update({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        components,
      });
    } else {
      await interaction.reply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        components,
      });
    }
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
    // page 0
    await showGuidePage(interaction, 0);
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
    
    // Check if description or title contains a full bug report JSON
    const extractedFromDescription = extractBugReportFromField(report.description);
    const extractedFromTitle = extractBugReportFromField(report.title);
    const extractedReport = extractedFromDescription || extractedFromTitle;
    
    // Use extracted report data if found, otherwise use original report
    const displayReport = extractedReport ? { ...report, ...extractedReport } : report;
    
    // Store the displayReport (with extracted data) so reasoning and other fields are available
    const url = buildBugReportUrl(report);
    const storeId = storeBugReport(displayReport);
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
        formatText(displayReport.title) || "Untitled bug report"
      ),
      new TextDisplayBuilder().setContent("📝 **Description**"),
      new TextDisplayBuilder().setContent(
        formatText(displayReport.description || "No description provided.", "description").slice(0, 1000)
      ),
    ];

    if (displayReport.stepsToReproduce?.length) {
      const stepsText = displayReport.stepsToReproduce
        .map((step, idx) => `${idx + 1}. ${formatText(step)}`)
        .join("\n");
      textDisplays.push(
        new TextDisplayBuilder().setContent("🔢 **Steps to Reproduce**"),
        new TextDisplayBuilder().setContent(stepsText.slice(0, 1000))
      );
    }

    if (displayReport.environment) {
      const envParts: string[] = [];
      if (displayReport.environment.platform)
        envParts.push(`Platform: ${displayReport.environment.platform}`);
      if (displayReport.environment.clientType)
        envParts.push(`Client: ${displayReport.environment.clientType}`);
      if (displayReport.environment.os) envParts.push(`OS: ${displayReport.environment.os}`);
      if (displayReport.environment.appVersion)
        envParts.push(`App Version: ${displayReport.environment.appVersion}`);
      if (displayReport.environment.clientInfo)
        envParts.push(`Client Info: ${displayReport.environment.clientInfo}`);
      if (envParts.length) {
        textDisplays.push(
          new TextDisplayBuilder().setContent("💻 **Environment**"),
          new TextDisplayBuilder().setContent(envParts.join(" | "))
        );
      }
    }

    // add reproducibility score
    if (displayReport.reproducibilityScore !== undefined) {
      const score = displayReport.reproducibilityScore;
      const scoreEmoji = score >= 70 ? "✅" : score >= 40 ? "⚠️" : "❌";
      textDisplays.push(
        new TextDisplayBuilder().setContent(`${scoreEmoji} **Reproducibility Score: ${score}/100**`)
      );
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplayComponents(...textDisplays)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small)
      );

    const components: (ContainerBuilder | SeparatorBuilder | ActionRowBuilder<ButtonBuilder>)[] = [container];

    //action buttons 
    const openFormButton = new ButtonBuilder()
      .setLabel("📤 Open Discord Bug Form")
      .setURL(url)
      .setStyle(ButtonStyle.Link);

    const viewDetailsButton = new ButtonBuilder()
      .setLabel("📄 View Full Report")
      .setCustomId(detailsCustomId)
      .setStyle(ButtonStyle.Secondary);

    const reasoningButton = new ButtonBuilder()
      .setLabel("🧠 Show AI Reasoning")
      .setCustomId(`${BUGREPORT_REASONING_BUTTON_PREFIX}${storeId}`)
      .setStyle(ButtonStyle.Secondary);

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      openFormButton,
      viewDetailsButton,
      reasoningButton
    );

    components.push(actionRow);

    // feedback 
    components.push(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    );

    const feedbackContainer = new ContainerBuilder()
      .setAccentColor(0x99aab5)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("💬 **Help Improve BugBot**"),
        new TextDisplayBuilder().setContent("Was this report helpful? Your feedback helps us improve!")
      );

    const feedbackRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("👍 Good")
        .setCustomId(`${BUGREPORT_FEEDBACK_SATISFACTION_PREFIX}${storeId}:5`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setLabel("👍👎 Neutral")
        .setCustomId(`${BUGREPORT_FEEDBACK_SATISFACTION_PREFIX}${storeId}:3`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setLabel("👎 Poor")
        .setCustomId(`${BUGREPORT_FEEDBACK_SATISFACTION_PREFIX}${storeId}:1`)
        .setStyle(ButtonStyle.Danger)
    );

    components.push(feedbackContainer, feedbackRow);

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
    // special flow ->  NeedMoreInfoError: prompt the user to supply missing fields
    if (err instanceof NeedMoreInfoError) {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

      // convert missing field labels into short ids and store mapping
      const mf = (err.missingFields ?? []).map((label, idx) => ({
        id: `m${idx}_${Math.random().toString(36).slice(2,6)}`,
        label,
      }));

      setPendingFollowup(id, { input, missingFields: mf, details: err.details });

      const missingList = mf.map((f) => `• ${f.label}`).join("\n") || "(unspecified)";

      const container = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("⚠️ **Missing Information Needed**"),
          new TextDisplayBuilder().setContent(
            `I need a few more pieces of information to generate the bug report:\n${missingList}`
          ),
          new TextDisplayBuilder().setContent(err.details || "Please provide the missing fields."),
          new TextDisplayBuilder().setContent("**⚠️ Warning:** Generating without this information may result in an incomplete or inaccurate report.")
        );

      const followupButton = new ButtonBuilder()
        .setLabel("✏️ Provide missing fields")
        .setCustomId(`${BUGREPORT_FOLLOWUP_BUTTON_PREFIX}${id}`)
        .setStyle(ButtonStyle.Primary);

      const generateAnywaysButton = new ButtonBuilder()
        .setLabel("⚠️ Generate Anyways")
        .setCustomId(`${BUGREPORT_GENERATE_ANYWAYS_PREFIX}${id}`)
        .setStyle(ButtonStyle.Danger);

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        followupButton,
        generateAnywaysButton
      );

      // feedback buttons for missing info
      const feedbackContainer = new ContainerBuilder()
        .setAccentColor(0x99aab5)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("💬 **Was this request appropriate?**"),
          new TextDisplayBuilder().setContent("Help us improve by rating if asking for this information was suitable.")
        );

      const feedbackRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("✅ Appropriate")
          .setCustomId(`${BUGREPORT_FEEDBACK_MISSING_PREFIX}${id}:true`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setLabel("❌ Not Needed")
          .setCustomId(`${BUGREPORT_FEEDBACK_MISSING_PREFIX}${id}:false`)
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [
          container,
          buttonRow,
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
          feedbackContainer,
          feedbackRow
        ],
      });

      return;
    }
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
  lines.push(`**Title:** ${formatText(report.title) || "Untitled bug report"}`);
  lines.push("");
  lines.push(`**Summary:**`);
  lines.push(formatText(report.description, "description") || "_No description provided._");

  if (report.stepsToReproduce?.length) {
    lines.push("");
    lines.push("**Steps to reproduce:**");
    for (const [idx, step] of report.stepsToReproduce.entries()) {
      lines.push(`${idx + 1}. ${formatText(step)}`);
    }
  }

  const env = report.environment || {};
  const envParts: string[] = [];
  if (env.platform) envParts.push(`Platform: ${env.platform}`);
  if (env.clientType) envParts.push(`Client Type: ${env.clientType}`);
  if (env.os) envParts.push(`OS: ${env.os}`);
  if (env.appVersion) envParts.push(`App version: ${env.appVersion}`);
  if (env.clientInfo) envParts.push(`Client Info: ${env.clientInfo}`);
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

export async function handleBugReportGuidePage(
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.customId.startsWith(BUGREPORT_GUIDE_PAGE_PREFIX)) {
    return;
  }

  const pageStr = interaction.customId.slice(BUGREPORT_GUIDE_PAGE_PREFIX.length);
  const page = Math.max(0, parseInt(pageStr, 10) || 0);
  await showGuidePage(interaction, page);
}

export async function handleBugReportSkipToModal(
  interaction: ButtonInteraction
): Promise<void> {
  if (interaction.customId !== BUGREPORT_SKIP_TO_MODAL_BUTTON_ID) {
    return;
  }

  const modal = buildBugReportModal();
  await interaction.showModal(modal);
}

export async function handleBugReportOpenModalButton(
  interaction: ButtonInteraction
): Promise<void> {
  if (interaction.customId !== BUGREPORT_OPEN_MODAL_BUTTON_ID) {
    return;
  }

  const modal = buildBugReportModal();
  await interaction.showModal(modal);
}

export async function handleBugReportFollowupButton(
  interaction: ButtonInteraction
): Promise<void> {
  const id = interaction.customId.slice(BUGREPORT_FOLLOWUP_BUTTON_PREFIX.length);
  const pending = pendingFollowups.get(id);
  if (!pending) {
    await interaction.reply({
      content:
        "This follow-up session has expired or is invalid. Please submit the bug report again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // build  modal for missing fields
  const modal = new ModalBuilder().setCustomId(`${BUGREPORT_FOLLOWUP_MODAL_PREFIX}${id}`).setTitle("Provide missing fields");

  const rows: ActionRowBuilder<TextInputBuilder>[] = [];
  for (const field of pending.missingFields.slice(0, 5)) {
    const label = field.label.length > 45 ? field.label.slice(0, 42) + "..." : field.label;
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(label)
      .setPlaceholder(`Enter ${field.label}`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);

    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  modal.addComponents(...rows);

  await interaction.showModal(modal);
}

export async function handleBugReportFollowupModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  // customId; format: bugbot-bugreport-followup-modal:<id>
  const id = interaction.customId.slice(BUGREPORT_FOLLOWUP_MODAL_PREFIX.length);
  const pending = pendingFollowups.get(id);
  if (!pending) {
    await interaction.reply({
      content: "This follow-up session has expired. Please try again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // collect values; merge into original input's environmentNotes
  const filled: string[] = [];
  for (const field of pending.missingFields) {
    const val = interaction.fields.getTextInputValue(field.id)?.trim() ?? "";
    if (val) filled.push(`${field.label}: ${val}`);
  }

  const mergedInput: BugReportInput = {
    ...pending.input,
    environmentNotes:
      [pending.input.environmentNotes, ...filled].filter(Boolean).join(" | ") || undefined,
  };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const report = await generateBugReport(mergedInput);
    const url = buildBugReportUrl(report);
    const storeId = storeBugReport(report);
    const detailsCustomId = buildDetailsCustomId(storeId);

    pendingFollowups.delete(id);

    const textDisplays: TextDisplayBuilder[] = [
      new TextDisplayBuilder().setContent("✅ **Bug Report Ready!**"),
      new TextDisplayBuilder().setContent(
        "Your bug report has been polished and is ready to submit. Review the details below, then click the button to open Discord's official bug report form with everything pre-filled."
      ),
      new TextDisplayBuilder().setContent("📋 **Title**"),
      new TextDisplayBuilder().setContent(formatText(report.title) || "Untitled bug report"),
      new TextDisplayBuilder().setContent("📝 **Description**"),
      new TextDisplayBuilder().setContent(
        formatText(report.description || "No description provided.", "description").slice(0, 1000)
      ),
    ];

    const container = new ContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplayComponents(...textDisplays)
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small)
      );

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

    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [container, actionRow],
    });
  } catch (err) {
    console.error("Failed to generate bug report from follow-up modal:", err);

    if (err instanceof NeedMoreInfoError) {
      // Update pending followup with new missing fields and prompt again
      const newMf = (err.missingFields ?? []).map((label, idx) => ({
        id: `m${idx}_${Math.random().toString(36).slice(2,6)}`,
        label,
      }));
      setPendingFollowup(id, { input: pending.input, missingFields: newMf, details: err.details });

      const missingList = newMf.map((f) => `• ${f.label}`).join("\n") || "(unspecified)";

      const container = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("⚠️ **More Information Still Needed**"),
          new TextDisplayBuilder().setContent(
            `I still need a few more pieces of information to generate the bug report:\n${missingList}`
          ),
          new TextDisplayBuilder().setContent(err.details || "Please provide the missing fields.")
        );

      const followupButton = new ButtonBuilder()
        .setLabel("✏️ Provide missing fields")
        .setCustomId(`${BUGREPORT_FOLLOWUP_BUTTON_PREFIX}${id}`)
        .setStyle(ButtonStyle.Primary);

      await interaction.editReply({
        flags: MessageFlags.IsComponentsV2,
        components: [container, new ActionRowBuilder<ButtonBuilder>().addComponents(followupButton)],
      });

      return;
    }

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

export async function handleBugReportReasoningButton(
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.customId.startsWith(BUGREPORT_REASONING_BUTTON_PREFIX)) {
    return;
  }

  const storeId = interaction.customId.slice(BUGREPORT_REASONING_BUTTON_PREFIX.length);
  const report = inMemoryReports.get(storeId);

  if (!report) {
    await interaction.reply({
      content: "This bug report has expired. Please generate a new one.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Check if reasoning is in the description field's JSON
  let reasoningText = formatText(report.reasoning);
  if (!reasoningText || reasoningText === "No reasoning provided by AI.") {
    // Try to extract from description field if it contains a bug report JSON
    const extractedFromDescription = extractBugReportFromField(report.description);
    if (extractedFromDescription?.reasoning) {
      reasoningText = formatText(extractedFromDescription.reasoning);
    }
  }
  
  reasoningText = reasoningText || "No reasoning provided by AI.";
  
  const score = report.reproducibilityScore !== undefined 
    ? `\n\n**Reproducibility Score: ${report.reproducibilityScore}/100**` 
    : "";

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("🧠 **AI Reasoning**"),
      new TextDisplayBuilder().setContent(reasoningText + score)
    );

  await interaction.reply({
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [container],
  });
}

export async function handleBugReportGenerateAnyways(
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.customId.startsWith(BUGREPORT_GENERATE_ANYWAYS_PREFIX)) {
    return;
  }

  const id = interaction.customId.slice(BUGREPORT_GENERATE_ANYWAYS_PREFIX.length);
  const pending = pendingFollowups.get(id);

  if (!pending) {
    await interaction.reply({
      content: "This session has expired. Please submit the bug report again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // generate report with available info,
    const report = await generateBugReport(pending.input);
    const url = buildBugReportUrl(report);
    const storeId = storeBugReport(report);
    const detailsCustomId = buildDetailsCustomId(storeId);

    pendingFollowups.delete(id);

    const container = new ContainerBuilder()
      .setAccentColor(0xf1c40f)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("⚠️ **Bug Report Generated (Incomplete)**"),
        new TextDisplayBuilder().setContent(
          "This report was generated with incomplete information. Please review carefully before submitting."
        ),
        new TextDisplayBuilder().setContent("📋 **Title**"),
        new TextDisplayBuilder().setContent(formatText(report.title) || "Untitled"),
        new TextDisplayBuilder().setContent("📝 **Description**"),
        new TextDisplayBuilder().setContent(formatText(report.description || "No description", "description").slice(0, 1000))
      );

    const openFormButton = new ButtonBuilder()
      .setLabel("📤 Open Discord Bug Form")
      .setURL(url)
      .setStyle(ButtonStyle.Link);

    const viewDetailsButton = new ButtonBuilder()
      .setLabel("📄 View Full Report")
      .setCustomId(detailsCustomId)
      .setStyle(ButtonStyle.Secondary);

    const reasoningButton = report.reasoning
      ? new ButtonBuilder()
          .setLabel("🧠 Show AI Reasoning")
          .setCustomId(`${BUGREPORT_REASONING_BUTTON_PREFIX}${storeId}`)
          .setStyle(ButtonStyle.Secondary)
      : null;

    const buttons = [openFormButton, viewDetailsButton];
    if (reasoningButton) buttons.push(reasoningButton);

    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        container,
        new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
      ],
    });
  } catch (err) {
    console.error("Failed to generate bug report (generate anyways):", err);
    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder()
          .setAccentColor(0xed4245)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("❌ **Error**"),
            new TextDisplayBuilder().setContent(
              "Sorry, I couldn't generate the bug report. Please try providing the missing information."
            )
          ),
      ],
    });
  }
}

export async function handleBugReportFeedbackMissing(
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.customId.startsWith(BUGREPORT_FEEDBACK_MISSING_PREFIX)) {
    return;
  }

  const parts = interaction.customId.slice(BUGREPORT_FEEDBACK_MISSING_PREFIX.length).split(":");
  const id = parts[0];
  const wasSuitable = parts[1] === "true";

  const pending = pendingFollowups.get(id);
  if (!pending) {
    await interaction.reply({
      content: "This feedback session has expired.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const feedback: Feedback = {
    type: "missing_info",
    timestamp: Date.now(),
    userId: interaction.user.id,
    missingFields: pending.missingFields.map((f) => f.label),
    wasSuitable,
    reportId: id,
  };

  await saveFeedback(feedback);

  await interaction.reply({
    content: wasSuitable 
      ? "✅ Thank you for your feedback! We'll continue asking for this information when needed."
      : "✅ Thank you for your feedback! We'll improve our detection to avoid unnecessary requests.",
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleBugReportFeedbackSatisfaction(
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.customId.startsWith(BUGREPORT_FEEDBACK_SATISFACTION_PREFIX)) {
    return;
  }

  const parts = interaction.customId.slice(BUGREPORT_FEEDBACK_SATISFACTION_PREFIX.length).split(":");
  const storeId = parts[0];
  const satisfaction = parseInt(parts[1] || "3", 10);

  const report = inMemoryReports.get(storeId);
  if (!report) {
    await interaction.reply({
      content: "This bug report has expired.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const feedback: Feedback = {
    type: "report",
    timestamp: Date.now(),
    userId: interaction.user.id,
    reportId: storeId,
    satisfaction,
  };

  await saveFeedback(feedback);

  const messages = {
    5: "✅ Thank you! We're glad the report was helpful!",
    3: "👍 Thank you for your feedback!",
    1: "👎 Thank you for your feedback. We'll work to improve!",
  };

  await interaction.reply({
    content: messages[satisfaction as keyof typeof messages] || messages[3],
    flags: MessageFlags.Ephemeral,
  });
}