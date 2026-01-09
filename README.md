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
## Known Issues
You can find the known issues [here](KNOWN_ISSUES.md). Even after this buildathon, we'll maintain this list and fix the issues as soon as possible.

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
/bugreport
```

### 2. AI Processing

BugBot turns the raw text into a structured report (after model processing):

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
```json
{
  "title": "User is unable to DM a friend",
  "description": "User is unable to send a DM to my friend. Tried multiple times, but the message doesn't go through. Checked internet connection and device's microphone, but everything seems to be working fine.",
  "stepsToReproduce": [
    "1. Open the Discord application.",
    "2. Navigate to the DM channel.",
    "3. Attempt to DM user 'old friend'.",
    "4. Observe that the message does not go through."
  ],
  "component": "Application",
  "severity": "medium",
  "environment": {
    "clientType": "Web",
    "clientInfo": "Discord Web App",
    "os": "Desktop",
    "browser": "Chromium",
    "deviceManufacturer": "Mobile",
    "deviceModel": "iPhone 13"
  },
  "reasoning": "The description clearly indicates a problem with DMing a friend. It includes the specific message being delivered and the expected outcome. The provided environment notes point to a possible Discord Web App issue, potentially affecting the DM functionality for specific user types.",
  "reproducibilityScore": 70,
  "attachments": [
    "rawSummary"
  ],
  "sources": [
    "detailedDescription"
  ]
}
```
---

## Features

* **/bugreport command** - Start a guided bug reporting flow with paginated guide
* **Interactive Guide System** - Multi-page guide with pagination buttons
* **Skip to Form** - Quick access button for experienced users
* **Private flow UX** - Clean, focused, and reviewable using Discord Components v2
* **AI-powered rewriting** - Ollama (local) by default, OpenAI optional
* **Smart AI Inference** - AI infers missing information when possible, reducing user input requirements
* **AI Content Warnings** - Clear warnings about verifying AI-generated content (what a feature... wow)
* **Strict JSON BugReport schema** ensuring clean output
* **Auto-fill bug form links** for fast submission
* **Dataset** from Discord's official documentation
* **Support article search** (zero AI cost, fully local)

---

## AI Training Data

BugBot is trained using:

* Synthetic (generated) bug reports
* Community-submitted anonymized examples

No private and/or online available data is used without explicit consent. 

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
* (Not used anymore -->)`SCRAPER_DISCORD_FORUM_URLS`
* `KNOWN_COMPONENTS="Gateway\nREST API\nQuests\nApplication\nBot\nOAuth2\nWebhooks\nInteractions\nApplication Commands (Slash Commands)\nContext Menus\nGuild (Server)\nChannel (Text Channel)\nChannel (Voice Channel)\nChannel (Stage Channel)\nChannel (Announcement Channel)\nChannel (Forum Channel)\nThread\nMessage\nMessage Attachments\nMessage Embeds\nPinned Messages\nMessage Reactions\nMessage Components\nUser\nMember\nRole\nPermissions\nPresence\nVoice State\nInvite\nAudit Log\nBan/Unban\nModeration Actions (Kick/Mute/Timeout)\nAutoMod\nServer Insights\nServer Templates\nServer Banners\nPer-Server Profiles\nEmoji (Custom Emoji)\nStickers\nNitro\nServer Boosting\nDiscover\nIntegrations\nThird-Party Connections (Spotify, Twitch, etc.)\nRich Presence / Activity\nWidgets\nSearch\nNotifications\nBookmarks\nSlowmode\nVoice (RTC)\nVideo Calls\nScreen Share / Go Live\nStage (Live Audio Events)\nVoice Regions (legacy/controls)\nComponents: Button\nComponents: Select Menu (Dropdown)\nComponents: Action Row\nComponents: Modal (Modal Submit)\nComponents: Select Option\nComponents: Checkbox (where applicable via Selects)\nApplication Command Permissions\nRate Limits\nGateway Intents (Presence, Guild Members, Message Content)\nThread Auto-Archive\nForum Moderation Tools\nInvite System\nIntegrations (Webhooks, OAuth apps)\nBot Account Controls\nDeveloper Portal (App settings)"`

3. Build

```bash
npm run build
```

4. Register slash commands

```bash
npm run register-commands
```

4.2 Sync support articles

```bash
npm run sync-articles
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
/bugreport
```

2. BugBot shows an interactive guide with:
   * **Page 1**: What you need for a good bug report
   * **Page 2**: What BugBot will do + AI content warnings
   * **Page 3**: Helpful resources (Discord support articles, GitHub links)
   * Navigation buttons to move between pages
   * **"Skip to Form"** button for experienced users

3. Click **"Open Bug Report Form"** to fill out the modal with:
   * Title/Summary (required)
   * Description (required)
   * Steps to Reproduce (required)
   * Environment Info (required)
   * Impact Description (optional)

4. BugBot:
   * Uses AI to structure and polish your report
   * Infers missing information when possible
   * Generates a professional bug report
   * Creates an auto-filled link to Discord's bug form
   * Shows relevant support articles if available

5. **Important**: Always review the AI-generated report before submitting! AI may infer information, so verify all details are accurate.

---

## AI Backends (Ollama & OpenAI)

### Local (Ollama)

* Default backend
* Fast and cost-free
* Strict JSON output
* Smart inference capabilities

### Cloud (OpenAI)

* Optional or fallback
* Same structured output format
* Smart inference capabilities

**Fallback logic:**

* `AI_BACKEND=ollama`: try Ollama → fallback to OpenAI
* `AI_BACKEND=openai`: try OpenAI → fallback to Ollama

### AI Inference Features

BugBot's AI is designed to be helpful, not strict:
* **Infers missing fields** from provided context
* **Extracts environment details** from free-form text
* **Determines component and severity** from descriptions
* **Only asks for more info** when absolutely necessary
* **Marks all inferences** with "(inferred)" for transparency

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

## Discord Support Article Search

BugBot includes `/support`, which surfaces official Discord documentation locally.

### How it works

* Articles synced
* Local index
* Token matching with weighted scoring
* Returns top 3 relevant articles

Example:

```
/support query: automod regex filters
```

Provides official articles instantly, without any AI cost.

---

## UI/UX Features

* **Discord Components v2** - Modern, interactive UI with:
  * ContainerBuilder for organized content sections
  * SectionBuilder for content with button accessories
  * SeparatorBuilder for visual hierarchy
  * TextDisplayBuilder for rich markdown content
  * ButtonBuilder for interactive actions

* **Pagination System** - Navigate through guide pages easily
* **Skip Functionality** - Experienced users can skip directly to the form
* **Resource Links** - Direct access to Discord support articles and GitHub

## AI Content Verification

⚠️ **Important**: BugBot uses AI to improve your bug reports, but:
* **Always verify** AI-generated content before submitting
* AI may infer or add information you didn't provide
* Review all details for accuracy and truthfulness
* This is a **tool to improve** reports, not a replacement for your judgment
* **Never trust AI-generated content 100%** - always review

## Limitations

* Discord's bug form may change structure
* AI inference may occasionally be incorrect - always verify
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