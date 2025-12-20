---
name: brave-search
description: Headless web search and content extraction via Brave Search scripts.
metadata: {"clawdis":{"requires":{"bins":["search.js","content.js"]}}}
---

# brave-search

Use `search.js` and `content.js` from `~/agent-tools/brave-search` (PATH).

Search
- `search.js "query"`
- `search.js "query" -n 10`
- `search.js "query" --content`

Extract content
- `content.js https://example.com/article`

Notes
- No browser required; results come from Brave Search HTML.
- If commands are missing, add `~/agent-tools/brave-search` to PATH and install deps.
