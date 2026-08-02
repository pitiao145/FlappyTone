// Plays synthetic reference tones through the speakers so the player can
// hear a contour before imitating it. Own AudioContext, created lazily on
// first play (button click = user gesture, satisfies iOS).
import { CONTOURS, IDEAL, synthTone } from "../dev/tone-synth.ts";

let ctx: AudioContext | null = null;

export type ToneName = keyof typeof CONTOURS;

export async function playReferenceTone(
  tone: ToneName,
  f0Center: number,
): Promise<void> {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();

  const { samples } = synthTone(CONTOURS[tone], {
    ...IDEAL,
    sampleRate: ctx.sampleRate,
    f0Center,
    gapMs: 50,
  });
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
}
