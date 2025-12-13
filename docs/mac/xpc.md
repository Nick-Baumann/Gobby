---
summary: "macOS IPC architecture for Clawdis app, CLI helper, and gateway bridge (control socket + XPC + PeekabooBridge)"
read_when:
  - Editing IPC contracts or menu bar app IPC
---
# Clawdis macOS IPC architecture (Dec 2025)

Note: the current implementation primarily uses a local UNIX-domain control socket (`controlSocketPath`) between `clawdis-mac` and the app. This doc captures the intended long-term Mach/XPC direction and the security constraints, and also documents the separate PeekabooBridge socket used for UI automation.

## Goals
- Single GUI app instance that owns all TCC-facing work (notifications, screen recording, mic, speech, AppleScript).
- A small surface for automation: the `clawdis-mac` CLI and the Node gateway talk to the app via local IPC.
- Predictable permissions: always the same signed bundle ID, launched by launchd, so TCC grants stick.
- Limit who can connect: only signed clients from our team (with an explicit DEBUG-only escape hatch for development).

## How it works
### Control socket (current)
- `clawdis-mac` talks to the app via a local UNIX socket (`controlSocketPath`) for app-specific requests (notify, status, ensure-permissions, run, etc.).

### PeekabooBridge (UI automation)
- UI automation uses a separate UNIX socket named `bridge.sock` and the PeekabooBridge JSON protocol.
- Host preference order (client-side): Peekaboo.app → Clawdis.app → local execution.
- Security: bridge hosts require TeamID `Y5PE65HELJ`; DEBUG-only same-UID escape hatch is guarded by `PEEKABOO_ALLOW_UNSIGNED_SOCKET_CLIENTS=1` (Peekaboo convention).
- See: `docs/mac/peekaboo.md` for the Clawdis plan and naming.

### Mach/XPC (future direction)
- The app registers a Mach service named `com.steipete.clawdis.xpc` via a user LaunchAgent at `~/Library/LaunchAgents/com.steipete.clawdis.plist`.
- The launch agent runs `dist/Clawdis.app/Contents/MacOS/Clawdis` with `RunAtLoad=true`, `KeepAlive=false`, and a `MachServices` entry for the XPC name.
- The app hosts the XPC listener (`NSXPCListener(machServiceName:)`) and exports `ClawdisXPCService`.
- The CLI (`clawdis-mac`) connects with `NSXPCConnection(machServiceName:)`; the Node gateway shells out to the CLI.
- Security: on incoming connections we read the audit token (or PID) and allow only:
  - Code-signed clients with team ID `Y5PE65HELJ`.
  - In `DEBUG` builds only, you can opt into allowing same-UID clients by setting `CLAWDIS_ALLOW_UNSIGNED_SOCKET_CLIENTS=1`.

## Operational flows
- Restart/rebuild: `SIGN_IDENTITY="Apple Development: Peter Steinberger (2ZAC4GM7GD)" scripts/restart-mac.sh`
  - Kills existing instances
  - Swift build + package
  - Writes/bootstraps/kickstarts the LaunchAgent
- CLI version: `clawdis-mac --version` (pulled from `package.json` during packaging)
- Single instance: app exits early if another instance with the same bundle ID is running.

## Why launchd (not anonymous endpoints)
- A Mach service avoids brittle endpoint handoffs and lets the CLI/Node connect even if the app was started by launchd.
- RunAtLoad without KeepAlive means the app starts once; if it crashes it stays down (no unwanted respawn), but CLI calls will re-spawn via launchd.

## Hardening notes
- Prefer requiring a TeamID match for all privileged surfaces.
  - Clawdis control socket: `CLAWDIS_ALLOW_UNSIGNED_SOCKET_CLIENTS=1` (DEBUG-only) may allow same-UID callers for local development.
  - PeekabooBridge: `PEEKABOO_ALLOW_UNSIGNED_SOCKET_CLIENTS=1` (DEBUG-only) may allow same-UID callers for local development.
- All communication remains local-only; no network sockets are exposed.
- TCC prompts originate only from the GUI app bundle; run scripts/package-mac-app.sh so the signed bundle ID stays stable.
