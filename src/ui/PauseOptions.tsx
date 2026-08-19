import { useState } from "react";
import { CORRIDOR_WIDTHS, type CorridorWidth } from "../game/gates.ts";
import type { CueStyle } from "../game/run.ts";
import {
  loadCorridorWidth,
  loadCueStyle,
  loadShowTranslation,
  saveCorridorWidth,
  saveCueStyle,
  saveShowTranslation,
} from "../game/settings.ts";
import { Choice } from "./Choice.tsx";

const WIDTH_HELP: Record<CorridorWidth, string> = {
  narrow: "Demanding. Your pitch has to sit close to the line.",
  normal: "Moderate difficulty. Good for practice.",
  wide: "Forgiving on pitch. Good while a tone is still new.",
};

interface Props {
  /**
   * Applies the demo choice to the run in flight. Width has no live
   * equivalent — it would move the world under a gate already being flown —
   * so it is saved and picked up by the next run.
   */
  onCueStyle?: (style: CueStyle) => void;
  /**
   * Applies the translation choice to the run in flight. This one *is* live:
   * it is a line of HUD text, not geometry, so there is nothing to move under
   * a gate — and the moment you want it is the word you are looking at.
   */
  onShowTranslation?: (show: boolean) => void;
}

/**
 * The three game options, inside the pause menu.
 *
 * They used to live on the settings screen, two navigations away from the game.
 * Nobody discovers they want a wider tunnel while reading a settings list; they
 * discover it on the gate they just clipped. Every change is written to
 * localStorage as it is made, so it also becomes the default for future runs.
 */
export function PauseOptions({ onCueStyle, onShowTranslation }: Props) {
  const [width, setWidth] = useState<CorridorWidth>(loadCorridorWidth);
  // "off" is disabled below (broken), so a previously-persisted "off" is
  // coerced back to "pause" rather than silently staying selected.
  const [cueStyle, setCueStyle] = useState<CueStyle>(() => {
    const loaded = loadCueStyle();
    return loaded === "off" ? "pause" : loaded;
  });
  const [translation, setTranslation] = useState<boolean>(loadShowTranslation);

  return (
    <div className="pause-options">
      <section>
        <h4>Tunnel width</h4>
        <Choice
          options={CORRIDOR_WIDTHS}
          value={width}
          onChange={(w) => {
            setWidth(w);
            saveCorridorWidth(w);
          }}
        />
        <p className="param-help">{WIDTH_HELP[width]} Takes effect next run.</p>
      </section>

      <section>
        <h4>Translation</h4>
        <Choice
          options={["on", "off"] as const}
          value={translation ? "on" : "off"}
          onChange={(v) => {
            const show = v === "on";
            setTranslation(show);
            saveShowTranslation(show);
            onShowTranslation?.(show);
          }}
        />
        <p className="param-help">
          {translation
            ? "The English meaning sits above the pinyin."
            : "Hanzi and pinyin only."}
        </p>
      </section>

      <section>
        <h4>Example</h4>
        <Choice
          options={["pause", "off"] as CueStyle[]}
          value={cueStyle}
          label={(s) => (s === "pause" ? "on" : "off")}
          disabled={(s) => s === "off"}
          onChange={(s) => {
            setCueStyle(s);
            saveCueStyle(s);
            onCueStyle?.(s);
          }}
        />
        <p className="param-help">
          The world stops while a native speaker says the syllable, then
          it's your turn. Turning it off is coming in a future update.
        </p>
      </section>
    </div>
  );
}
