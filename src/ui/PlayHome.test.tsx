import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import playHomeSrc from "./PlayHome.tsx?raw";
import bannerSrc from "./UpdateBanner.tsx?raw";
import { PlayHome } from "./PlayHome.tsx";

// The animated canvas loop needs a browser; the notice is what is under test.
vi.mock("./ThemeGateLoop.tsx", () => ({ ThemeGateLoop: () => null }));

const home = (demoSaved = 0) =>
  renderToStaticMarkup(
    <PlayHome
      calibrated
      tutorialDone={false}
      error={null}
      onStart={() => {}}
      onModes={() => {}}
      canvasWidth={360}
      canvasHeight={640}
      challengeScore={null}
      demoSaved={demoSaved}
      onProgress={() => {}}
    />,
  );

describe("PlayHome (brief 49)", () => {
  it("shows no what's-new update banner: the card's one use is the demo-rounds notice (brief 50)", () => {
    expect(playHomeSrc.match(/<UpdateBanner/g)).toHaveLength(1);
    expect(playHomeSrc).toContain('id="demo-rounds-saved"');
    expect(playHomeSrc).not.toContain("onOpenThemes");
    expect(bannerSrc).toContain("export");
    expect(home()).not.toContain("update-banner");
  });

  it("a new account's imported demo rounds: a pinned notice with a Progress link", () => {
    const out = home(3);
    expect(out).toContain("update-banner");
    expect(out).toContain("Your 3 demo rounds are saved.");
    expect(out).toContain("See Progress");
    expect(out.indexOf("update-banner")).toBeLessThan(out.indexOf("<h1"));
  });
});
