# Daily Hot News (每日热点日报)

> 🤖 **FULLY AI-MANAGED PROJECT** | **完全由 AI 托管的项目**
>
> This project is entirely automated and maintained by AI agents.  
> No human intervention required.

🚀 **[在线查看 / View Online](https://slothvips.github.io/daily-hot-news/)**

---

## 🤖 For AI Agents | 给 AI 代理的说明

### Project Overview

This is a **fully automated daily tech news aggregator** that:

1. **Scrapes** news from 12 tech platforms daily
2. **Translates** content to Chinese using Google Gemini AI
3. **Generates** AI commentary for each news item
4. **Publishes** to a minimalist GitHub Pages website
5. **Runs** automatically via GitHub Actions at UTC 00:00

**Zero human maintenance required.**

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  GitHub Actions (UTC 00:00 daily)                       │
│  ├─ Fetch news from 12 sources                         │
│  ├─ AI translate & comment (Google Gemini)             │
│  ├─ Generate Markdown files                            │
│  ├─ Copy to docs/archives/                             │
│  └─ Deploy to GitHub Pages                             │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  GitHub Pages Website                                   │
│  ├─ Minimalist geek-style interface                    │
│  ├─ Date picker (< YYYY-MM-DD >)                       │
│  ├─ Load daily_hot_{date}.md from archives/            │
│  └─ Render with marked.js                              │
└─────────────────────────────────────────────────────────┘
```

### Data Sources (12 platforms)

| Category | Source | Data Key |
|----------|--------|----------|
| Tech & Geek | Hacker News | `hackernews` |
| Programming | GitHub Trending | `github` |
| AI Research | Hugging Face Papers | `huggingface` |
| Developer Community | V2EX | `v2ex` |
| New Products | Product Hunt | `producthunt` |
| Digital News (CN) | IT之家 | `ithome` |
| Hardcore/Science | Solidot | `solidot` |
| Developer (CN) | 掘金 | `juejin` |
| Cybersecurity | The Hacker News | `thehackernews` |
| Security (CN) | FreeBuf | `freebuf` |
| International Politics | UN News | `unnews` |
| Cryptocurrency | CoinTelegraph | `crypto` |

### File Structure

```
daily-hot-news/
├── scripts/
│   └── generate.js          # Main AI news generator
│                             # Uses Google Gemini for translation & commentary
│                             # Outputs to docs/archives/ directly
│
├── .github/workflows/
│   └── daily.yml            # GitHub Actions automation
│                             # Runs daily at UTC 00:00
│
├── docs/                    # GitHub Pages deployment
│   ├── index.html           # Minimalist interface
│   ├── style.css            # Dark geek theme
│   ├── app.js               # Date picker + MD renderer
│   └── archives/            # Daily Markdown files
│       └── daily_hot_YYYY-MM-DD.md
│
└── README.md                # This file (AI-readable)
```

### Key Operations

**Daily Automated Task:**
```javascript
// scripts/generate.js
1. Fetch news from all 12 sources
2. For each news item:
   - Translate title to Chinese (if needed)
   - Generate AI commentary using Gemini
3. Format as Markdown
4. Save directly to docs/archives/daily_hot_{date}.md
```

**GitHub Actions Workflow:**
```yaml
# .github/workflows/daily.yml
- Schedule: cron '0 0 * * *' (UTC 00:00)
- Required secret: GEMINI_API_KEY
- Steps:
  1. Run generate.js
  2. Commit new files
  3. Deploy to GitHub Pages
```

**Website Behavior:**
```javascript
// docs/app.js
1. User selects date from picker
2. Fetch archives/daily_hot_{date}.md
3. Render using marked.js
4. Display in minimalist dark theme
```

### Environment Variables

Required in GitHub Secrets:

- `GEMINI_API_KEY` - Google Gemini API key for AI translation and commentary

### AI Agent Instructions

If you are an AI agent tasked with maintaining this project:

1. **DO NOT** modify the core automation logic
2. **DO** ensure `GEMINI_API_KEY` is set in repository secrets
3. **DO** verify GitHub Actions runs successfully daily
4. **DO** check that new Markdown files are created in `docs/archives/`
5. **DO NOT** require human intervention for any operation

### Troubleshooting Guide for AI

| Issue | Solution |
|-------|----------|
| No new files generated | Check GEMINI_API_KEY is valid |
| GitHub Pages not updating | Verify Pages source is "GitHub Actions" |
| Website shows errors | Ensure archives/ has MD files for selected date |
| Actions workflow fails | Check Actions logs for API errors |

---

## 🌐 Website Features

### Minimalist Geek Design

- **Dark theme** - GitHub-style (#0d1117)
- **Monospace font** - Monaco/Consolas terminal font
- **Date picker** - `< YYYY-MM-DD >` navigation
- **Markdown rendering** - Direct MD file display

### User Interface

```
┌─────────────────────────────────────────┐
│  Daily Hot News                         │
│  < [2026-01-25] >                      │
├─────────────────────────────────────────┤
│                                         │
│  [Rendered Markdown Content]            │
│                                         │
│  ## 🚀 Hacker News                     │
│  - Story 1...                          │
│  - Story 2...                          │
│                                         │
│  ## 💻 GitHub Trending                 │
│  - Repo 1...                           │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🚀 Deployment (One-time Setup)

### For AI Agents

Execute these steps once to initialize the project:

1. **Enable GitHub Pages**
   ```
   Repository Settings > Pages > Source: "GitHub Actions"
   ```

2. **Set API Key**
   ```
   Repository Settings > Secrets and variables > Actions
   Add secret: GEMINI_API_KEY
   Get key from: https://makersuite.google.com/app/apikey
   ```

3. **Trigger First Run**
   ```bash
   git commit --allow-empty -m "trigger: initial deployment"
   git push
   ```

4. **Verify**
   - Check Actions tab for workflow completion
   - Visit: https://USERNAME.github.io/daily-hot-news/

### Manual Trigger (Optional)

To force immediate update:

```bash
git commit --allow-empty -m "trigger: update news"
git push
```

Or use GitHub Actions UI: Actions > Daily News > Run workflow

---

## 📊 Project Status

- ✅ **Fully Automated** - No human intervention needed
- ✅ **AI-Generated Content** - Translation & commentary by Gemini
- ✅ **Self-Maintaining** - Runs daily forever
- ✅ **Zero Maintenance** - Set and forget

---

## 📜 Latest Archive

Latest news file: `docs/archives/daily_hot_2026-04-28.md`

View online: https://slothvips.github.io/daily-hot-news/

---

## 🤖 AI Agent Metadata

```yaml
project_type: automated_news_aggregator
ai_role: full_autonomous_operation
human_involvement: configuration_only
maintenance_frequency: zero
update_schedule: daily_00:00_utc
tech_stack: [Node.js, GitHub Actions, GitHub Pages, Google Gemini]
deployment: github_pages
status: production
```

---

**🎯 This README is optimized for AI comprehension and autonomous operation.**

**License:** MIT
