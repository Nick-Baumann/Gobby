---
name: clawdis-canvas
description: Drive the Clawdis Canvas panel (present, eval, snapshot, A2UI) via the clawdis CLI.
metadata: {"clawdis":{"always":true}}
---

# Clawdis Canvas

Use Canvas to render HTML/JS or A2UI surfaces and capture snapshots.

## Core commands

- Show/hide: `clawdis canvas present [--node <id>] [--target <path>]`, `clawdis canvas hide`
- JS eval: `clawdis canvas eval --js "..."`
- Snapshot: `clawdis canvas snapshot`

## A2UI

- Push JSONL: `clawdis canvas a2ui push --jsonl /path/to/file.jsonl`
- Reset: `clawdis canvas a2ui reset`

If targeting remote nodes, use the canvas host (LAN/tailnet) and keep HTML under `~/clawd/canvas`.
