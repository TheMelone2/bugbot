# BugBot: AI-Powered Bug Reporting for Discord

### *Built for the Discord Buildathon 2025*

<img width="240" src="https://github.com/user-attachments/assets/e3b9d6d1-1740-483d-91f5-280ec734b03e" alt="BugBot Logo">

---

## Overview

BugBot is an AI-powered Discord bot that transforms messy, chaotic bug descriptions into **clean, professional, auto-submit-ready** bug reports.

Reporting bugs to Discord often feels slow, painful, and unclear. BugBot fixes that.
It guides users through a focused flow, uses AI to rewrite their report, and sends them directly to the official Discord bug form with everything pre-filled.

Built by someone who has reported bugs for Discord for years, including participation in the **Discord Bug Bounty Program**, **Activities Playtesting**, and numerous internal feedback initiatives - BugBot blends real-world bug hunting experience with modern AI assistance.

---

## Why BugBot?

* Easy `/bugreport` command
* Private flow
* AI-powered rewriting (local **Model (via Ollama)** or online **Model (via OpenAI)**)
* Automatic steps, environment, and summary generation
* Auto-fill link to Discord’s bug form
* Dataset for training and tuning
* Support-article search that works based on Discord's official documentation

BugBot makes bug reporting *fast*, *accessible*, and *effective* for everyone - from everyday users to power reporters.

---

## How BugBot Works

### 1. User Command

```text
/bugreport When I join a voice channel, my microphone disconnects after 2 minutes
```

### 2. AI Processing

BugBot turns the raw text into a structured report:

* **Title** - concise summary
* **Description** - clear, rewritten explanation
* **Steps to Reproduce** - suggested and confirmed
* **Environment** - OS, device, app version (user-provided)
* **Severity & Component** - automatically classified

### 3. Auto-Fill Integration

BugBot generates a URL to Discord’s bug form with **subject and description already filled in**.
Just review → click Submit → done.

### 4. Confirmation in Discord

In a private flow or DM:

```
Bug report prepared!
Title: Microphone disconnects after 2 minutes in voice channels
Status: Ready to submit
```

---

## Features

* **/bugreport command** - Start a guided bug reporting flow
* **Private flow UX** - Clean, focused, and reviewable
* **AI-powered rewriting** - Ollama (local) by default, OpenAI optional
* **Strict JSON BugReport schema** ensuring clean output
* **Auto-fill bug form links** for fast submission
* **Dataset** from Discord's official documentation
* **Support article search** (zero AI cost, fully local)

---

## AI Training Data

BugBot is trained using:

* Public bug trackers
* Public Discord forum posts
* Synthetic (generated) bug reports
* Community-submitted anonymized examples

No private Discord data is used.

---

## Installation & Setup

### Requirements

* Node.js 18+
* Discord bot application
* Ollama running locally (default backend)
* Optional OpenAI API key

### Setup Steps

1. Install dependencies

```bash
npm install
```

2. Copy environment file

```bash
cp env.example .env
```

Fill in:

* `DISCORD_TOKEN`
* `DISCORD_CLIENT_ID`
* `AI_BACKEND` (ollama or openai)
* `OLLAMA_BASE_URL`, `OLLAMA_MODEL`
* (Optional) `OPENAI_API_KEY`, `OPENAI_MODEL`
* `SCRAPER_DISCORD_FORUM_URLS`

3. Build

```bash
npm run build
```

4. Register slash commands

```bash
npm run register-commands
```

5. Start the bot

```bash
npm start
```

For development:

```bash
npm run dev
```

---

## Using `/bugreport`

1. In any channel, run:

```text
/bugreport summary: My microphone stops working after 2 minutes in VC
```

2. BugBot:

   * Creates a private flow
   * Guides you through description → steps → environment
   * Calls the AI backend
   * Generates the final structured report
   * Sends an auto-filled link to the Discord bug form

3. A final embed summarizes the full report.

---

## AI Backends (Ollama & OpenAI)

### Local (Ollama)

* Default backend
* Fast and cost-free
* Strict JSON output

### Cloud (OpenAI)

* Optional or fallback
* Same structured output format

**Fallback logic:**

* `AI_BACKEND=ollama`: try Ollama → fallback to OpenAI
* `AI_BACKEND=openai`: try OpenAI → fallback to Ollama

---

## Dataset Scraper (Discord Forums)

BugBot includes a CLI scraper to gather examples from **public Discord community/forum pages**.

1. Add URLs in `.env`
2. Run:

```bash
npm run build && npm run scrape
```

Output:
`data/bug_reports.jsonl`

Used as automatic few-shot examples during generation.

---

## Project Structure

```
src/
 ├─ bot.ts                       # Discord client and events
 ├─ commands/bugreport.ts        # Slash command definition
 ├─ sessions/                    # Guided bug reporting flow
 ├─ ai/                          # Ollama + OpenAI adapters
 ├─ util/                        # Embeds, URLs, helpers
 ├─ scraper/                     # Forum scraper architecture
 ├─ scripts/                     # CLI tools
 └─ support/                     # Discord support article index
```

---

## Discord Support Article Search (No AI Needed)

BugBot includes `/support`, which surfaces official Discord documentation locally.

### How it works

* Articles synced from GitHub (xhyrom/discord-datamining)
* Local index
* Token matching with weighted scoring
* Returns top 3 relevant articles

Example:

```
/support query: automod regex filters
```

Provides official articles instantly, without any AI cost.

---

## Limitations

* Discord’s bug form may change structure
* Scraper only works on public pages
* Production deployments may require:

  * Persistent DB
  * Rate limits or permissions
  * Custom org settings

---

## Ready for the Discord Buildathon

BugBot is built to demonstrate:

* AI integration directly inside Discord
* Local-first computing (Ollama)
* Practical real-world use cases
* Accessibility for non-technical users
* High developer polish
* Strong UX focused on clarity and speed
