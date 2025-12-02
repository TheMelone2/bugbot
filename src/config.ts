import dotenv from "dotenv";

dotenv.config();

export type AIBackend = "ollama" | "openai";

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  aiBackend: AIBackend;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openaiApiKey?: string;
  openaiModel: string;
  scraperDiscordForumUrls: string[];
}

function getEnv(
  name: string,
  fallback?: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const value = env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

const scraperUrlsRaw = process.env.SCRAPER_DISCORD_FORUM_URLS ?? "";

export const config: AppConfig = {
  discordToken: getEnv("DISCORD_TOKEN"),
  discordClientId: getEnv("DISCORD_CLIENT_ID"),
  aiBackend: (process.env.AI_BACKEND as AIBackend) || "ollama",
  ollamaBaseUrl: getEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
  ollamaModel: getEnv("OLLAMA_MODEL", "llama3.1"),
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  scraperDiscordForumUrls: scraperUrlsRaw
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean),
};