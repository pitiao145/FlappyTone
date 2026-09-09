import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { capturePostHogEvent } from "../analytics/posthog.ts";
import { getAccount, type Account } from "../data/account.ts";
import { displayName } from "../data/leaderboard.ts";
import { useSessionVersion } from "../data/sessionVersion.ts";
import { useTier } from "../data/tier.ts";
import { loadDailyRuns } from "../game/dailyLimit.ts";
import { AccountCard } from "./AccountCard.tsx";
import { FREE_SUMMARY, GUEST_SUMMARY, PRO_FEATURES, PRO_PRICE, TIER_LABEL } from "./plan.ts";

interface Props {
  onEarlyBird: (feature: string) => void;
}

/** Dev-only tier override toggle, gated the same way as `Lab`/`DevLogin` in
 * `GameApp.tsx` — lazy import behind `import.meta.env.DEV` plus a JSX gate at
 * the usage site, so Rollup drops this from `dist/`. See CLAUDE.md hard rule 7. */
const DevTierCard = import.meta.env.DEV
  ? lazy(() => import("../dev/AccountCard.tsx").then((m) => ({ default: m.DevTierCard })))
  : null;

/** The Profile tab: account/guest identity, the real daily free-run count, and the EarlyBird pitch. */
export function Profile({ onEarlyBird }: Props) {
  const tier = useTier();
  // `version` ticks after a sign-in/sign-out finishes syncing (or, for a
  // sign-out, right away) — see `sessionVersion.ts`. Without it these three
  // reads are captured once at mount and never revisited, which is why the
  // tab used to keep showing "Guest player" after a real sign-in.
  const version = useSessionVersion();
  const daily = useMemo(() => loadDailyRuns(), [version]);
  const boardName = useMemo(() => displayName(), [version]);
  const unlimited = !Number.isFinite(daily.limit);
  const usedPct = unlimited ? 0 : Math.min(100, (daily.count / daily.limit) * 100);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    let live = true;
    void getAccount().then((a) => {
      if (live) setAccount(a);
    });
    return () => {
      live = false;
    };
  }, [version]);

  return (
    <div className="screen profile-screen">
      <h2>Profile</h2>
      <p className="note">Your account & plan</p>

      {account?.status !== "permanent" && (
        <section className="progress-card profile-identity">
          <span className="profile-avatar" aria-hidden>
            P
          </span>
          <div>
            <p className="profile-name">Guest player</p>
            {/* The board name is generated, not chosen — showing it here is how
                a player recognises their own row on the leaderboard. */}
            <p className="note">On the board as {boardName}</p>
            <p className="note">Progress saved on this device only</p>
          </div>
        </section>
      )}

      <AccountCard />

      {DevTierCard && (
        <Suspense fallback={null}>
          <DevTierCard />
        </Suspense>
      )}

      <section className="progress-card">
        <div className="progress-card-header">
          <h3>Your plan</h3>
          <span className="badge badge-free">{TIER_LABEL[tier]}</span>
        </div>
        <p className="plan-usage">
          {daily.count} / {unlimited ? "∞" : daily.limit} runs used today
        </p>
        <span className="teaser-bar plan-usage-bar">
          <span className="teaser-bar-fill" style={{ width: `${usedPct}%` }} />
        </span>
        <p className="note">
          {tier === "pro"
            ? "Pro includes: everything, current and future."
            : tier === "free"
              ? `Free includes: ${FREE_SUMMARY}`
              : `Guest includes: ${GUEST_SUMMARY}`}
        </p>
      </section>

      {tier !== "pro" && (
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
      )}
    </div>
  );
}
