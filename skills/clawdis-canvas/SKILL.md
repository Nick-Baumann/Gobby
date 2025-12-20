---
name: clawdis-canvas
description: Drive the Clawdis Canvas panel (present, eval, snapshot, A2UI) via the clawdis CLI.
metadata: {"clawdis":{"always":true}}
---

# Clawdis Canvas

Use Canvas to render HTML/JS or A2UI surfaces and capture snapshots.

Core commands
- Present: `clawdis canvas present [--node <id>] [--target <path>]`
- Hide: `clawdis canvas hide`
- Eval JS: `clawdis canvas eval --js "..."`
- Snapshot: `clawdis canvas snapshot`

A2UI
- Push JSONL: `clawdis canvas a2ui push --jsonl /path/to/file.jsonl`
- Reset: `clawdis canvas a2ui reset`

Notes
- Keep HTML under `~/clawd/canvas` when targeting remote nodes.
- Use snapshot after renders to verify UI state.
