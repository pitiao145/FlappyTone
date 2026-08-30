import { useMemo } from "react";
import { DAILY_RUN_LIMIT, loadDailyRuns } from "../game/dailyLimit.ts";

interface Props {
  onEarlyBird: (feature: string) => void;
}

const EARLYBIRD_FEATURES: { label: string; feature: string }[] = [
  { label: "Full run history & trends", feature: "run_history" },
  { label: "Tone shape vs. native target", feature: "tone_shape" },
  { label: "More words & tone pairs", feature: "more_words" },
  { label: "Levels, XP, streaks & leaderboard", feature: "level" },
];

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
        <p className="note">Free includes: {DAILY_RUN_LIMIT} runs/day · visualiser basics · accuracy per tone</p>
      </section>

      <section className="earlybird-card">
        <p className="modal-eyebrow">★ EarlyBird access</p>
        <p className="earlybird-price">
          $19 <span className="modal-price-note">once · yours for life</span>
        </p>
        <ul className="earlybird-features">
          <li className="earlybird-feature-live">✓ Unlimited runs & every word</li>
          <li className="earlybird-feature-live">✓ Progress saved & synced across devices</li>
          {EARLYBIRD_FEATURES.map((f) => (
            <li key={f.feature}>
              🔒 {f.label}
              <span className="badge badge-soon">Soon</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="primary earlybird-cta"
          onClick={() => onEarlyBird("plan_card")}
        >
          🔒 Get EarlyBird access · $19
        </button>
        <p className="note earlybird-note">
          Still early — core is live, more ships weekly. Full refund anytime.
        </p>
        <button
          type="button"
          className="link earlybird-notify"
          onClick={() => onEarlyBird("plan_card")}
        >
          Not ready? Get notified at the EarlyBird price →
        </button>
      </section>
    </div>
  );
}
