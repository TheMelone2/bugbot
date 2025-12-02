## BugBot

**AI-powered, high-quality bug reports for Discord – without leaving Discord.**

BugBot turns messy bug descriptions into clean, structured reports using local AI (Ollama) or OpenAI.  
With a single `/bugreport` command, it walks users through a focused flow in a private thread, generates a polished report, and sends them to Discord’s official bug form with everything pre-filled.

### Features

- **/bugreport command**: Start a guided bug reporting flow directly in Discord.
- **Thread-based UX**: BugBot opens a private thread so the conversation stays focused and reviewable.
- **AI-powered rewriting**: Uses **Ollama (local)** by default, with optional **OpenAI** fallback.
- **Structured output**: Title, description, steps to reproduce, environment, severity, and component.
- **Auto-fill link**: Generates a URL to Discord’s bug form with subject and description pre-packed.
- **Dataset scraper**: CLI to scrape public Discord community/forum pages into a JSONL dataset for prompt tuning.

---

### 1. Prerequisites

- Node.js 18+ (recommended)
- A Discord account and server where you can add a bot
- [Ollama](https://ollama.com/) installed and running (for local AI)
- Optional: OpenAI API key (for fallback or primary cloud AI)

---

### 2. Setup

1. **Install dependencies**

```bash
npm install
```

2. **Create your environment file**

Copy `env.example` to `.env` and fill in the values:

- `DISCORD_TOKEN`: Your bot token from the Discord Developer Portal.
- `DISCORD_CLIENT_ID`: Your application’s client ID.
- `AI_BACKEND`: `ollama` (default) or `openai`.
- `OLLAMA_BASE_URL`: Usually `http://127.0.0.1:11434`.
- `OLLAMA_MODEL`: e.g. `llama3.1`.
- `OPENAI_API_KEY` / `OPENAI_MODEL`: Optional, for OpenAI usage.
- `SCRAPER_DISCORD_FORUM_URLS`: Comma-separated list of public forum URLs to scrape.

3. **Build the bot**

```bash
npm run build
```

4. **Register slash commands**

```bash
npm run build && npm run register-commands
```

5. **Run the bot**

```bash
npm start
```

For development with hot-reload:

```bash
npm run dev
```

---

### 3. Using `/bugreport`

In any server where BugBot is installed:

1. Run:

```text
/bugreport summary: When I join a voice channel, my microphone disconnects after 2 minutes
```

2. BugBot:
   - Replies ephemerally that it’s creating a private thread.
   - Opens a private thread in the channel and invites you.
   - Guides you through:
     - **Step 1**: Detailed description of what happens.
     - **Step 2**: Steps to reproduce.
     - **Step 3**: Environment details.

3. After you answer, BugBot:
   - Calls the AI backend (Ollama or OpenAI) to generate a structured bug report.
   - Builds a URL to Discord’s bug form with subject + description pre-filled.
   - Sends a rich embed in the thread with:
     - **Title**: Bug report prepared
     - **Summary**: AI-refined description
     - **Status**: Ready to submit
     - A **“Open Discord bug form”** button linking to the official page.

---

### 4. AI Backends (Ollama & OpenAI)

BugBot supports two backends, with Ollama as the default:

- **Ollama (local)**  
  - Controlled by `AI_BACKEND=ollama`.  
  - Uses `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.  
  - Prompts are designed to output a strict JSON `BugReport` object.

- **OpenAI (cloud)**  
  - Controlled by `AI_BACKEND=openai` or as a fallback when Ollama fails.  
  - Uses `OPENAI_API_KEY` and `OPENAI_MODEL`.  
  - Shares the same BugReport schema and prompt style as Ollama.

If both are configured, BugBot will:

- Use **Ollama first** when `AI_BACKEND=ollama`, then fall back to OpenAI on error.
- Use **OpenAI first** when `AI_BACKEND=openai`, then fall back to Ollama on error.

---

### 5. Dataset Scraper (Discord Forums)

BugBot includes a basic scraper for public Discord community/forum pages to help you build a dataset of real bug reports.

1. Configure forum URLs in `.env`:

```env
SCRAPER_DISCORD_FORUM_URLS=https://support.discord.com/hc/en-us/community/topics/360000029731
```

2. Run the scraper:

```bash
npm run build && npm run scrape
```

This will:

- Fetch each configured URL.
- Parse topic titles, bodies, and tags.
- Normalize them into `BugReport`-like JSON objects.
- Append them to `data/bug_reports.jsonl`.

These examples are automatically used as few-shot context when generating new bug reports.

---

### 6. Project Structure (Key Files)

- `src/bot.ts` – Discord client, events, and message handling.
- `src/config.ts` – Environment and configuration handling.
- `src/commands/bugreport.ts` – `/bugreport` command definition.
- `src/sessions/BugReportSessionManager.ts` – Thread-based conversation flow.
- `src/ai/` – AI integration (Ollama, OpenAI, and router).
- `src/util/bugSite.ts` – Builds the auto-fill bug report URL.
- `src/util/embeds.ts` – Polished embeds and components (buttons).
- `src/scraper/` – Scraper architecture and Discord forums implementation.
- `src/scripts/scrapeDiscordForums.ts` – CLI for scraping datasets.
- `src/scripts/syncSupportArticles.ts` – CLI for syncing official Discord support articles from GitHub.
- `src/support/articleIndex.ts` – Fast local search index over synced support articles.

---

### 7. Notes & Limitations

- Discord’s support/bug pages can change structure; the auto-fill URL is best-effort and may need updates over time.
- The scraper is heuristic and meant for **public** pages where scraping is allowed; always respect site policies.
- For production use, you may want to add:
  - Persistent storage (for per-guild settings).
  - Rate limiting or role-based access to advanced commands.
  - Additional commands for admins and power reporters.

---

### 8. Discord Support Article Search (Low AI Usage)

To keep costs low, BugBot can answer many issues by surfacing **official Discord support articles** instead of calling AI.

The dataset comes from the public repository  
[`xhyrom/discord-datamining`](https://github.com/xhyrom/discord-datamining/tree/master/data/articles/normal).

1. **Sync the articles (cache locally)**

```bash
npm run build && npm run sync-articles
```

This will:

- Traverse `data/articles/normal` in the GitHub repo.
- For each article directory (e.g. `10069840290711/`), download:
  - `meta.json` (id, URLs, title, timestamps, etc.)
  - `content.md` (full article content, usually HTML/Markdown).
- Normalize them into a single `support_articles.jsonl` file under `data/`.

2. **Use `/support` in Discord**

- Command: `/support query: how do I use regex filters in automod`
- BugBot:
  - Tokenizes your query.
  - Uses a **credit-based scoring system** over the cached articles:
    - Credits for matches in the **title** (higher weight).
    - Credits for matches in the **body content** (lower weight).
    - Bonus credits when an article covers **all query tokens**.
  - Returns the **top 3** articles as rich embeds, with:
    - Title
    - Short snippet/preview
    - Direct link (e.g. `html_url` from `meta.json`)
    - Match score for transparency.

This flow uses **no AI calls**—it’s fast and cost efficient, while still giving users high-quality answers straight from Discord’s official documentation.

