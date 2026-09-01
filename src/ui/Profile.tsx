import { useMemo } from "react";
import { capturePostHogEvent } from "../analytics/posthog.ts";
import { DAILY_RUN_LIMIT, loadDailyRuns } from "../game/dailyLimit.ts";
import { FREE_SUMMARY, PRO_FEATURES, PRO_PRICE } from "./plan.ts";

interface Props {
  onEarlyBird: (feature: string) => void;
}

/** The Profile tab: guest identity, the real daily free-run count, and the EarlyBird pitch. */
export function Profile({ onEarlyBird }: Props) {
  const daily = useMemo(() => loadDailyRuns(), []);
  const usedPct = Math.min(100, (daily.count / DAILY_RUN_LIMIT) * 100);

  return (
    <div className="screen profile-screen">
      <h2>Profile</h2>
      <p className="note">Your account & plan</p>

      <section className="progress-card profile-identity">
        <span className="profile-avatar" aria-hidden>
          P
        </span>
        <div>
          <p className="profile-name">Guest player</p>
          <p className="note">Progress saved on this device only</p>
        </div>
      </section>

      <section className="progress-card">
        <div className="progress-card-header">
          <h3>Your plan</h3>
          <span className="badge badge-free">Free</span>
        </div>
        <p className="plan-usage">
          {daily.count} / {DAILY_RUN_LIMIT} runs used today
        </p>
        <span className="teaser-bar plan-usage-bar">
          <span className="teaser-bar-fill" style={{ width: `${usedPct}%` }} />
        </span>
        <p className="note">Free includes: {FREE_SUMMARY}</p>
      </section>

      <section className="earlybird-card">
        <p className="modal-eyebrow">★ Support the app with EarlyBird access</p>
        <p className="earlybird-price">
          {PRO_PRICE} <span className="modal-price-note">once · yours for life</span>
        </p>
        <ul className="earlybird-features">
          {PRO_FEATURES.map((label) => (
            <li key={label} className="earlybird-feature-live">
              ✓ {label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="primary earlybird-cta"
          onClick={() => {
            capturePostHogEvent("profile_earlybird_cta_click", {});
            onEarlyBird("plan_card");
          }}
        >
          🔒 Get EarlyBird access · {PRO_PRICE}
        </button>
        <p className="note earlybird-note">
          Still early. Core is live, more features ship weekly.
        </p>
        <button
          type="button"
          className="link earlybird-notify"
          onClick={() => {
            capturePostHogEvent("profile_earlybird_notify_click", {});
            onEarlyBird("plan_card");
          }}
        >
          Not ready? Get notified at the EarlyBird price →
        </button>
      </section>
    </div>
  );
}
