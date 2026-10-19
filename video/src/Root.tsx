import { Composition } from "remotion";
import { Thumbnail, type ThumbnailProps } from "./Thumbnail.tsx";
import { Story, storyFrames, type StoryProps } from "./Story.tsx";
import { CharacterSheet } from "./CharacterSheet.tsx";
import { TONY_STORY_FRAMES, TonyStory } from "./TonyStory.tsx";
import { FPS, Promo, SIZE, sections, type PromoProps } from "./Promo.tsx";

/** Studio's default props. A real promo passes its own: `--props=video/props/<name>.json`. */
const defaults: PromoProps = {
  format: "9:16",
  clip: "clips/example.mp4",
  clipSeconds: 28,
  hook: { text: "Your voice flies the bird", sub: "Learn Mandarin tones by singing them" },
  captions: [{ text: "Hear it…", from: 2.6, to: 4.2 }],
  endCard: { title: "FlappyTone", subtitle: "Play free in your browser", cta: "flappytone.com" },
};

export function Root() {
  return (
    <>
    <Composition id="TonyStory" component={TonyStory} fps={FPS} width={1080} height={1920} durationInFrames={TONY_STORY_FRAMES} defaultProps={{ captions: true, voices: true, sfx: true }} />
    <Composition id="CharacterSheet" component={CharacterSheet} fps={FPS} width={1080} height={1920} durationInFrames={90} />
    <Composition
      id="Thumbnail"
      component={Thumbnail}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={1}
      defaultProps={{ image: "clips/thumb-bg.png", title: "Fly with your voice", subtitle: "Learn Mandarin tones" } as ThumbnailProps}
    />
    <Composition
      id="Story"
      component={Story}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={300}
      defaultProps={{ scenes: [{ kind: "pip", seconds: 3 }] } as StoryProps}
      calculateMetadata={({ props }) => ({ durationInFrames: storyFrames(props) })}
    />
    <Composition
      id="Promo"
      component={Promo}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={300}
      defaultProps={defaults}
      calculateMetadata={({ props }) => ({
        durationInFrames: sections(props).total,
        ...SIZE[props.format],
      })}
    />
      </>
  );
}
