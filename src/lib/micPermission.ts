// The browser's own microphone permission state, read without asking for the
// mic. `permissions.query` is not an audio call (hard rule 4 does not apply),
// so it can run on mount. Safari before 16 and some webviews lack it or reject
// "microphone"; a few never settle. All of that is `unsupported`. Never throws.

export type MicPermission = "granted" | "prompt" | "denied" | "unsupported";

interface PermissionsLike {
  query: (d: { name: string }) => Promise<{ state: string }>;
}

/** Longest we wait for an answer before calling it `unsupported`. */
export const MIC_PERMISSION_TIMEOUT_MS = 500;

export async function queryMicPermission(
  permissions: PermissionsLike | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator.permissions as unknown as PermissionsLike | undefined),
  timeoutMs: number = MIC_PERMISSION_TIMEOUT_MS,
): Promise<MicPermission> {
  try {
    if (!permissions || typeof permissions.query !== "function") return "unsupported";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((done) => {
      timer = setTimeout(() => done(null), timeoutMs);
    });
    const status = await Promise.race([permissions.query({ name: "microphone" }), timeout]);
    clearTimeout(timer);
    const state = status?.state;
    return state === "granted" || state === "prompt" || state === "denied" ? state : "unsupported";
  } catch {
    return "unsupported";
  }
}
