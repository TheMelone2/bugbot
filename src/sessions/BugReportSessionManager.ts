import type { Message } from "discord.js";
import type { BugReportInput } from "../types/BugReport.js";
import { generateBugReport } from "../ai/index.js";
import { NeedMoreInfoError } from "../ai/errors.js";
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
  missingFields?: string[];
  askedFields?: string[];
  repromptCount?: number;
  lastUpdated: number;
}

const SESSIONS = new Map<string, SessionState>(); // key: threadId
const SESSION_TTL_MS = 1000 * 60 * 30; // 30 minutes

export function looksLikeFieldProvided(field: string, content: string): boolean {
  const c = content.toLowerCase();
  try {
    switch (field) {
      case "appVersion":
        return /\b(stable|beta|dev|canary|rc)\b|\d+\.\d+|\d{3,}/i.test(content) || /\b(chrome|safari|firefox|edge|opera|discord)\b/i.test(content);
      case "os":
        return /\bwindows|macos|os x|ios|android|linux|chromebook|chrome os\b/i.test(c);
      case "platform":
        return /\bdesktop|web|browser|ios|android|mobile\b/i.test(c);
      case "networkInfo":
        return /\b(vpn|proxy|proxy server|corporate network|wi-?fi|wifi|ethernet)\b/i.test(c);
      case "stepsToReproduce":
        return /\n|^\d+\./m.test(content) || content.split(/\r?\n/).length > 1;
      case "detailedDescription":
      case "description":
        return content.trim().length > 10;
      default:
        return content.trim().length > 0;
    }
  } catch {
    return content.trim().length > 0;
  }
}

export function handleNeedMoreInfo(session: SessionState, err: NeedMoreInfoError) {
  // ask user for missing fields the model requested /whiel avoid re-asking things we've already requested lol
  const requested = err.missingFields ?? [];
  const newFields = requested.filter((f) => !(session.askedFields ?? []).includes(f));

  if (newFields.length === 0) {
    // Nothing new to ask — the model is repeating previous requests
    session.repromptCount = (session.repromptCount ?? 0) + 1;
    if ((session.repromptCount ?? 0) > 2) {
      const msg1 =
        "The AI keeps requesting information we've already tried to collect. To avoid repeating, please paste any remaining details now or use the manual template I’ll provide.";
      const template =
        "**Template:**\n" +
        `**Title:** ${session.summary}\n` +
        `**What happened:** ${session.detailedDescription ?? ""}\n` +
        `**Steps to reproduce:**\n${session.steps
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n")}\n\n` +
        `**Environment:** ${session.environmentNotes ?? ""}`;

      return { message: `${msg1}\n\n${template}`, endSession: true };
    }

    // Otherwise, ask a generic clarification to avoid loops
    return {
      message:
        "The AI is asking for more info it already requested. Could you clarify or expand the environment and steps so I can finish the report?",
      endSession: false,
    };
  }

  session.missingFields = Array.from(new Set(newFields));
  session.askedFields = Array.from(new Set([...(session.askedFields ?? []), ...session.missingFields]));

  const friendly = session.missingFields.join(", ");
  // Decide the next step
  const next = session.missingFields[0];
  session.step =
    next === "detailedDescription" || next === "description"
      ? "description"
      : next === "stepsToReproduce" || next === "steps"
      ? "steps"
      : "environment";

  return {
    message: `The AI needs more information before it can finish the report. Please provide: **${friendly}**.\n\nStart by giving **${session.step}** details now.`,
    endSession: false,
  };
}

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
      askedFields: [],
      repromptCount: 0,
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
      // remove this field from missingFields if AI requested it
      if (session.missingFields?.length) {
        session.missingFields = session.missingFields.filter(
          (f) => f !== "detailedDescription" && f !== "description"
        );
      }
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

      // remove this field from missingFields if AI requested it
      if (session.missingFields?.length) {
        session.missingFields = session.missingFields.filter(
          (f) => f !== "stepsToReproduce" && f !== "steps"
        );
      }

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

      // if we're waiting on missing fields --> try to infer which ones the user just provided
      if (session.missingFields?.length) {
        session.missingFields = session.missingFields.filter((f) => !looksLikeFieldProvided(f, message.content));
      }

      // avoid re-asking fields we've already asked for
      if (session.missingFields?.length && session.askedFields?.length) {
        session.missingFields = session.missingFields.filter((f) => !session.askedFields!.includes(f));
      }

      // If after filtering no missing fields remain- --> continue to generate
      if (session.missingFields && session.missingFields.length > 0) {
        // If we've already prompted multiple times with no progress, give a fallback to avoid loop
        session.repromptCount = (session.repromptCount ?? 0) + 1;
        if ((session.repromptCount ?? 0) > 2) {
          await message.reply(
            "It looks like the AI is still requesting information we couldn't collect automatically. To avoid repeated requests, please paste any remaining details you have, or use the template I'll provide."
          );

          // give basic template + finish the session to avoid infinite loop
          await message.reply(
            "**Template:**\n" +
              `**Title:** ${session.summary}\n` +
              `**What happened:** ${session.detailedDescription ?? ""}\n` +
              `**Steps to reproduce:**\n${session.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n` +
              `**Environment:** ${session.environmentNotes ?? ""}`
          );

          SESSIONS.delete(threadId);
          return;
        }

        // ask only for the next remaining missing field and mark it as asked
        const next = session.missingFields[0];
        const friendly =
          next === "stepsToReproduce" || next === "steps"
            ? "steps to reproduce"
            : next === "detailedDescription" || next === "description"
            ? "detailed description"
            : next === "appVersion"
            ? "Discord app or browser version"
            : next === "networkInfo"
            ? "network details (VPN / proxy / etc.)"
            : next;

        session.step =
          next === "detailedDescription" || next === "description"
            ? "description"
            : next === "stepsToReproduce" || next === "steps"
            ? "steps"
            : "environment";

        session.askedFields = Array.from(new Set([...(session.askedFields ?? []), next]));

        await message.reply(
          `Thanks! The AI still needs **${friendly}** to finish the report. Please provide it now.`
        );
        return;
      }

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

        // finished successfully - delete session
        SESSIONS.delete(threadId);
      } catch (err) {
        clearTimeout(progressTimeout);

        if (err instanceof NeedMoreInfoError) {
          const result = handleNeedMoreInfo(session, err);

          if (result.message) {
            await channel.send(result.message);
          }

          if (result.endSession) {
            SESSIONS.delete(threadId);
          } else {
            session.lastUpdated = Date.now();
          }

          return;
        }

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

        SESSIONS.delete(threadId);
      } finally {
        // nothing
      }
    }
  }
}