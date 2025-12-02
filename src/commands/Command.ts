import type { ChatInputCommandInteraction } from "discord.js";

// keep Command.data loosely typed to support any valid slash command builder; shape (with or without subcommands) and avoid over-constraining the type :)
export interface Command {
  // Typically its a SlashCommandBuilder, but we keep this flexible --> only needs to support .toJSON() for registration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}