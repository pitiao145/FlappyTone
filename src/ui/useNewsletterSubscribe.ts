import { useState } from "react";
import { capturePostHogEvent } from "../analytics/posthog.ts";

type Status = "idle" | "loading" | "success";

/**
 * Shared submit logic for the two Kit signup forms (ComingSoon, Landing's
 * #mobile). `source` tags which form fired, for the funnel — never the email
 * itself, which stays out of PostHog per posthog.ts's own rule.
 */
export function useNewsletterSubscribe(source: "coming_soon" | "mobile") {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (email: string) => {
    setStatus("loading");
    setError(null);
    capturePostHogEvent("newsletter_signup_submitted", { source });
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        // fall through to the generic error below
      }
      if (!res.ok) {
        setStatus("idle");
        setError(data.error || "Something went wrong. Please try again.");
        capturePostHogEvent("newsletter_signup_failed", { source, status: res.status });
        return;
      }
      setStatus("success");
      capturePostHogEvent("newsletter_signup_succeeded", { source });
    } catch {
      setStatus("idle");
      setError("Network error. Please try again.");
      capturePostHogEvent("newsletter_signup_failed", { source, status: 0 });
    }
  };

  return { status, error, submit };
}
