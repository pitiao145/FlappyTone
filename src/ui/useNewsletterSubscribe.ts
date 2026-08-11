import { useState } from "react";

type Status = "idle" | "loading" | "success";

/** Shared submit logic for the two Kit signup forms (ComingSoon, Landing's #mobile). */
export function useNewsletterSubscribe() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (email: string) => {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
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
        return;
      }
      setStatus("success");
    } catch {
      setStatus("idle");
      setError("Network error. Please try again.");
    }
  };

  return { status, error, submit };
}
