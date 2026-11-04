// Word-level transcript of a voice track, for TalkingHead captions and cuts.
// node --experimental-strip-types video/transcribe.ts <whisperDir> <out.json> <in.wav>...
// Inputs: 16 kHz mono WAV. whisper.cpp + model are downloaded into <whisperDir> once.
import fs from 'node:fs'
import { downloadWhisperModel, installWhisperCpp, transcribe, toCaptions } from '@remotion/install-whisper-cpp'

const [whisperPath, outPath, ...inputs] = process.argv.slice(2)
const version = '1.5.5'
const model = 'medium.en'

await installWhisperCpp({ to: whisperPath, version })
await downloadWhisperModel({ model, folder: whisperPath })

const out: Record<string, unknown> = {}
for (const inputPath of inputs) {
  const whisperCppOutput = await transcribe({ model, whisperPath, whisperCppVersion: version, inputPath, tokenLevelTimestamps: true })
  out[inputPath] = toCaptions({ whisperCppOutput }).captions
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))
