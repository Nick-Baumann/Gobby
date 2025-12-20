import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildWorkspaceSkillsPrompt } from "./skills.js";

describe("buildWorkspaceSkillsPrompt", () => {
  it("loads skills from workspace skills/", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdis-"));
    const skillDir = path.join(workspaceDir, "skills", "demo-skill");
    await fs.mkdir(skillDir, { recursive: true });

    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: demo-skill
description: Does demo things
---

# Demo Skill
`,
      "utf-8",
    );

    const prompt = buildWorkspaceSkillsPrompt(workspaceDir, {
      managedSkillsDir: path.join(workspaceDir, ".managed"),
    });
    expect(prompt).toContain("demo-skill");
    expect(prompt).toContain("Does demo things");
    expect(prompt).toContain(path.join(skillDir, "SKILL.md"));
  });

  it("filters skills based on env/config gates", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawdis-"));
    const skillDir = path.join(workspaceDir, "skills", "nano-banana-pro");
    await fs.mkdir(skillDir, { recursive: true });

    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: nano-banana-pro
description: Generates images
metadata: {"clawdis":{"requires":{"env":["GEMINI_API_KEY"]},"primaryEnv":"GEMINI_API_KEY"}}
---

# Nano Banana
`,
      "utf-8",
    );

    const missingPrompt = buildWorkspaceSkillsPrompt(workspaceDir, {
      managedSkillsDir: path.join(workspaceDir, ".managed"),
      config: { skills: { "nano-banana-pro": { apiKey: "" } } },
    });
    expect(missingPrompt).not.toContain("nano-banana-pro");

    const enabledPrompt = buildWorkspaceSkillsPrompt(workspaceDir, {
      managedSkillsDir: path.join(workspaceDir, ".managed"),
      config: { skills: { "nano-banana-pro": { apiKey: "test-key" } } },
    });
    expect(enabledPrompt).toContain("nano-banana-pro");
  });
});
