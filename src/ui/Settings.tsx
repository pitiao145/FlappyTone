import { useEffect, useState } from "react";
import { MicError } from "../audio/mic.ts";
import { ensurePlaybackCtx } from "../audio/reference.ts";
import { ensureMic, MicCancelled } from "../audio/session.ts";
import { getAccount, signOut, type Account } from "../data/account.ts";
import { fireAuthToast } from "../data/authToast.ts";
import { micErrorCopy } from "./micErrors.ts";
import { setSharingEnabled, track } from "../analytics/client.ts";
import { CORRIDOR_WIDTHS, type CorridorWidth } from "../game/gates.ts";
import type { CueStyle } from "../game/run.ts";
import {
  clearSettings,
  loadCorridorWidth,
  loadCueStyle,
  loadSettings,
  loadShareData,
  loadShowTranslation,
  saveCorridorWidth,
  saveCueStyle,
  saveSettings,
  saveShareData,
  saveShowTranslation,
  type CalibrationSettings,
} from "../game/settings.ts";
import { resolveSpeaker, type Gender, type Speaker } from "../game/voice.ts";
import {
  adoptInventory,
  inventoryNow,
  inventorySpeaker,
  subscribeInventory,
} from "../audio/inventory.ts";
import { loadRoster } from "../data/speakers.ts";
import { fetchCatalog } from "../data/words.ts";
import { multiWords, type Word } from "../game/words.ts";
import { loadProficiency, saveProficiency } from "../game/settings.ts";
import type { Proficiency } from "../game/tiers.ts";
import { Choice } from "./Choice.tsx";
import { MicrophoneIcon } from "./toneIcons.tsx";
import { Switch } from "./Switch.tsx";

const SHARING = ["on", "off"] as const;

const VOICES = ["female", "male"] as const satisfies readonly Gender[];
/**
 * The switch is labelled by gender because that is what reads to a player, but
 * what it actually matches is **pitch range**. A low-voiced woman flying the
 * man's recordings is the correct outcome, not a mistake to correct: the
 * corridors she is asked to fly are then the ones her own voice reaches. The
 * guess is made from her measured centre, and this control exists for everyone
 * the guess suits badly.
 */
const VOICE_LABEL: Record<Gender, string> = {
  female: "Woman's voice",
  male: "Man's voice",
};

const PROFICIENCIES = ["beginner", "intermediate"] as const satisfies readonly Proficiency[];

const PROFICIENCY_LABEL: Record<Proficiency, string> = {
  beginner: "Beginner (single syllables only)",
  intermediate: "Intermediate (all words)",
};

const WIDTH_HELP: Record<CorridorWidth, string> = {
  narrow: "Demanding. Your pitch has to sit close to the line.",
  normal: "Moderate difficulty. Good for practice.",
  wide: "Forgiving on pitch. Good while a tone is still new.",
};

function SettingIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="setting-icon" aria-hidden>
      {children}
    </span>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 19V5M4 19h16M8 17V11M12 17V7M16 17v-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M4 17h16M9 4v6M15 14v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LevelIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 20v-5M11 20V10M18 20V4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 5.5A2.5 2.5 0 0 1 7.5 3H18v18H7.5A2.5 2.5 0 0 0 5 18.5V5.5ZM5 18.5A2.5 2.5 0 0 1 7.5 21H18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Props {
  /** The saved calibration, or null if the player has never calibrated. */
  settings: CalibrationSettings | null;
  
  /** Called after the calibration is recalibrated, so the router can re-check it. */
  onRecalibrate: () => void;
  /** Opens the live preview + sensitivity slider, seeded from `settings`. */
  onFineTune: () => void;
  /** Called after the calibration is deleted, so the router can re-check it. */
  onForget: () => void;
  /** Opens the mic and starts a tutorial run — same gate as the Play tab's own button. */
  onTutorial: () => void;
  onHowTo: () => void;
  /** Called after sign-out resolves, so the router can land on Play home. */
  onSignedOut?: () => void;
}

