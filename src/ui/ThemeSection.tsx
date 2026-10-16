import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "../analytics/client.ts";
import { loadTheme, saveTheme } from "../game/settings.ts";
import {
  effectiveTheme,
  isThemeUnlocked,
  visibleThemes,
  type ThemeId,
  type ThemeInfo,
  type ThemeProgress,
} from "../game/themes.ts";
import type { Tier } from "../game/tiers.ts";
import { playerXp } from "../game/xp.ts";
import { ThemeGateLoop, themeSegments } from "./ThemeGateLoop.tsx";

const CARD_SIZE = { w: 200, h: 130 };
const MODAL_SIZE = { w: 320, h: 240 };

function xpNeeded(t: ThemeInfo): number {
  return t.unlock.kind === "xp" ? t.unlock.xp : 0;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function XpBar({ xp, need }: { xp: number; need: number }) {
  const pct = need === 0 ? 100 : Math.min(100, (xp / need) * 100);
  return (
    <div className="theme-xpbar" role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={Math.min(xp, need)}>
      <div className="theme-xpbar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function ThemeModal({
  info,
  progress,
  equipped,
  onEquip,
  onClose,
}: {
  info: ThemeInfo;
  progress: ThemeProgress;
  equipped: boolean;
  onEquip: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const segments = useMemo(() => themeSegments(info.id), [info.id]);
  const unlocked = isThemeUnlocked(info.id, progress);
  const need = xpNeeded(info);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal to <body>: `.frame` is a container-type element, so `position:
  // fixed` would anchor to it (same as JoinBoardModal).
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card theme-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id={titleId} className="theme-modal-title">{info.label}</h2>
        <div className={`theme-modal-stage${unlocked ? "" : " is-locked"}`}>
          <ThemeGateLoop segments={segments} size={MODAL_SIZE} className="theme-modal-canvas" />
        </div>
        <p className="theme-modal-blurb">{info.blurb}</p>
        {unlocked ? (
          <button type="button" className="primary theme-modal-cta" disabled={equipped} onClick={onEquip}>
            {equipped ? "Equipped ✓" : "Equip theme"}
          </button>
        ) : progress.tier === "guest" ? (
          <p className="theme-modal-locked">
            <LockIcon /> Create a free account to start earning XP and unlock this theme.
          </p>
        ) : (
          <div className="theme-modal-locked">
            <p>
              <LockIcon /> Unlocks at <strong>{need.toLocaleString()} XP</strong> —{" "}
              {(need - progress.xp).toLocaleString()} to go.
            </p>
            <XpBar xp={progress.xp} need={need} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Settings → Themes: a card per theme with a still preview, an XP pill, and a
 * modal with the theme's world flying. Guests get Paper only; accounts unlock
 * the rest with XP (placeholder numbers, game/themes.ts + game/xp.ts).
 */
export function ThemeSection({ tier, icon }: { tier: Tier; icon: React.ReactNode }) {
  const progress: ThemeProgress = { tier, xp: playerXp() };
  const [stored, setStored] = useState<ThemeId>(() => loadTheme());
  const [open, setOpen] = useState<ThemeId | null>(null);
  const themes = visibleThemes();
  const equipped = effectiveTheme(stored, progress);
  const unlockedCount = themes.filter((t) => isThemeUnlocked(t.id, progress)).length;
  const segmentsById = useMemo(
    () => Object.fromEntries(themes.map((t) => [t.id, themeSegments(t.id)])) as Record<ThemeId, ReturnType<typeof themeSegments>>,
    // visibleThemes() is a fresh array each render; its contents are static.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const openInfo = open ? themes.find((t) => t.id === open) : undefined;

  const equip = (id: ThemeId) => {
    setStored(id);
    saveTheme(id);
    track({ type: "setting_changed", key: "theme", value: id });
  };

  return (
    <section className="setting setting-card" id="setting-theme">
      <div className="setting-card-head">
        {icon}
        <h3>Themes</h3>
        <span className="theme-xp-pill" title="Your XP">
          ★ {tier === "guest" ? "—" : progress.xp.toLocaleString()} XP
        </span>
      </div>
      <p className="theme-collection-count">
        <strong>
          {unlockedCount}/{themes.length}
        </strong>{" "}
        worlds unlocked
        {tier === "guest" && " · create a free account to earn XP and unlock more"}
      </p>
      <div className="theme-grid">
        {themes.map((t) => {
          const unlocked = isThemeUnlocked(t.id, progress);
          const isOn = t.id === equipped;
          const need = xpNeeded(t);
          return (
            <button
              key={t.id}
              type="button"
              className={`theme-card${unlocked ? "" : " is-locked"}${isOn ? " is-equipped" : ""}`}
              onClick={() => setOpen(t.id)}
              aria-label={`${t.label}${isOn ? ", equipped" : unlocked ? ", unlocked" : ", locked"}. Preview`}
            >
              <span className="theme-card-art">
                <ThemeGateLoop segments={segmentsById[t.id]} size={CARD_SIZE} still className="theme-card-canvas" />
                {!unlocked && (
                  <span className="theme-card-lock">
                    <LockIcon />
                  </span>
                )}
                {isOn && <span className="theme-card-badge">Equipped</span>}
              </span>
              <span className="theme-card-name">{t.label}</span>
              <span className="theme-card-status">
                {unlocked
                  ? isOn
                    ? "In use"
                    : "Unlocked · tap to try"
                  : tier === "guest"
                    ? "Account only"
                    : `${need.toLocaleString()} XP`}
              </span>
              {!unlocked && tier !== "guest" && <XpBar xp={progress.xp} need={need} />}
            </button>
          );
        })}
      </div>
      <p className="param-help">Takes effect next run.</p>
      {openInfo && (
        <ThemeModal
          info={openInfo}
          progress={progress}
          equipped={openInfo.id === equipped}
          onEquip={() => equip(openInfo.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
