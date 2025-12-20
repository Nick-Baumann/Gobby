---
name: bird
description: X/Twitter CLI for reading, searching, and posting via cookies or Sweetistics.
metadata: {"clawdis":{"requires":{"bins":["bird"]},"install":[{"id":"pnpm-build","kind":"shell","command":"if [ ! -d ~/Projects/bird ]; then git clone https://github.com/steipete/bird.git ~/Projects/bird; fi && cd ~/Projects/bird && pnpm install && pnpm run binary","bins":["bird"],"label":"Clone + build bird (pnpm)"}]}}
---

# bird

Use `bird` to read/search X and post tweets/replies.

Quick start
- `bird whoami`
- `bird read <url-or-id>`
- `bird thread <url-or-id>`
- `bird search "query" -n 5`

Posting (confirm with user first)
- `bird tweet "text"`
- `bird reply <id-or-url> "text"`

Auth sources
- Browser cookies (default: Firefox/Chrome)
- Sweetistics API: set `SWEETISTICS_API_KEY` or use `--engine sweetistics`
- Check sources: `bird check`
