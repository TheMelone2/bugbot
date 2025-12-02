import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { getSlashCommandData } from "./commands/index.js";

async function main() {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);

  const commands = getSlashCommandData().map((cmd) => cmd.toJSON());

  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`
    );

    const data = (await rest.put(
      Routes.applicationCommands(config.discordClientId),
      { body: commands }
    )) as unknown[];

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`
    );
  } catch (error) {
    console.error("Error registering commands:", error);
    process.exit(1);
  }
}

main();