# JChat 3.0 — Continuity Index

> New chat session? Start here. Tell Claude: "Estoy retomando JChat 3.0. Lee docs/CONTINUITY.md en jcgarcia007/jchat-3 y dame el estado."

This /docs/ folder is the durable knowledge base for JChat 3.0 so work continues across chat sessions without losing context (chats fill with images and must restart).

## Read these in order
1. PROJECT_STATUS.md — Where the project is right now, what's deployed, the prioritized plan. Read first when resuming.
2. DECISIONS.md — Every significant technical/product decision and why.
3. PROJECT_ORIGIN.md — Founding definitions: what JChat is, stack, markets, business model.
4. design-references.md — Reference designs as SVG/HTML.

## How Claude should resume a session
1. Read PROJECT_STATUS.md to load current state + next steps.
2. Skim DECISIONS.md so you don't re-litigate settled choices.
3. Use MCP tools (GitHub, Supabase klfsgcfoahdtkojyqspd, Vercel prj_sGiwIjcnfUbrdzuITqY7ikEMI9tI) to verify live state before acting.
4. Continue from "What's next" in PROJECT_STATUS.md.

## Working agreement (to keep chats long-lived)
- Prefer pasting text/errors over screenshots. Claude reads code directly from GitHub via MCP. Screenshots only for genuinely visual UI matters.
- Local repo: /Users/jcgarcia/Projects/JchatVer3.0 (NO space — has web/ + mobile/). If Claude Code lands in mobile/ and can't find web/, run: git rev-parse --show-toplevel and cd to root.
- Planning Claude (web/app): writes specs, audits every SHA via GitHub MCP, checks Vercel deploys. Its GitHub WRITE returns 403 → ALL commits via Claude Code CLI.
- Claude Code (CLI): implements, commits, migrates, builds (Supabase MCP + GitHub write + XcodeBuildMCP).
- With ignoreBuildErrors active, build won't catch type errors — run npx tsc --noEmit manually on touched files.
- Audit every Claude Code diff: it sometimes adds unrequested features (e.g. gift toggle) or drops safety nets (min-validation). Flag deviations.
- Keep this /docs/ set updated as milestones complete.

Last updated: 2026-06-29
