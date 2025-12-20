---
name: wacli
description: WhatsApp CLI for sync, search, and sending messages.
metadata: {"clawdis":{"requires":{"bins":["wacli"]}}}
---

# wacli

Use `wacli` for WhatsApp sync/search/send via WhatsApp Web protocol.

Auth + sync
- `wacli auth` (QR login + initial sync)
- `wacli sync --follow` (continuous sync)
- `wacli doctor`

Search + history
- `wacli messages search "query"`
- `wacli history backfill --chat <jid> --requests 5 --count 50`

Send
- Text: `wacli send text --to 1234567890 --message "hello"`
- File: `wacli send file --to 1234567890 --file /path/pic.jpg --caption "hi"`

Notes
- Store dir: `~/.wacli` (override with `--store`).
- Backfill requires your phone online; results are best-effort.
- Confirm recipient + message before sending.
