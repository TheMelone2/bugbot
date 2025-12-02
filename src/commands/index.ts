import type {
  ChatInputCommandInteraction,
  Collection,
  SlashCommandBuilder,
} from "discord.js";
import { Collection as DjsCollection } from "discord.js";
import type { Command } from "./Command.js";
import { bugReportCommand } from "./bugreport.js";
import { supportCommand } from "./support.js";

export const commands = new DjsCollection<
  string,
  Command
>() as Collection<string, Command>;

const allCommands: Command[] = [bugReportCommand, supportCommand];

for (const cmd of allCommands) {
  commands.set(cmd.data.name, cmd);
}

export function getSlashCommandData(): SlashCommandBuilder[] {
  return allCommands.map((c) => c.data);
}

export async function handleChatInputCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const command = commands.get(interaction.commandName);
  if (!command) {
    await interaction.reply({
      content: "I don’t recognize that command.",
      ephemeral: true,
    });
    return;
  }

  await command.execute(interaction);
}