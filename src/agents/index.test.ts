import { describe, expect, it } from "vitest";

import { getAgentSpec } from "./index.js";

describe("agents index", () => {
  it("returns a spec for pi", () => {
    const spec = getAgentSpec("pi");
    expect(spec).toBeTruthy();
    expect(spec.kind).toBe("pi");
    expect(typeof spec.parseOutput).toBe("function");
  });
});