/**
 * The settings screen: who you are, and nothing else.
 *
 * It used to carry speed, tunnel width, demo style, motion and a link to the
 * visualiser as well. Difficulty knobs now live in the in-game pause menu,
 * where you find out you want them; the visualiser has its own section on the
 * landing page; and motion follows the OS `prefers-reduced-motion` setting
 * rather than asking a second time in different words.
 *
 * What is left is calibration — the one setting that is about the player rather
 * than the game, and the only place the numbers behind it are shown.
 */
export function Settings({
  settings,
  onRecalibrate,
  onFineTune,
  onForget,
  onTutorial,
  onHowTo,
  onSignedOut,
}: Props) {
  const [confirmForget, setConfirmForget] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Seeded from the store, saved on change — the pause menu's own convention.
  const [sharing, setSharing] = useState<(typeof SHARING)[number]>(() =>
    loadShareData() ? "on" : "off",
  );
  const [account, setAccount] = useState<Account | null>(null);
  /**
   * The roster, for deciding whether the switch is worth showing at all. Null
   * while it is still being read — the control renders nothing until then, and
   * nothing at all while fewer than two speakers are active, because with one
   * voice there is nothing to switch to.
   */
  const [roster, setRoster] = useState<Speaker[] | null>(null);
  /**
   * The player's *stored* preference, and only that — `?? null`, the same read
   * the app-load resolver makes, never a guess.
   *
   * Seeding this from `guessGender(settings.f0Center)` was wrong and shipped
   * briefly: a legacy player with no stored preference would fly the default
   * speaker at app load and then silently swap to the guessed one mid-session
   * the first time they merely opened this screen, with nothing persisted.
   * Opening a settings screen must not change which voice you are flying.
   *
   * Persisting the guess here was the other option and is worse: a guess is not
   * an explicit choice, and writing one would make it permanent under the rule
   * that an explicit choice is never re-guessed. Calibration is where the guess
   * belongs, because that is where the measurement it is made from happens.
   */
  const [voice, setVoice] = useState<Gender | null>(settings?.voice?.gender ?? null);
  /**
   * The current inventory, only to decide whether the word-mix choice is
   * worth showing — same "nothing to switch to" gate as the voice switch.
   * Read from the live inventory module (`inventoryNow`/`subscribeInventory`)
   * rather than fetched here, since a catalog fetch is already in flight
   * elsewhere by the time a player reaches Settings.
   */
  const [words, setWords] = useState<Word[] | null>(() => inventoryNow());
  const [proficiency, setProficiency] = useState<Proficiency>(() => loadProficiency());
  const [width, setWidth] = useState<CorridorWidth>(loadCorridorWidth);
  // "off" is disabled below (broken), so a previously-persisted "off" is
  // coerced back to "pause" rather than silently staying selected.
  const [cueStyle, setCueStyle] = useState<CueStyle>(() => {
    const loaded = loadCueStyle();
    return loaded === "off" ? "pause" : loaded;
  });
  const [translation, setTranslation] = useState<boolean>(loadShowTranslation);

  useEffect(() => subscribeInventory(setWords), []);

  useEffect(() => {
    let live = true;
    void getAccount().then((a) => {
      if (live) setAccount(a);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    void loadRoster().then((r) => {
      if (live) setRoster(r);
    });
    return () => {
      live = false;
    };
  }, []);

  /**
   * Fetch the chosen voice's catalog, in its own effect.
   *
   * Deliberately separate from the click handler, and deliberately routed
   * through `adoptInventory` rather than anything that rebuilds a run: a run
   * can still be alive behind this screen, and it picks the new pool up
   * through `Run.setWords` — the seam the late-tier answer already uses.
   * Gates already spawned keep the word and corridor they were built with;
   * nothing is torn down.
   */
  useEffect(() => {
    if (!roster || !voice) return;
    // `voice` is null until the player taps, so a screen visit alone adopts
    // nothing.
    const id = resolveSpeaker(roster, { gender: voice })?.id;
    if (!id || id === inventorySpeaker()) return;
    let live = true;
    void fetchCatalog({ speaker: id }).then((words) => {
      // A switch that landed after the player moved on is still the right
      // catalog for the preference they saved, but another effect may have
      // adopted since — so re-check rather than clobber.
      if (live && id !== inventorySpeaker()) adoptInventory(id, words);
    });
    return () => {
      live = false;
    };
  }, [roster, voice]);

  /**
   * What the control shows: the stored preference when there is one, otherwise
   * the gender of the speaker the player is *actually* flying right now. Never
   * a guess — the control reports the current state, and only a tap changes it.
   */
  const flying: Gender | null =
    voice ??
    (roster ? (resolveSpeaker(roster, null)?.gender ?? null) : null);

  // Both of these lead to screens that listen. iOS Safari grants getUserMedia
  // only inside the gesture, so the mic opens here rather than in the
  // destination screen's mount effect.
  const goListening = (then: () => void) => async () => {
    setBusy(true);
    setError(null);
    try {
      void ensurePlaybackCtx(); // resume cue-playback ctx in-gesture (reference.ts)
      await ensureMic();
      then();
    } catch (err) {
      if (!(err instanceof MicCancelled)) {
        setError(micErrorCopy(err instanceof MicError ? err.kind : "unknown"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen settings-screen">
      <h2>Settings</h2>

      <section className="setting setting-card">
        <div className="setting-card-head">
          <SettingIcon>
            <MicrophoneIcon />
          </SettingIcon>
          <h3>Your voice (calibration)</h3>
        </div>
        {settings ? (
          <div className="setting-callout">
            Centred on <strong>{Math.round(settings.f0Center)} Hz</strong>, your
            speaking pitch, which sits on line 3. Reaching{" "}
            <strong>{settings.rangeSemitones.toFixed(1)} semitones</strong> above it
            gets you to line 5, and{" "}
            <strong>{settings.rangeDownSemitones.toFixed(1)} semitones</strong> below
            it to line 1.
          </div>
        ) : (
          <div className="setting-callout setting-callout-empty">
            Not calibrated yet. The game maps your voice through someone
            else&rsquo;s range until you do.
          </div>
        )}
        <div className="setting-actions setting-actions-row">
          <button
            disabled={busy}
            onClick={() => void goListening(onRecalibrate)()}
          >
            {settings ? "Re-calibrate" : "Calibrate"}
          </button>
          {settings && (
            <button disabled={busy} onClick={() => void goListening(onFineTune)()}>
              Fine-tune
            </button>
          )}
          {settings &&
            (confirmForget ? (
              <button
                className="danger"
                onClick={() => {
                  clearSettings();
                  setConfirmForget(false);
                  onForget();
                }}
              >
                Really forget it?
              </button>
            ) : (
              <button onClick={() => setConfirmForget(true)}>
                Forget my calibration
              </button>
            ))}
        </div>
        {settings && flying && (roster?.filter((s) => s.active).length ?? 0) > 1 && (
          <>
            <Choice
              options={VOICES}
              value={flying}
              label={(v) => VOICE_LABEL[v]}
              onChange={(v) => {
                setVoice(v);
                // Read back rather than spreading the `settings` prop, which is
                // not refreshed after a save — spreading it would resurrect the
                // rest of a stale record alongside the new preference.
                saveSettings({ ...(loadSettings() ?? settings), voice: { gender: v } });
                track({ type: "setting_changed", key: "voice", value: v });
              }}
            />
            <p className="param-help">
              Which recording you hear, and whose corridors you fly. This is
              about pitch range, not about you: pick whichever sits closer to
              your own voice.
            </p>
          </>
        )}
        <p className="param-help">
          Re-calibrate if you've changed microphone or room. Fine-tune opens the
          live dot and a sensitivity slider, if the board feels too big or too
          small for your voice.
        </p>
      </section>



      {settings && multiWords(words ?? []).length > 0 && (
        <section className="setting setting-card">
          <div className="setting-card-head">
            <SettingIcon>
              <LevelIcon />
            </SettingIcon>
            <h3>Proficiency</h3>
          </div>
          <Choice
            options={PROFICIENCIES}
            value={proficiency}
            label={(v) => PROFICIENCY_LABEL[v]}
            onChange={(v) => {
              setProficiency(v);
              // Also writes wordMix (run.ts's single/multi draw) — see
              // saveProficiency's own comment for why that's bundled in.
              saveProficiency(v);
              track({ type: "setting_changed", key: "proficiency", value: v });
            }}
          />
          <p className="param-help">
            Beginner is single syllables only, applies to each game mode.
            Intermediate adds two-syllable tone pairs into the same run.
          </p>
        </section>
      )}

      <section className="setting setting-card">
        <div className="setting-card-head">
          <SettingIcon>
            <SlidersIcon />
          </SettingIcon>
          <h3>Playing</h3>
        </div>
        <section>
          <h4>Tunnel width</h4>
          <Choice
            options={CORRIDOR_WIDTHS}
            value={width}
            onChange={(w) => {
              setWidth(w);
              saveCorridorWidth(w);
              track({ type: "setting_changed", key: "tunnel_width", value: w });
            }}
          />
          <p className="param-help">
            {WIDTH_HELP[width]} Takes effect next run.
          </p>
        </section>

        <section>
          <Switch
            checked={translation}
            onChange={(show) => {
              setTranslation(show);
              saveShowTranslation(show);
              track({ type: "setting_changed", key: "translation", value: show ? "on" : "off" });
            }}
            label="Translation"
            sublabel="English meaning above the pinyin"
          />
        </section>

        <section>
          <Switch
            checked={cueStyle === "pause"}
            disabled
            onChange={(on) => {
              if (!on) return;
              const style: CueStyle = "pause";
              setCueStyle(style);
              saveCueStyle(style);
            }}
            label="Listen-first example"
            sublabel="Native speaker says it, then your turn"
          />
          <p className="param-help">
            Turning it off is coming in a future update.
          </p>
        </section>

      </section>

      <section className="setting setting-card">
        <div className="setting-card-head">
          <SettingIcon>
            <BookIcon />
          </SettingIcon>
          <h3>Learn</h3>
        </div>
        <div className="setting-actions">
          <button disabled={busy} onClick={() => void goListening(onTutorial)()}>
            Tutorial
          </button>
          <button disabled={busy} onClick={onHowTo}>
            How to play
          </button>
        </div>
      </section>

      <section className="setting setting-card">
        <div className="setting-card-head">
          <SettingIcon>
            <ChartIcon />
          </SettingIcon>
          <h3>Anonymous game data</h3>
        </div>
        <Choice
          options={SHARING}
          value={sharing}
          onChange={(v) => {
            setSharing(v);
            saveShareData(v === "on");
            // Applied now, not next run: turning this off stops gameplay
            // events immediately rather than after one more game.
            setSharingEnabled(v === "on");
            // A meta-setting change, tracked unconditionally regardless of the
            // new value — this describes using Settings, not gameplay, so it
            // is global tier (see session.ts's eventTier).
            track({ type: "setting_changed", key: "sharing", value: v });
          }}
        />
        <p className="param-help">
          {sharing === "on"
            ? "Sends what happens during a run: which gates you hit or miss, your calibration numbers, and your Tone Visualiser practice, so the game can be tuned against real attempts. No audio, no recordings, no precise location (country only), and nothing that identifies you."
            : "Run and calibration data stops being sent. Anonymous usage data not tied to a specific run, like which screens you visit or what's tapped, still helps track how the app is used overall."}
        </p>
      </section>

      {account?.status === "permanent" && (
        <section className="setting setting-card">
          <div className="setting-card-head">
            <h3>Account</h3>
          </div>
          <p className="param-help">Signed in as {account.email}</p>
          <div className="setting-actions">
            <button
              onClick={() => {
                void signOut().then(() => {
                  fireAuthToast("signed-out");
                  onSignedOut?.();
                });
              }}
            >
              Sign out
            </button>
          </div>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      
    </div>
  );
}
