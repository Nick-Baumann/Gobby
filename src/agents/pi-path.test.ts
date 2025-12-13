import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { resolveBundledPiBinary } from "./pi-path.js";

describe("pi-path", () => {
  it("resolves to a bundled binary path when available", () => {
    const resolved = resolveBundledPiBinary();
    expect(resolved === null || typeof resolved === "string").toBe(true);
    if (typeof resolved === "string") {
      expect(resolved).toMatch(/pi-coding-agent/);
      expect(resolved).toMatch(/dist\/pi|dist\/cli\.js|bin\/tau-dev\.mjs/);
    }
  });

  it("prefers dist/pi when present (branch coverage)", () => {
    const original = fs.existsSync.bind(fs);
    const spy = vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith(path.join("dist", "pi"))) return true;
      return original(p);
    });
    try {
      const resolved = resolveBundledPiBinary();
      expect(resolved).not.toBeNull();
      expect(typeof resolved).toBe("string");
      expect(resolved).toMatch(/dist\/pi$/);
    } finally {
      spy.mockRestore();
    }
  });
});
