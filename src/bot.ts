import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChannelType,
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} from "discord.js";
import { config } from "./config.js";
import { handleChatInputCommand } from "./commands/index.js";
import {
  BUGREPORT_MODAL_ID,
  handleBugReportModal,
  BUGREPORT_DETAILS_BUTTON_PREFIX,
  handleBugReportDetailsButton,
} from "./commands/bugreport.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`BugBot logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await handleChatInputCommand(interaction);
  } catch (err) {
    console.error("Error handling command:", err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content:
          "Oh!! Something went wrong while executing this command. Please try again.",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content:
          "Oh!! Something went wrong while executing this command. Please try again.",
        ephemeral: true,
      });
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  // bug report modal submit
  if (interaction.isModalSubmit()) {
    if (interaction.customId !== BUGREPORT_MODAL_ID) return;

    try {
      await handleBugReportModal(interaction);
    } catch (err) {
      console.error("Error handling bug report modal:", err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content:
            "Oh!! Something went wrong while generating the bug report. Please try again.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content:
            "Oh!! Something went wrong while generating the bug report. Please try again.",
          ephemeral: true,
        });
      }
    }
    return;
  }

  // "view full report" button
  if (interaction.isButton()) {
    if (!interaction.customId.startsWith(BUGREPORT_DETAILS_BUTTON_PREFIX))
      return;

    try {
      await handleBugReportDetailsButton(interaction);
    } catch (err) {
      console.error("Error handling bug report details button:", err);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content:
            "Something went wrong while showing the full bug report. Please try again.",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content:
            "Something went wrong while showing the full bug report. Please try again.",
          ephemeral: true,
        });
      }
    }
  }
});

client
  .login(config.discordToken)
  .catch((err) => {
    console.error("Failed to login to Discord:", err);
    process.exit(1);
  });