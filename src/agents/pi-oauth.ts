import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PI_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";

type OAuthCredentials = {
  type: "oauth";
  refresh: string;
  access: string;
  /** Unix ms timestamp (already includes buffer) */
  expires: number;
};

type OAuthStorageFormat = Record<string, OAuthCredentials | undefined>;

const ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";

function getPiAgentDir(): string {
  const override = process.env[PI_AGENT_DIR_ENV];
  if (override?.trim()) return override.trim();
  return path.join(os.homedir(), ".pi", "agent");
}

function getPiOAuthPath(): string {
  return path.join(getPiAgentDir(), "oauth.json");
}

async function loadOAuthStorage(): Promise<OAuthStorageFormat> {
  const filePath = getPiOAuthPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as OAuthStorageFormat;
    }
  } catch {
    // missing/invalid: treat as empty
  }
  return {};
}

async function saveOAuthStorage(storage: OAuthStorageFormat): Promise<void> {
  const filePath = getPiOAuthPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, JSON.stringify(storage, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    // best effort (windows / restricted fs)
  }
}

async function refreshAnthropicToken(
  refreshToken: string,
): Promise<OAuthCredentials> {
  const tokenResponse = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: ANTHROPIC_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Anthropic OAuth token refresh failed: ${error}`);
  }

  const tokenData = (await tokenResponse.json()) as {
    refresh_token: string;
    access_token: string;
    expires_in: number;
  };

  // 5 min buffer
  const expiresAt = Date.now() + tokenData.expires_in * 1000 - 5 * 60 * 1000;
  return {
    type: "oauth",
    refresh: tokenData.refresh_token,
    access: tokenData.access_token,
    expires: expiresAt,
  };
}

export async function getAnthropicOAuthToken(): Promise<string | null> {
  const storage = await loadOAuthStorage();
  const creds = storage.anthropic;
  if (!creds) return null;

  // If expired, attempt refresh; on failure, remove creds.
  if (Date.now() >= creds.expires) {
    try {
      const refreshed = await refreshAnthropicToken(creds.refresh);
      storage.anthropic = refreshed;
      await saveOAuthStorage(storage);
      return refreshed.access;
    } catch {
      delete storage.anthropic;
      await saveOAuthStorage(storage);
      return null;
    }
  }

  return creds.access;
}
