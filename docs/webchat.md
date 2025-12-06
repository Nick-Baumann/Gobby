# Web Chat (macOS menu bar)

The macOS Clawdis app embeds the `pi-web-ui` chat surface inside `WKWebView`, wired directly to your **primary session** (`main` unless `inbound.reply.session.mainKey` overrides it). No HTTP server is started; assets are bundled into the app and loaded from `file://`, so nothing is exposed on the network.

## How it works
- **UI bundle**: `apps/macos/Sources/Clawdis/Resources/WebChat/` contains `pi-web-ui` dist plus vendor deps and a tiny `pi-ai` stub.
- **Bridge**: a `WKScriptMessageHandler` named `clawdis` passes chat turns to `pnpm clawdis agent --to <sessionKey> --message ... --json` and returns the first payload text. Everything stays in-process—no sockets, no local web server.
- **Session**: always uses the primary key; history is hydrated from `~/.clawdis/sessions/<SessionId>.jsonl` so turns from WhatsApp/Telegram show up here too.

## Building/updating the bundle
1. Ensure `../pi-mono` is present and `pnpm install` has been run there.
2. Sync vendor files: copied from `../pi-mono/node_modules` into `apps/macos/Sources/Clawdis/Resources/WebChat/vendor` (run via repo scripts when updating).
3. The mac app loads assets relative to the bundled folder with an import map; no external CDN or HTTP endpoints are used.
4. Rebuild/restart the app with `./scripts/restart-mac.sh` (required so the new resources land in the app bundle).

## Limitations
- Text-only, single-turn response (no streaming yet; tools/attachments not plumbed).
- The embedded `pi-ai` is a stub sufficient for UI wiring; provider selection is fixed to the primary Clawd session.

## Troubleshooting
- Right-click → “Inspect Element” opens Web Inspector. Check the console for `boot:` messages.
- Blank view usually means import map or vendor assets are missing; confirm files exist under `Resources/WebChat/vendor` and the import map points to relative paths.
- Errors are rendered in-page in red if the boot script fails after parsing.
