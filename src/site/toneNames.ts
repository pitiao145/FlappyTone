/** Public-copy names for the four tones: "first tone", not "Tone 1". */
const ORDINAL = ["", "first", "second", "third", "fourth"] as const;

export function toneName(tone: number, capital = false): string {
  const name = `${ORDINAL[tone] ?? tone} tone`;
  return capital ? name[0].toUpperCase() + name.slice(1) : name;
}
