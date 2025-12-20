---
name: sonoscli
description: Control Sonos speakers (discover/status/play/volume/group).
metadata: {"clawdis":{"requires":{"bins":["sonos"]}}}
---

# Sonos CLI

Use `sonos` to control Sonos speakers.

- Discover: `sonos discover`
- Status: `sonos status`
- Playback: `sonos play|pause|stop`
- Volume: `sonos volume set <0-100>`
- Group: `sonos group <leader> <member>`

If SSDP fails, specify `--ip <speaker-ip>`.
