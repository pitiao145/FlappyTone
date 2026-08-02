// Minimal RIFF/WAVE reader for 16-bit PCM (mono or first channel).
// Enough for fixtures and analysis; not a general-purpose decoder.
export interface WavData {
  sampleRate: number;
  samples: Float32Array;
}

export function decodeWav(bytes: Uint8Array): WavData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0x52494646 /* RIFF */) {
    throw new Error("Not a RIFF file");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 1;
  let bitsPerSample = 16;
  let samples: Float32Array | null = null;

  while (offset + 8 <= view.byteLength) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 0x666d7420 /* fmt  */) {
      const format = view.getUint16(body, true);
      if (format !== 1) throw new Error(`Unsupported WAV format ${format} (need PCM)`);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
      if (bitsPerSample !== 16) throw new Error(`Unsupported bit depth ${bitsPerSample}`);
    } else if (id === 0x64617461 /* data */) {
      const frameCount = Math.floor(size / 2 / channels);
      samples = new Float32Array(frameCount);
      for (let i = 0; i < frameCount; i++) {
        samples[i] = view.getInt16(body + i * channels * 2, true) / 32768;
      }
    }
    offset = body + size + (size % 2);
  }

  if (!sampleRate || !samples) throw new Error("Missing fmt or data chunk");
  return { sampleRate, samples };
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i);
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return bytes;
}
