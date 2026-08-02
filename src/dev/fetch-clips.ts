// CLI: npm run fetch-clips
// Downloads the dev soundboard clip library from audio-cmn (CC-BY-SA) into
// public/clips/<speaker>/<syllable><tone>.mp3 and writes manifest.json.
// Two speakers: chen (Chen Wang, male, syllabs set, numbered pinyin) and
// tan (Yue Tan, female, HSK set, hanzi filenames — only combos with a common
// single character exist; 404s are skipped and simply absent from the board).
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://raw.githubusercontent.com/hugolpz/audio-cmn/master/64k";
const OUT = "public/clips";

// PRD §9 v1 syllable set
const SYLLABLES = ["ma", "ba", "yi", "wu", "shu", "li", "hao", "tang"];

// syllable+tone → common single character read with exactly that tone
const TAN_HANZI: Record<string, string> = {
  ma1: "妈", ma2: "麻", ma3: "马", ma4: "骂",
  ba1: "八", ba2: "拔", ba3: "把", ba4: "爸",
  yi1: "一", yi2: "疑", yi3: "已", yi4: "意",
  wu1: "屋", wu2: "无", wu3: "五", wu4: "物",
  shu1: "书", shu2: "熟", shu3: "数", shu4: "树",
  li1: "", li2: "离", li3: "里", li4: "力",
  hao1: "", hao2: "毫", hao3: "好", hao4: "号",
  tang1: "汤", tang2: "糖", tang3: "躺", tang4: "烫",
};

interface ManifestEntry {
  id: string;
  speaker: string;
  syllable: string;
  tone: number;
  file: string;
}

async function fetchClip(url: string, dest: string): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok) return false;
  writeFileSync(dest, new Uint8Array(await res.arrayBuffer()));
  return true;
}

const manifest: ManifestEntry[] = [];
for (const speaker of ["chen", "tan"]) mkdirSync(join(OUT, speaker), { recursive: true });

for (const syllable of SYLLABLES) {
  for (let tone = 1; tone <= 4; tone++) {
    const id = `${syllable}${tone}`;

    const chenDest = join(OUT, "chen", `${id}.mp3`);
    if (existsSync(chenDest) || (await fetchClip(`${BASE}/syllabs/cmn-${id}.mp3`, chenDest))) {
      manifest.push({ id: `chen_${id}`, speaker: "chen", syllable, tone, file: `chen/${id}.mp3` });
      console.log(`chen ${id} ok`);
    } else {
      console.log(`chen ${id} missing`);
    }

    const hanzi = TAN_HANZI[id];
    if (hanzi) {
      const tanDest = join(OUT, "tan", `${id}.mp3`);
      const url = `${BASE}/hsk/${encodeURIComponent(`cmn-${hanzi}.mp3`)}`;
      if (existsSync(tanDest) || (await fetchClip(url, tanDest))) {
        manifest.push({ id: `tan_${id}`, speaker: "tan", syllable, tone, file: `tan/${id}.mp3` });
        console.log(`tan  ${id} (${hanzi}) ok`);
      } else {
        console.log(`tan  ${id} (${hanzi}) missing`);
      }
    }
  }
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
writeFileSync(
  join(OUT, "README.md"),
  `# Dev soundboard clips

Source: https://github.com/hugolpz/audio-cmn (CC-BY-SA).
Speakers: chen = Chen Wang (syllabs set), tan = Yue Tan (HSK set, shtooka cmn-caen-tan).
Fetched by \`npm run fetch-clips\`; dev/testing use only.
`,
);
console.log(`\nmanifest: ${manifest.length} clips`);
