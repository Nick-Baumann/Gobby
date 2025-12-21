type PamAuthenticate = (
  username: string,
  password: string,
  callback: (err: Error | null) => void,
) => void;

let pamAuth: PamAuthenticate | null | undefined;
let pamError: string | null = null;

async function loadPam(): Promise<void> {
  if (pamAuth !== undefined) return;
  try {
    // Vite/Vitest: avoid static analysis/bundling for optional native deps.
    const pkgName = "authenticate-pam";
    const mod = (await import(pkgName)) as
      | { authenticate?: PamAuthenticate; default?: PamAuthenticate }
      | PamAuthenticate;
    const candidate =
      typeof mod === "function"
        ? mod
        : typeof (mod as { authenticate?: PamAuthenticate }).authenticate ===
            "function"
          ? (mod as { authenticate: PamAuthenticate }).authenticate
          : typeof (mod as { default?: PamAuthenticate }).default === "function"
            ? (mod as { default: PamAuthenticate }).default
            : null;
    if (!candidate) {
      throw new Error(
        "authenticate-pam did not export an authenticate function",
      );
    }
    pamAuth = candidate;
  } catch (err) {
    pamAuth = null;
    pamError = err instanceof Error ? err.message : String(err);
  }
}

export type PamAvailability = {
  available: boolean;
  error?: string;
};

export async function getPamAvailability(): Promise<PamAvailability> {
  await loadPam();
  return pamAuth
    ? { available: true }
    : { available: false, error: pamError ?? undefined };
}

export async function verifyPamCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  await loadPam();
  const auth = pamAuth;
  if (!auth) return false;
  return await new Promise<boolean>((resolve) => {
    auth(username, password, (err) => resolve(!err));
  });
}
