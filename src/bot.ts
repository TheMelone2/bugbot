import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChannelType,
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  MessageFlags,
} from "discord.js";
import { config } from "./config.js";
import { handleChatInputCommand } from "./commands/index.js";
import {
  BUGREPORT_MODAL_ID,
  handleBugReportModal,
  BUGREPORT_DETAILS_BUTTON_PREFIX,
  handleBugReportDetailsButton,
  BUGREPORT_FOLLOWUP_BUTTON_PREFIX,
  BUGREPORT_FOLLOWUP_MODAL_PREFIX,
  handleBugReportFollowupButton,
  handleBugReportFollowupModal,
  BUGREPORT_OPEN_MODAL_BUTTON_ID,
  handleBugReportOpenModalButton,
  BUGREPORT_GUIDE_PAGE_PREFIX,
  handleBugReportGuidePage,
  BUGREPORT_SKIP_TO_MODAL_BUTTON_ID,
  handleBugReportSkipToModal,
  BUGREPORT_REASONING_BUTTON_PREFIX,
  handleBugReportReasoningButton,
  BUGREPORT_GENERATE_ANYWAYS_PREFIX,
  handleBugReportGenerateAnyways,
  BUGREPORT_FEEDBACK_MISSING_PREFIX,
  handleBugReportFeedbackMissing,
  BUGREPORT_FEEDBACK_SATISFACTION_PREFIX,
  handleBugReportFeedbackSatisfaction,
} from "./commands/bugreport.js";
import {
  handleSupportAutocomplete,
  SUPPORT_VIEW_ARTICLE_PREFIX,
  handleViewArticle,
} from "./commands/support.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`BugBot logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === "support") {
      try {
        await handleSupportAutocomplete(interaction);
      } catch (err) {
        console.error("Error handling autocomplete:", err);
      }
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    try {
      await handleChatInputCommand(interaction);
    } catch (err) {
      console.error("Error handling command:", err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content:
            "Oh!! Something went wrong while executing this command. Please try again.",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content:
            "Oh!! Something went wrong while executing this command. Please try again.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  // bug report modal submit
  if (interaction.isModalSubmit()) {
    if (interaction.customId === BUGREPORT_MODAL_ID) {
      try {
        await handleBugReportModal(interaction);
      } catch (err) {
        console.error("Error handling bug report modal:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content:
              "Oh!! Something went wrong while generating the bug report. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content:
              "Oh!! Something went wrong while generating the bug report. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }

    if (interaction.customId.startsWith(BUGREPORT_FOLLOWUP_MODAL_PREFIX)) {
      try {
        await handleBugReportFollowupModal(interaction);
      } catch (err) {
        console.error("Error handling followup modal:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content:
              "Oh!! Something went wrong while handling the follow-up. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content:
              "Oh!! Something went wrong while handling the follow-up. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }
  }

  // nutton interactions
  if (interaction.isButton()) {
    if (interaction.customId.startsWith(BUGREPORT_GUIDE_PAGE_PREFIX)) {
      try {
        await handleBugReportGuidePage(interaction);
      } catch (err) {
        console.error("Error handling guide page button:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content:
              "Something went wrong while navigating the guide. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content:
              "Something went wrong while navigating the guide. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }

    if (interaction.customId === BUGREPORT_SKIP_TO_MODAL_BUTTON_ID) {
      try {
        await handleBugReportSkipToModal(interaction);
      } catch (err) {
        console.error("Error handling skip to modal button:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content:
              "Something went wrong while opening the bug report form. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content:
              "Something went wrong while opening the bug report form. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }

    if (interaction.customId === BUGREPORT_OPEN_MODAL_BUTTON_ID) {
      try {
        await handleBugReportOpenModalButton(interaction);
      } catch (err) {
        console.error("Error handling open modal button:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content:
              "Something went wrong while opening the bug report form. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content:
              "Something went wrong while opening the bug report form. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }

    if (interaction.customId.startsWith(BUGREPORT_DETAILS_BUTTON_PREFIX)) {
      try {
        await handleBugReportDetailsButton(interaction);
      } catch (err) {
        console.error("Error handling bug report details button:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content:
              "Something went wrong while showing the full bug report. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content:
              "Something went wrong while showing the full bug report. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }

    if (interaction.customId.startsWith(BUGREPORT_FOLLOWUP_BUTTON_PREFIX)) {
      try {
        await handleBugReportFollowupButton(interaction);
      } catch (err) {
        console.error("Error handling followup button:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content:
              "Something went wrong while opening the follow-up modal. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content:
              "Something went wrong while opening the follow-up modal. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }

    if (interaction.customId.startsWith(BUGREPORT_REASONING_BUTTON_PREFIX)) {
      try {
        await handleBugReportReasoningButton(interaction);
      } catch (err) {
        console.error("Error handling reasoning button:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Something went wrong while showing the reasoning. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "Something went wrong while showing the reasoning. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }

    if (interaction.customId.startsWith(BUGREPORT_GENERATE_ANYWAYS_PREFIX)) {
      try {
        await handleBugReportGenerateAnyways(interaction);
      } catch (err) {
        console.error("Error handling generate anyways button:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Something went wrong while generating the report. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "Something went wrong while generating the report. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }

    if (interaction.customId.startsWith(BUGREPORT_FEEDBACK_MISSING_PREFIX)) {
      try {
        await handleBugReportFeedbackMissing(interaction);
      } catch (err) {
        console.error("Error handling feedback missing button:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Something went wrong while saving feedback. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "Something went wrong while saving feedback. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }

    if (interaction.customId.startsWith(BUGREPORT_FEEDBACK_SATISFACTION_PREFIX)) {
      try {
        await handleBugReportFeedbackSatisfaction(interaction);
      } catch (err) {
        console.error("Error handling feedback satisfaction button:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Something went wrong while saving feedback. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "Something went wrong while saving feedback. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }

    if (interaction.customId.startsWith(SUPPORT_VIEW_ARTICLE_PREFIX)) {
      try {
        await handleViewArticle(interaction);
      } catch (err) {
        console.error("Error handling view article button:", err);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content:
              "Something went wrong while showing the article. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content:
              "Something went wrong while showing the article. Please try again.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
      return;
    }
  }
});

client
  .login(config.discordToken)
  .catch((err) => {
    console.error("Failed to login to Discord:", err);
    process.exit(1);
  });

  // todo: omg these if-statements making me grr; switching to cases ig