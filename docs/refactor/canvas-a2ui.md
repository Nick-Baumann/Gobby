# Canvas / A2UI

## Goal
- A2UI rendering works out-of-the-box (no per-user toggles).
- A2UI button clicks always reach the agent automatically.
- Canvas chrome (close button) stays readable on any content.

## Current behavior
- Canvas can show a bundled A2UI shell at `/__clawdis__/a2ui/` when no session `index.html` exists.
- The A2UI shell forwards `a2ui.action` button clicks to native via `WKScriptMessageHandler` (`clawdisCanvasA2UIAction`).
- Native forwards the click to the gateway as an agent invocation.

## Fixes (2025-12-17)
- Close button: render a small vibrancy/material pill behind the “x” and reduce the button size for less visual weight.
- Click reliability: `GatewayConnection` auto-starts the local gateway (and retries briefly) when a request fails in `.local` mode, so Canvas actions don’t silently fail if the gateway isn’t running yet.

## Follow-ups
- Add a small “action sent / failed” debug overlay in the A2UI shell (dev-only) to make failures obvious.
- Decide whether non-local Canvas content should ever be allowed to emit A2UI actions (current stance: no, for safety).
