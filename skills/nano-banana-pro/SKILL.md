---
name: nano-banana-pro
description: Generate or edit images via Gemini 3 Pro Image (Nano Banana Pro).
metadata: {"clawdis":{"requires":{"env":["GEMINI_API_KEY"]},"primaryEnv":"GEMINI_API_KEY"}}
---

# Nano Banana Pro Image Generation & Editing

Generate new images or edit existing ones using Google's Nano Banana Pro API.

## Usage (always run from the current working directory)

**Generate new image:**
```bash
uv run {baseDir}/scripts/generate_image.py --prompt "your image description" --filename "output-name.png" [--resolution 1K|2K|4K]
```

**Edit existing image:**
```bash
uv run {baseDir}/scripts/generate_image.py --prompt "editing instructions" --filename "output-name.png" --input-image "path/to/input.png" [--resolution 1K|2K|4K]
```

## API key

The script uses:
1) `GEMINI_API_KEY` environment variable
2) `--api-key` argument (optional)

If the key is missing, check `skills."nano-banana-pro".apiKey` or `skills."nano-banana-pro".env.GEMINI_API_KEY` in `~/.clawdis/clawdis.json`, or ask the user to provide one.

## Resolution

- `1K` (default), `2K`, `4K`
- Map user intent: low/1080 → `1K`, medium/2K → `2K`, high/ultra/4K → `4K`

## Filename

Use `{timestamp}-{short-name}.png` (yyyy-mm-dd-hh-mm-ss, lowercase, hyphens).

## Output

Do **not** read the image back; just report the saved path.
