import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "../analytics/client.ts";
import { getPlayTicket } from "../audio/clipToken.ts";
import { DEFAULT_SPEAKER_ID } from "../data/catalogRows.ts";
import { catalogFromCache, catalogFromFallback, fetchCatalog } from "../data/words.ts";
import { useTier } from "../data/tier.ts";
import { tierLimits, type Tier } from "../game/tiers.ts";
import { Toneder } from "../toneder/Toneder.tsx";
import { countSwipe, swipesLeft, swipesUsed } from "../toneder/dailySwipes.ts";
import { tierPool, usablePool } from "../toneder/pool.ts";
import type { TestStyle } from "../toneder/toneTest.ts";

interface Props {
  /** Guest at the cap: the free-account door. */
  onCreateAccount: () => void;
  /** Free at the cap, or a tap on the locked Spoken style: the Pro modal. */
  onUpgrade: (from: "cap" | "spoken") => void;
}

/**
 * The app's TONEder tab: the same swipe game as `/tools/tone-test`, with a
 * daily swipe cap per tier and Spoken for Pro. Standalone on purpose: no
 * stats, XP, streaks or DB writes, only analytics counts.
 */
export function TonederScreen({ onCreateAccount, onUpgrade }: Props) {
  const tier = useTier();
  const [used, setUsed] = useState(() => swipesUsed());
  const left = swipesLeft(tier, used);
  const pending = useRef<Record<TestStyle, number>>({ standard: 0, spoken: 0 });
  const tierRef = useRef<Tier>(tier);
  useEffect(() => {
    tierRef.current = tier;
  }, [tier]);
  const capSent = useRef(false);
  const [catalog, setCatalog] = useState(
    () => catalogFromCache(DEFAULT_SPEAKER_ID) ?? catalogFromFallback(),
  );

  // The live catalog (it knows which words have a Spoken take), and the
  // game's own clip ticket, so the Worker serves what this tier may play.
  useEffect(() => {
    let live = true;
    void fetchCatalog({ speaker: DEFAULT_SPEAKER_ID }).then((w) => {
      if (live) setCatalog(w);
    });
    void import("../site/wordAudio.ts").then((m) => m.setTicketProvider(getPlayTicket));
    return () => {
      live = false;
      void import("../site/wordAudio.ts").then((m) => m.setTicketProvider(null));
    };
  }, []);

  const pools = useMemo(() => {
    const standard = tierPool(catalog, tier, "standard", DEFAULT_SPEAKER_ID);
    const spoken = tierPool(catalog, tier, "spoken", DEFAULT_SPEAKER_ID);
    // The bundled fallback carries no Spoken data: use the guest words, all
    // of which have both takes.
    const guest = tierPool(catalog, "guest", "standard", DEFAULT_SPEAKER_ID);
    return { standard, spoken: usablePool(spoken) ? spoken : guest };
  }, [catalog, tier]);

  /** `toneder_swipe` is batched: one event per style per flush. */
  const flush = () => {
    for (const style of ["standard", "spoken"] as const) {
      const count = pending.current[style];
      if (!count) continue;
      pending.current[style] = 0;
      track({ type: "toneder_swipe", tier: tierRef.current, style, count });
    }
  };

  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, []);

  useEffect(() => {
    if (left > 0 || capSent.current) return;
    capSent.current = true;
    flush();
    track({ type: "toneder_cap_hit", tier });
  }, [left, tier]);

  const upgrade = (from: "cap" | "spoken") => {
    track({ type: "toneder_upgrade_click", tier, from });
    if (from === "cap" && tier === "guest") onCreateAccount();
    else onUpgrade(from);
  };

  const cap = tierLimits()[tier].tonederSwipesPerDay;
  const capScreen = (
    <div className="tt-card tt-cap">
      <p className="tt-card-title">That's your {cap} swipes for today.</p>
      <p className="tt-note">
        {tier === "guest"
          ? `New cards tomorrow. A free account gives you ${tierLimits().free.tonederSwipesPerDay} a day.`
          : "New cards tomorrow. Pro has no daily limit, and adds the Spoken recordings."}
      </p>
      <button type="button" className="sticker-button tt-start" onClick={() => upgrade("cap")}>
        {tier === "guest" ? "Create a free account" : "Go Pro"}
      </button>
    </div>
  );

  return (
    <div className="screen toneder-screen">
      <Toneder
        words={pools.standard}
        spokenWords={pools.spoken}
        sharePath="/tools/tone-test"
        swipesLeft={left}
        onSwipe={(_, style) => {
          pending.current[style] += 1;
          setUsed(countSwipe());
        }}
        onRoundDone={(result) => {
          flush();
          track({ type: "toneder_round_done", tier, correct: result.correct });
        }}
        capScreen={capScreen}
        spokenLocked={tier !== "pro"}
        onSpokenLocked={() => upgrade("spoken")}
      />
    </div>
  );
}
