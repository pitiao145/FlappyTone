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
import { levelFor, levelThreshold, playerXp, type LevelInfo } from "../game/xp.ts";
import { ThemeGateLoop, themeSegments } from "./ThemeGateLoop.tsx";

const CARD_SIZE = { w: 200, h: 130 };
const MODAL_SIZE = { w: 320, h: 240 };

/** Why a locked theme is locked, for this player. */
function lockReason(t: ThemeInfo, progress: ThemeProgress): "guest" | "pro" | "level" | null {
  if (isThemeUnlocked(t.id, progress)) return null;
  if (t.unlock.kind === "pro" && progress.tier !== "pro") return "pro";
  if (progress.tier === "guest") return "guest";
  return "level";
}

function ProBadge() {
  return <span className="theme-pro-badge">★ Pro</span>;
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
  xp,
  equipped,
  onEquip,
  onClose,
}: {
  info: ThemeInfo;
  progress: ThemeProgress;
  xp: number;
  equipped: boolean;
  onEquip: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const segments = useMemo(() => themeSegments(info.id), [info.id]);
  const unlocked = isThemeUnlocked(info.id, progress);
  const reason = lockReason(info, progress);
  const needLevel = "level" in info.unlock ? info.unlock.level : 0;

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
        <h2 id={titleId} className="theme-modal-title">
          {info.label} {info.unlock.kind === "pro" && <ProBadge />}
        </h2>
        <div className={`theme-modal-stage${unlocked ? "" : " is-locked"}`}>
          <ThemeGateLoop segments={segments} size={MODAL_SIZE} className="theme-modal-canvas" />
        </div>
        <p className="theme-modal-blurb">{info.blurb}</p>
        {unlocked ? (
          <button type="button" className="primary theme-modal-cta" disabled={equipped} onClick={onEquip}>
            {equipped ? "Equipped ✓" : "Equip theme"}
          </button>
        ) : reason === "pro" ? (
          <p className="theme-modal-locked">
            <LockIcon /> Pro only. With Pro, it unlocks at <strong>Level {needLevel}</strong>.
          </p>
        ) : reason === "guest" ? (
          <p className="theme-modal-locked">
            <LockIcon /> Create a free account to start earning XP and unlock this theme.
          </p>
        ) : (
          <div className="theme-modal-locked">
            <p>
              <LockIcon /> Unlocks at <strong>Level {needLevel}</strong> —{" "}
              {(levelThreshold(needLevel) - xp).toLocaleString()} XP to go.
            </p>
            <XpBar xp={xp} need={levelThreshold(needLevel)} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Settings → Themes: a card per theme with a still preview, the player's
 * level, and a modal with the theme's world flying. Guests get Paper only;
 * accounts unlock by level; Pro-only themes are badged so free players see
 * they need Pro (game/themes.ts, game/xp.ts).
 */
export function ThemeSection({ tier, icon }: { tier: Tier; icon: React.ReactNode }) {
  const lvl: LevelInfo = levelFor(playerXp());
  const progress: ThemeProgress = { tier, level: lvl.level };
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
        <span className="theme-xp-pill" title={`${lvl.xp.toLocaleString()} XP`}>
          Lv {lvl.level}
        </span>
      </div>
      <p className="theme-collection-count">
        <strong>
          {unlockedCount}/{themes.length}
        </strong>{" "}
        worlds unlocked
        {tier === "guest" && " · create a free account to keep your XP and unlock more"}
      </p>
      <div className="theme-grid">
        {themes.map((t) => {
          const unlocked = isThemeUnlocked(t.id, progress);
          const isOn = t.id === equipped;
          const reason = lockReason(t, progress);
          const needLevel = "level" in t.unlock ? t.unlock.level : 0;
          return (
            <button
              key={t.id}
              type="button"
              className={`theme-card${unlocked ? "" : " is-locked"}${isOn ? " is-equipped" : ""}${t.unlock.kind === "pro" ? " is-pro" : ""}`}
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
                {t.unlock.kind === "pro" && (
                  <span className="theme-card-pro">
                    <ProBadge />
                  </span>
                )}
              </span>
              <span className="theme-card-name">{t.label}</span>
              <span className="theme-card-status">
                {unlocked
                  ? isOn
                    ? "In use"
                    : "Unlocked · tap to try"
                  : reason === "pro"
                    ? `Pro · Level ${needLevel}`
                    : reason === "guest"
                      ? "Free account"
                      : `Level ${needLevel}`}
              </span>
              {reason === "level" && <XpBar xp={lvl.xp} need={levelThreshold(needLevel)} />}
            </button>
          );
        })}
      </div>
      <p className="param-help">Takes effect next run.</p>
      {openInfo && (
        <ThemeModal
          info={openInfo}
          progress={progress}
          xp={lvl.xp}
          equipped={openInfo.id === equipped}
          onEquip={() => equip(openInfo.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
