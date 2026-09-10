import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { capturePostHogEvent } from "../analytics/posthog.ts";
import { getAccount, type Account } from "../data/account.ts";
import { displayName } from "../data/leaderboard.ts";
import { useSessionVersion } from "../data/sessionVersion.ts";
import { useTier } from "../data/tier.ts";
import { loadDailyRuns } from "../game/dailyLimit.ts";
import { AccountCard } from "./AccountCard.tsx";
import { FREE_SUMMARY, GUEST_SUMMARY, PRO_PRICE, TIER_LABEL } from "./plan.ts";

interface Props {
  onEarlyBird: (feature: string) => void;
  /** Forwarded to `AccountCard`, called after sign-out resolves. */
  onSignedOut?: () => void;
}

/** Dev-only tier override toggle, gated the same way as `Lab`/`DevLogin` in
 * `GameApp.tsx` — lazy import behind `import.meta.env.DEV` plus a JSX gate at
 * the usage site, so Rollup drops this from `dist/`. See CLAUDE.md hard rule 7. */
const DevTierCard = import.meta.env.DEV
  ? lazy(() => import("../dev/AccountCard.tsx").then((m) => ({ default: m.DevTierCard })))
  : null;

/** The Profile tab: account/guest identity, the real daily free-run count, and the EarlyBird pitch. */
export function Profile({ onEarlyBird, onSignedOut }: Props) {
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

  const isPro = tier === "pro";
  const heroName = account?.status === "permanent" ? account.email : "Guest player";
  const planLabel = isPro ? "EarlyBird Pro" : tier === "free" ? "Free plan" : "Guest plan";

  return (
    <div className="screen profile-screen">
      <section className="progress-card profile-hero-card">
        <div className="profile-hero">
          {isPro && <span className="profile-hero-badge">★ PRO</span>}
          <p className="profile-hero-eyebrow">PROFILE</p>
          <div className="profile-hero-row">
            <span className={`profile-avatar${isPro ? " profile-avatar-pro" : ""}`} aria-hidden>
              <img src="/Bird-hor-halo.png" alt="" />
            </span>
            <div className="profile-hero-id">
              <p className="profile-hero-name">{heroName}</p>
              <div className="profile-hero-pills">
                {/* A guest has no leaderboard identity yet — only show the board
                    name once there's a real account behind it. */}
                {account?.status === "permanent" && (
                  <span className="profile-hero-pill">@{boardName}</span>
                )}
                <span className="profile-hero-plan">{planLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <AccountCard onSignedOut={onSignedOut} />

      {DevTierCard && (
        <Suspense fallback={null}>
          <DevTierCard />
        </Suspense>
      )}

      <section className="progress-card">
        <div className="progress-card-header">
          <h3>Daily runs</h3>
          <span className="badge badge-free">{TIER_LABEL[tier]}</span>
        </div>
        <p className="plan-usage">
          {daily.count} / {unlimited ? "∞" : daily.limit} today
        </p>
        <span className="teaser-bar plan-usage-bar">
          <span className="teaser-bar-fill" style={{ width: `${usedPct}%` }} />
        </span>
        <p className="note">
          {isPro ? "everything, current and future" : tier === "free" ? FREE_SUMMARY : GUEST_SUMMARY}
        </p>
      </section>

      {isPro ? (
        <section className="progress-card profile-celebration">
          <p className="profile-celebration-title">Thanks for being an EarlyBird 🎉</p>
          <p className="note">Everything's unlocked, current and future.</p>
        </section>
      ) : (
        <button
          type="button"
          className="profile-earlybird-sticker"
          onClick={() => {
            capturePostHogEvent("profile_earlybird_cta_click", {});
            onEarlyBird("plan_card");
          }}
        >
          <span className="profile-earlybird-copy">
            <span className="profile-earlybird-title">EarlyBird · {PRO_PRICE} once</span>
            <span className="note">Unlock everything, forever</span>
          </span>
          <span className="profile-earlybird-arrow" aria-hidden>
            →
          </span>
        </button>
      )}
    </div>
  );
}
