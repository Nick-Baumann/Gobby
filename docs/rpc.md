---
summary: "JSON RPC contract used by the mac app to talk to the gateway"
read_when:
  - Changing mac app RPC or agent toggles
---
# Clawdis Agent RPC

Live, stdin/stdout JSON RPC used by the mac app (XPC) to avoid spawning `clawdis agent --json` for every send and to toggle runtime features (e.g., heartbeats) without restarting the gateway.

## How it is launched
- The mac app starts `clawdis rpc` in the configured project root (`CommandResolver.projectRoot()`, defaults to `~/Projects/clawdis`).
- Environment PATH is augmented with repo `node_modules/.bin`, pnpm home, /opt/homebrew/bin, /usr/local/bin.
- Process is kept alive; crashes are handled by the app’s RPC helper restarting it.

## Request/response protocol (newline-delimited JSON)
### Requests (stdin)
- `{"type":"status"}` → health ping.
- `{"type":"send","text":"hi","session":"main","thinking":"low","deliver":false,"to":"+1555..."}` → invokes existing agent send path.
- `{"type":"set-heartbeats","enabled":true|false}` → enables/disables web heartbeat timers in the running gateway process.

### Responses (stdout)
- `{"type":"result","ok":true,"payload":{...}}` on success.
- `{"type":"error","error":"..."}` on failures or unsupported commands.

Notes:
- `send` reuses the agent JSON payload extraction; `payload.payloads[0].text` carries the text reply when present.
- Unknown `type` returns `error`.

## Heartbeat control (new)
- The mac menu exposes “Send heartbeats” toggle (persisted in UserDefaults).
- On change, mac sends `set-heartbeats` RPC; the gateway updates an in-memory flag and short-circuits its heartbeat timers (`web-heartbeat` logging + reply heartbeats).
- No gateway restart required.

## Fallbacks / safety
- If the RPC process is not running, mac-side RPC calls fail fast and the app logs/clears state; callers may fall back to one-shot CLI where appropriate.
- PATH resolution prefers a real `clawdis` binary, otherwise node + repo `bin/clawdis.js`, otherwise pnpm `clawdis`.

## Future extensions
- Add `abort` to cancel in-flight sends.
- Add `compact` / `status --verbose` to return gateway internals (queue depth, session info).
- Add a JSON schema test for the RPC contract.
