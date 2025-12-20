---
name: clawdis-browser
description: Control clawd's dedicated browser (tabs, snapshots, actions) via the clawdis CLI.
metadata: {"clawdis":{"requires":{"config":["browser.enabled"]}}}
---

# Clawdis Browser

Use the clawd-managed Chrome/Chromium instance through `clawdis browser` commands.

## Common commands

- Status/start/stop: `clawdis browser status|start|stop`
- Tabs: `clawdis browser tabs|open <url>|focus <id>|close <id>`
- Snapshot/screenshot: `clawdis browser snapshot --format ai|aria`, `clawdis browser screenshot [--full-page]`
- Actions: `clawdis browser click|type|hover|drag|select|upload|press|wait|navigate|back|evaluate|run`

If disabled, ask the user to enable `browser.enabled` in `~/.clawdis/clawdis.json`.
