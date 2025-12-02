import type { Message } from "discord.js";
import type { BugReportInput } from "../types/BugReport.js";
import { generateBugReport } from "../ai/index.js";
import { buildBugReportUrl } from "../util/bugSite.js";
import {
  buildBugReportComponents,
  buildBugReportEmbed,
} from "../util/embeds.js";

type Step = "description" | "steps" | "environment" | "done";

interface SessionState {
  userId: string;
  guildId?: string;
  threadId: string;
  step: Step;
  summary: string;
  severity?: string;
  detailedDescription?: string;
  steps: string[];
  environmentNotes?: string;
  lastUpdated: number;
}

const SESSIONS = new Map<string, SessionState>(); // key: threadId
const SESSION_TTL_MS = 1000 * 60 * 30; // 30 minutes

export class BugReportSessionManager {
  static startSession(opts: {
    userId: string;
    guildId?: string;
    threadId: string;
    summary: string;
    severity?: string;
  }) {
    SESSIONS.set(opts.threadId, {
      userId: opts.userId,
      guildId: opts.guildId,
      threadId: opts.threadId,
      step: "description",
      summary: opts.summary,
      severity: opts.severity,
      steps: [],
      lastUpdated: Date.now(),
    });
  }

  static async handleMessage(message: Message): Promise<void> {
    if (!message.inGuild()) return;
    if (message.author.bot) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = message.channel as any;
    if (!channel.isThread || !channel.isThread()) return;

    const threadId = channel.id as string;
    const session = SESSIONS.get(threadId);
    if (!session) return;
    if (session.userId !== message.author.id) return;

    // expire old sessions
    if (Date.now() - session.lastUpdated > SESSION_TTL_MS) {
      SESSIONS.delete(threadId);
      await message.reply(
        "Sorry! This bug report session has expired. Please use `/bugreport` again if you still need help."
      );
      return;
    }

    session.lastUpdated = Date.now();

    if (session.step === "description") {
      session.detailedDescription = message.content;
      session.step = "steps";
      await message.reply(
        [
          "Got it! ✅",
          "",
          "**Step 2 - Steps to reproduce**",
          "Please list the steps someone should follow to reliably see this bug.",
          "",
          "Example:",
          "1. Join a voice channel",
          "2. Mute and unmute yourself",
          "3. Wait 2 minutes",
        ].join("\n")
      );
      return;
    }

    if (session.step === "steps") {
      const lines = message.content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      session.steps.push(...lines);
      session.step = "environment";
      await message.reply(
        [
          "Perfect, thanks! ✅",
          "",
          "**Step 3 - Environment details**",
          "Tell me about your setup. For example:",
          "- Platform (Desktop / iOS / Android / Web?)",
          "- OS version (e.g. Windows 11, macOS 14, iOS 17)",
          "- Discord app version or browser & version",
          "- Anything special about your network (VPN, proxies, etc.)",
        ].join("\n")
      );
      return;
    }

    if (session.step === "environment") {
      session.environmentNotes = message.content;
      session.step = "done";

      await message.reply(
        "Thanks! 🧠 Generating a polished bug report with BugBot’s AI…"
      );

      const input: BugReportInput = {
        rawSummary: session.summary,
        detailedDescription: session.detailedDescription,
        steps: session.steps,
        environmentNotes: session.environmentNotes,
        severity: session.severity,
      };

      let progressMessageSent = false;
      const progressTimeout = setTimeout(async () => {
        try {
          if (!progressMessageSent) {
            progressMessageSent = true;
            await channel.send(
              "Still working… the AI is thinking through your report (this can take a few more seconds)."
            );
          }
        } catch {
          // ignore errors sending progress update
        }
      }, 10_000);

      try {
        // eslint-disable-next-line no-console
        console.log(
          `[BugBot] Generating bug report via AI for thread ${threadId}…`
        );
        const report = await generateBugReport(input);
        clearTimeout(progressTimeout);

        const url = buildBugReportUrl(report);
        const embed = buildBugReportEmbed(report, url);

        await channel.send({
          content:
            "Here’s your polished bug report. Review it and then click the button below to open the official Discord bug report form with everything pre-filled.",
          embeds: [embed],
          components: buildBugReportComponents(url),
        });
      } catch (err) {
        clearTimeout(progressTimeout);
        // eslint-disable-next-line no-console
        console.error("Failed to generate bug report:", err);
        await message.reply(
          "Sorry, I couldn’t generate the bug report automatically. Here’s a basic template you can copy into the Discord bug site:\n\n" +
            `**Title:** ${session.summary}\n` +
            `**What happened:** ${session.detailedDescription ?? ""}\n` +
            `**Steps to reproduce:**\n${session.steps
              .map((s, i) => `${i + 1}. ${s}`)
              .join("\n")}\n\n` +
            `**Environment:** ${session.environmentNotes ?? ""}`
        );
      } finally {
        SESSIONS.delete(threadId);
      }
    }
  }
}