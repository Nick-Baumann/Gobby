import { afterEach, describe, expect, it, vi } from "vitest";

import { browserStatus } from "./client.js";

describe("browser client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wraps connection failures with a gateway hint", async () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1"), {
      code: "ECONNREFUSED",
    });
    const fetchFailed = Object.assign(new TypeError("fetch failed"), {
      cause: refused,
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(fetchFailed));

    await expect(browserStatus("http://127.0.0.1:18791")).rejects.toThrow(
      /Start .*gateway/i,
    );
  });
});
