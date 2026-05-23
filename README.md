# ModMind AI — Reddit Moderation Intelligence Platform

> AI-powered moderation assistant that automatically detects toxic content, spam, and hate speech — giving Reddit moderators a professional dashboard to manage their communities at scale.

![ModMind AI Dashboard](https://i.imgur.com/placeholder.png)

---

## What is ModMind AI?

ModMind AI is a Devvit app that installs directly into any Reddit subreddit and provides moderators with:

- **Automatic content detection** — every post and comment is scanned in real-time
- **Risk scoring** — content scored 0–100 based on toxicity, spam patterns, and hate speech
- **Moderation queue** — prioritized list of flagged content with one-click actions
- **AI explanations** — natural language explanation of why content was flagged
- **Repeat offender tracking** — identify users with patterns of violations
- **Community health score** — real-time health metric for your subreddit
- **Bulk actions** — approve or remove multiple items at once
- **Custom keyword rules** — add subreddit-specific banned terms
- **Severity escalation** — items pending too long automatically escalate
- **User profile panel** — click any username to see their full violation history

---

## Features

| Feature | Description |
|---|---|
| Toxicity Detection | Multi-layer keyword + pattern scoring |
| Spam Detection | 12+ spam pattern signatures |
| Hate Speech Detection | Regex-based hate speech patterns |
| Risk Scoring | 0–100 score with confidence % |
| AI Explanation | Natural language analysis per item |
| Queue Management | Approve / Remove / Ignore with notes |
| Bulk Actions | Select multiple items, action at once |
| Repeat Offenders | Auto-detect users flagged 2+ times |
| User Profiles | Full violation history per user |
| Health Score | Community-wide toxicity metric |
| Severity Escalation | Auto-escalates stale pending items |
| Custom Keywords | Subreddit-specific banned terms |
| Search & Filter | Filter queue by severity or keyword |
| Keyboard Shortcuts | Q/A/H/O/S/R for fast navigation |
| Settings Panel | Full configuration for mod teams |
| Onboarding Flow | Clean setup experience for new mods |

---

## Tech Stack

- **Platform:** Devvit (Reddit Developer Platform)
- **Frontend:** React + TypeScript
- **Backend:** Hono (Node.js)
- **Storage:** Redis (Devvit KV)
- **Detection:** Rule-based AI engine (no external API)

---

## Architecture

---

---

## Installation

### For Moderators
1. Go to [developers.reddit.com/apps/modmindai](https://developers.reddit.com/apps/modmindai)
2. Click **Install** on your subreddit
3. Go to your subreddit → click **⋯** → **Open ModMind AI Dashboard**
4. Complete the onboarding and you're live

### For Developers
```bash
# Clone the repo
git clone https://github.com/Muflih-7/modmind-ai.git
cd modmind-ai

# Install dependencies
npm install

# Login to Devvit
devvit login

# Start playtest
npm run dev
```

---

## How It Works

### Detection Engine
Every post and comment triggers the analysis engine which runs:
1. **Keyword scoring** — 22 toxic keywords, weighted by severity
2. **Spam pattern matching** — 12 regex patterns for common spam
3. **Hate speech detection** — 3 structural hate speech patterns
4. **Behavioral signals** — caps ratio, character spam, content length
5. **Custom rules** — mod-defined keyword list

### Risk Score
- **0–19** — Clean, no action needed
- **20–44** — Medium, flagged for review
- **45–69** — High, likely violation
- **70–100** — Critical, immediate action recommended

### Severity Escalation
Items that sit in the queue too long automatically escalate:
- Medium → High after 30 minutes
- High → Critical after 60 minutes

---

## Community Impact

ModMind AI is designed for any subreddit dealing with:
- Spam bots and promotional content
- Toxic users and hate speech
- Large communities where manual moderation doesn't scale
- Mod teams that need better visibility into community health

**Estimated time savings:** 2–4 hours per week for active mod teams.

---

## Hackathon Submission

Built for the **Reddit Mod Tools and Migrated Apps Hackathon** — Best New Mod Tool category.

**Target communities:**
- r/technology (large community, high spam volume)
- r/gaming (toxic comment patterns)
- r/news (hate speech and misinformation)

---

## License

BSD-3-Clause