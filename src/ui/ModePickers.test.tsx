import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DrillTonePicker, PairComboPicker } from "./ModePickers.tsx";

describe("ModePickers (shared by ModeSelect and the landing demo)", () => {
  it("drill: four tone options, missing tones disabled, with counts", () => {
    const out = renderToStaticMarkup(
      <DrillTonePicker tones={[1, 3]} count={(t) => t * 2} onPick={() => {}} />,
    );
    expect(out.match(/class="choice-option"/g)).toHaveLength(4);
    expect(out.match(/disabled=""/g)).toHaveLength(2);
    expect(out).toContain('aria-label="(6 words)"');
    expect(out).not.toContain("← Back");
  });

  it("pairs: one tile per combo plus Shuffle; Back only when given", () => {
    const out = renderToStaticMarkup(
      <PairComboPicker combos={[[3, 2], [1, 4]]} count={() => 1} onPick={() => {}} onBack={() => {}} />,
    );
    expect(out.match(/class="pair-combo-tile"/g)).toHaveLength(2);
    expect(out).toContain("Shuffle");
    expect(out).toContain('aria-label="(1 word)"');
    expect(out).toContain("← Back");
  });
});
