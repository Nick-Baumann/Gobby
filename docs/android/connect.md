---
summary: "Runbook: connect/pair the Android node to a Clawdis Gateway and use Canvas/Chat/Camera"
read_when:
  - Pairing or reconnecting the Android node
  - Debugging Android bridge discovery or auth
  - Verifying chat history parity across clients
---

# Android Node Connection Runbook

Android node app ⇄ (mDNS/NSD + TCP bridge) ⇄ **Gateway bridge** ⇄ (loopback WS) ⇄ **Gateway**

The Gateway WebSocket stays loopback-only (`ws://127.0.0.1:18789`). Android talks to the LAN-facing **bridge** (default `tcp://0.0.0.0:18790`) and uses Gateway-owned pairing.

## Prerequisites

- You can run the Gateway on the “master” machine.
- Android device/emulator is on the same LAN (mDNS must work) or you know the gateway’s LAN IP for manual connect.
- You can run the CLI (`clawdis`) on the gateway machine (or via SSH).

## 1) Start the Gateway (with bridge enabled)

Bridge is enabled by default (disable via `CLAWDIS_BRIDGE_ENABLED=0`).

```bash
pnpm clawdis gateway --port 18789 --verbose
```

Confirm in logs you see something like:
- `bridge listening on tcp://0.0.0.0:18790 (Iris)`

## 2) Verify discovery (optional)

From the gateway machine:

```bash
dns-sd -B _clawdis-bridge._tcp local.
```

More debugging notes: `docs/bonjour.md`.

## 3) Connect from Android

In the Android app:

- The app keeps its bridge connection alive via a **foreground service** (persistent notification).
- Open **Settings**.
- Under **Discovered Bridges**, select your gateway and hit **Connect**.
- If mDNS is blocked, use **Advanced → Manual Bridge** (host + port) and **Connect (Manual)**.

After the first successful pairing, Android auto-reconnects on launch:
- Manual endpoint (if enabled), otherwise
- The last discovered bridge (best-effort).

## 4) Approve pairing (CLI)

On the gateway machine:

```bash
clawdis nodes pending
clawdis nodes approve <requestId>
```

Pairing details: `docs/gateway/pairing.md`.

## 5) Verify the node is connected

- Via nodes list:
  ```bash
  clawdis nodes list
  ```
- Via Gateway:
  ```bash
  clawdis gateway call node.list --params "{}"
  ```

## 6) Chat + history

The Android node’s Chat sheet uses the gateway’s **primary session key** (`main`), so history and replies are shared with WebChat and other clients:

- History: `chat.history`
- Send: `chat.send`
- Push updates (best-effort): `chat.subscribe` → `event:"chat"`

## 7) Canvas + camera

Canvas commands (foreground only):
- `screen.eval`, `screen.snapshot`, `screen.navigate`, `screen.setMode`

Camera commands (foreground only; permission-gated):
- `camera.snap` (jpg)
- `camera.clip` (mp4)

See `docs/camera.md` for parameters and CLI helpers.
