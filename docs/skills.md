---
summary: "Skills: managed vs workspace, gating rules, and config/env wiring"
read_when:
  - Adding or modifying skills
  - Changing skill gating or load rules
---
<!-- {% raw %} -->
# Skills (Clawdis)

Clawdis uses **AgentSkills-compatible** skill folders to teach the agent how to use tools. Each skill is a directory containing a `SKILL.md` with YAML frontmatter and instructions. Clawdis loads **managed skills** plus **workspace skills**, and filters them at load time based on environment, config, and binary presence.

## Locations and precedence

Skills are loaded from **two** places:

1) **Managed skills**: `~/.clawdis/skills`
2) **Workspace skills**: `<workspace>/skills`

If a skill name conflicts, the **workspace** version wins (user overrides managed).

## Format (AgentSkills + Pi-compatible)

`SKILL.md` must include at least:

```markdown
---
name: nano-banana-pro
description: Generate or edit images via Gemini 3 Pro Image
---
```

Notes:
- We follow the AgentSkills spec for layout/intent.
- The parser used by the embedded agent supports **single-line** frontmatter keys only.
- `metadata` should be a **single-line JSON object**.
- Use `{baseDir}` in instructions to reference the skill folder path.

## Gating (load-time filters)

Clawdis **filters skills at load time** using `metadata` (single-line JSON):

```markdown
---
name: nano-banana-pro
description: Generate or edit images via Gemini 3 Pro Image
metadata: {"clawdis":{"requires":{"bins":["uv"],"env":["GEMINI_API_KEY"],"config":["browser.enabled"]},"primaryEnv":"GEMINI_API_KEY"}}
---
```

Fields under `metadata.clawdis`:
- `always: true` — always include the skill (skip other gates).
- `requires.bins` — list; each must exist on `PATH`.
- `requires.env` — list; env var must exist **or** be provided in config.
- `requires.config` — list of `clawdis.json` paths that must be truthy.
- `primaryEnv` — env var name associated with `skills.<name>.apiKey`.

If no `metadata.clawdis` is present, the skill is always eligible (unless disabled in config).

## Config overrides (`~/.clawdis/clawdis.json`)

Managed skills can be toggled and supplied with env values:

```json5
{
  skills: {
    "nano-banana-pro": {
      enabled: true,
      apiKey: "GEMINI_KEY_HERE",
      env: {
        GEMINI_API_KEY: "GEMINI_KEY_HERE"
      }
    },
    peekaboo: { enabled: true },
    sag: { enabled: false }
  }
}
```

Note: if the skill name contains hyphens, quote the key (JSON5 allows quoted keys).

Config keys match the **skill name**. We don’t require a custom `skillKey`.

Rules:
- `enabled: false` disables the managed skill even if installed.
- `env`: injected **only if** the variable isn’t already set in the process.
- `apiKey`: convenience for skills that declare `metadata.clawdis.primaryEnv`.

## Environment injection (per agent run)

When an agent run starts, Clawdis:
1) Reads skill metadata.
2) Applies any `skills.<key>.env` or `skills.<key>.apiKey` to `process.env`.
3) Builds the system prompt with **eligible** skills.
4) Restores the original environment after the run ends.

This is **scoped to the agent run**, not a global shell environment.

## Session snapshot (performance)

Clawdis snapshots the eligible skills **when a session starts** and reuses that list for subsequent turns in the same session. Changes to skills or config take effect on the next new session.

## Managed skills lifecycle

Managed skills are owned by Clawdis (not user-editable). Workspace skills are user-owned and override managed ones by name. The macOS app or installer should copy bundled skills into `~/.clawdis/skills` on install/update.

---
<!-- {% endraw %} -->
