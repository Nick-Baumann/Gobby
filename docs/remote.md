---
summary: "Remote mode topology using SSH control channels between gateway and mac app"
read_when:
  - Running or troubleshooting remote gateway setups
---
# Remote mode with control channel

This repo supports “remote over SSH” by keeping a single gateway (the master) running on a host (e.g., your Mac Studio) and connecting one or more macOS menu bar clients to it. The menu app no longer shells out to `pnpm clawdis …`; it talks to the gateway over a persistent control channel that is tunneled through SSH.

## Topology
- Master: runs the gateway + control server on `127.0.0.1:18789` (in-process TCP server).
- Clients: when “Remote over SSH” is selected, the app opens one SSH tunnel:
  - `ssh -N -L <localPort>:127.0.0.1:18789 <user>@<host>`
  - The app then connects to `localhost:<localPort>` and keeps that socket open.
- Messages are newline-delimited JSON (documented in `docs/control-api.md`).

## Connection flow (clients)
1) Establish SSH tunnel.
2) Open TCP socket to the local forwarded port.
3) Send `ping` to verify connectivity.
4) Issue `health`, `status`, and `last-heartbeat` requests to seed UI.
5) Listen for `event` frames (heartbeat updates, gateway status).

## Heartbeats
- Heartbeats always run on the master gateway.
- The control server emits `event: "heartbeat"` after each heartbeat attempt and keeps the latest in memory for `last-heartbeat` requests.
- No file-based heartbeat logs/state are required when the control stream is available.

## Local mode
- The menu app skips SSH and connects directly to `127.0.0.1:18789` with the same protocol.

## Failure handling
- If the tunnel drops, the client reconnects and re-issues `ping`, `health`, and `last-heartbeat` to refresh state (the mac app shows “Control channel disconnected”).
- If the control port is unavailable (older gateway), the app can optionally fall back to the legacy CLI path, but the goal is to rely solely on the control channel.

## Test Remote (in the mac app)
1) SSH reachability check (`ssh -o BatchMode=yes … echo ok`).
2) If SSH succeeds, the app opens the control tunnel and issues a `health` request; success marks the remote as ready.

## Security
- Control server listens only on localhost.
- SSH tunneling reuses existing keys/agent; no additional auth is added by the control server.

## Files to keep in sync
- Protocol definition: `docs/control-api.md`.
- App connection logic: macOS `Remote over SSH` plumbing.
- Gateway control server: lives inside the Node gateway process.
