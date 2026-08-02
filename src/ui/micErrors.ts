/** Friendly, non-blaming copy for every way the mic can fail (PRD §10). */
export const ERROR_COPY: Record<string, string> = {
  "permission-denied":
    "Microphone access was denied. Allow the mic in your browser's site settings and reload.",
  "no-microphone": "No microphone found. Plug one in and reload.",
  "no-audioworklet":
    "This browser doesn't support AudioWorklet. Try a recent Chrome, Firefox or Safari.",
  unknown: "Couldn't start the microphone.",
};

export function micErrorCopy(kind: string): string {
  return ERROR_COPY[kind] ?? ERROR_COPY.unknown;
}
