# JChat 3.0 — Continuity Index

> New chat session? Start here. Tell Claude: "Estoy retomando JChat 3.0. Lee docs/CONTINUITY.md en jcgarcia007/jchat-3 y dame el estado."

This /docs/ folder is the durable knowledge base for JChat 3.0 so work can continue across chat sessions without losing context (chats fill up with images and must restart).

## Read these in order
1. PROJECT_STATUS.md — Where the project is right now, what's deployed, and the prioritized plan for what's next. Read first when resuming.
2. DECISIONS.md — Every significant technical/product decision and why it was made.
3. PROJECT_ORIGIN.md — Founding definitions: what JChat is, stack, markets, business model, original framing questions.
4. design-references.md — Reference designs (heat zones, avatar sizes) as SVG/HTML openable in a browser.

## How Claude should resume a session
When the user says they're resuming JChat 3.0:
1. Read PROJECT_STATUS.md to load current state + next steps.
2. Skim DECISIONS.md so you don't re-litigate settled choices.
3. Use MCP tools (GitHub, Supabase klfsgcfoahdtkojyqspd, Vercel prj_sGiwIjcnfUbrdzuITqY7ikEMI9tI) to verify live state before acting.
4. Continue from the "What's next" section of PROJECT_STATUS.md.

## Working agreement (to keep chats long-lived)
- Prefer pasting text/errors over screenshots. Claude reads code directly from GitHub via MCP.
- Screenshots only for genuinely visual UI matters.
- Claude Code (CLI) implements; the planning Claude instance writes specs + verifies via MCP.
- Keep this /docs/ set updated as milestones complete.

Last updated: 2026-06-22
