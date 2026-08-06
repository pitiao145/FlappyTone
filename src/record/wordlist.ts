/**
 * What Jane is asked to say, in order.
 *
 * `id` is the filename stem all the way through: the blob key, the cut clip in
 * `public/ref/`, and the manifest entry the game looks a cue up by. Keep it
 * ASCII and unique — `wordlist.test.ts` enforces both, because a duplicate id
 * would silently overwrite a finished recording rather than fail.
 *
 * Ordering is the order she records in. Group by syllable rather than by tone:
 * saying mā má mǎ mà in a row is a drill she already knows, and the four takes
 * come out of one setting of her voice.
 */

export type Tone = 1 | 2 | 3 | 4;

export interface WordItem {
  /** Filename stem — lowercase letters and digits only. */
  id: string;
  hanzi: string;
  /** With the tone mark, as she should read it. */
  pinyin: string;
  tone: Tone;
}

/**
 * Placeholder list: the four syllables the game already ships, so the booth is
 * testable end to end before the real list exists. Replace wholesale.
 */
export const WORDS: WordItem[] = [
  { id: "ma1b", hanzi: "媽", pinyin: "mā", tone: 1 },
  { id: "ba1", hanzi: "八", pinyin: "bā", tone: 1 },
  { id: "san1", hanzi: "三", pinyin: "sān", tone: 1 },
  { id: "qi1", hanzi: "七", pinyin: "qī", tone: 1 },
  { id: "tian1", hanzi: "天", pinyin: "tiān", tone: 1 },
  { id: "hua1", hanzi: "花", pinyin: "huā", tone: 1 },
  { id: "shu1", hanzi: "書", pinyin: "shū", tone: 1 },
  { id: "dong1", hanzi: "東", pinyin: "dōng", tone: 1 },
  { id: "jia1", hanzi: "家", pinyin: "jiā", tone: 1 },
  { id: "che1", hanzi: "車", pinyin: "chē", tone: 1 },
  { id: "shuo1", hanzi: "說", pinyin: "shuō", tone: 1 },
  { id: "chi1", hanzi: "吃", pinyin: "chī", tone: 1 },
  { id: "he1", hanzi: "喝", pinyin: "hē", tone: 1 },
  { id: "shan1", hanzi: "山", pinyin: "shān", tone: 1 },
  { id: "xin1", hanzi: "心", pinyin: "xīn", tone: 1 },
  { id: "kai1", hanzi: "開", pinyin: "kāi", tone: 1 },
  { id: "mao1", hanzi: "貓", pinyin: "māo", tone: 1 },
  { id: "chun1", hanzi: "春", pinyin: "chūn", tone: 1 },
  { id: "gao1", hanzi: "高", pinyin: "gāo", tone: 1 },
  { id: "zhong1", hanzi: "中", pinyin: "zhōng", tone: 1 },
  { id: "duo1", hanzi: "多", pinyin: "duō", tone: 1 },
  { id: "jie1", hanzi: "街", pinyin: "jiē", tone: 1 },
  { id: "tang1", hanzi: "湯", pinyin: "tāng", tone: 1 },
  { id: "bao1", hanzi: "包", pinyin: "bāo", tone: 1 },
  { id: "bei1", hanzi: "杯", pinyin: "bēi", tone: 1 },
  { id: "fei1", hanzi: "飛", pinyin: "fēi", tone: 1 },
  { id: "xing1", hanzi: "星", pinyin: "xīng", tone: 1 },
  { id: "xiang1", hanzi: "香", pinyin: "xiāng", tone: 1 },
  { id: "bing1", hanzi: "冰", pinyin: "bīng", tone: 1 },
  { id: "ting1", hanzi: "聽", pinyin: "tīng", tone: 1 },
  { id: "ma2", hanzi: "麻", pinyin: "má", tone: 2 },
  { id: "ba2", hanzi: "拔", pinyin: "bá", tone: 2 },
  { id: "shi2", hanzi: "十", pinyin: "shí", tone: 2 },
  { id: "ren2", hanzi: "人", pinyin: "rén", tone: 2 },
  { id: "lai2", hanzi: "來", pinyin: "lái", tone: 2 },
  { id: "tou2", hanzi: "頭", pinyin: "tóu", tone: 2 },
  { id: "qian2", hanzi: "錢", pinyin: "qián", tone: 2 },
  { id: "fang2", hanzi: "房", pinyin: "fáng", tone: 2 },
  { id: "men2", hanzi: "門", pinyin: "mén", tone: 2 },
  { id: "xue2", hanzi: "學", pinyin: "xué", tone: 2 },
  { id: "hong2", hanzi: "紅", pinyin: "hóng", tone: 2 },
  { id: "bai2", hanzi: "白", pinyin: "bái", tone: 2 },
  { id: "yu2", hanzi: "魚", pinyin: "yú", tone: 2 },
  { id: "niu2", hanzi: "牛", pinyin: "niú", tone: 2 },
  { id: "yang2", hanzi: "羊", pinyin: "yáng", tone: 2 },
  { id: "cha2", hanzi: "茶", pinyin: "chá", tone: 2 },
  { id: "tian2", hanzi: "甜", pinyin: "tián", tone: 2 },
  { id: "chang2", hanzi: "長", pinyin: "cháng", tone: 2 },
  { id: "nian2", hanzi: "年", pinyin: "nián", tone: 2 },
  { id: "ming2", hanzi: "明", pinyin: "míng", tone: 2 },
  { id: "mang2", hanzi: "忙", pinyin: "máng", tone: 2 },
  { id: "nan2", hanzi: "難", pinyin: "nán", tone: 2 },
  { id: "wan2", hanzi: "玩", pinyin: "wán", tone: 2 },
  { id: "wang2", hanzi: "王", pinyin: "wáng", tone: 2 },
  { id: "cai2", hanzi: "才", pinyin: "cái", tone: 2 },
  { id: "qiu2", hanzi: "球", pinyin: "qiú", tone: 2 },
  { id: "tu2", hanzi: "圖", pinyin: "tú", tone: 2 },
  { id: "e2", hanzi: "鵝", pinyin: "é", tone: 2 },
  { id: "lan2", hanzi: "藍", pinyin: "lán", tone: 2 },
  { id: "huang2", hanzi: "黃", pinyin: "huáng", tone: 2 },
  { id: "ma3b", hanzi: "馬", pinyin: "mǎ", tone: 3 },
  { id: "ba3", hanzi: "把", pinyin: "bǎ", tone: 3 },
  { id: "wu3", hanzi: "五", pinyin: "wǔ", tone: 3 },
  { id: "jiu3", hanzi: "九", pinyin: "jiǔ", tone: 3 },
  { id: "wo3", hanzi: "我", pinyin: "wǒ", tone: 3 },
  { id: "ni3", hanzi: "你", pinyin: "nǐ", tone: 3 },
  { id: "hao3", hanzi: "好", pinyin: "hǎo", tone: 3 },
  { id: "mai3", hanzi: "買", pinyin: "mǎi", tone: 3 },
  { id: "shui3", hanzi: "水", pinyin: "shuǐ", tone: 3 },
  { id: "gou3", hanzi: "狗", pinyin: "gǒu", tone: 3 },
  { id: "shou3", hanzi: "手", pinyin: "shǒu", tone: 3 },
  { id: "kou3", hanzi: "口", pinyin: "kǒu", tone: 3 },
  { id: "yan3", hanzi: "眼", pinyin: "yǎn", tone: 3 },
  { id: "er3", hanzi: "耳", pinyin: "ěr", tone: 3 },
  { id: "zao3", hanzi: "早", pinyin: "zǎo", tone: 3 },
  { id: "zou3", hanzi: "走", pinyin: "zǒu", tone: 3 },
  { id: "pao3", hanzi: "跑", pinyin: "pǎo", tone: 3 },
  { id: "xiang3", hanzi: "想", pinyin: "xiǎng", tone: 3 },
  { id: "xiao3", hanzi: "小", pinyin: "xiǎo", tone: 3 },
  { id: "lao3", hanzi: "老", pinyin: "lǎo", tone: 3 },
  { id: "leng3", hanzi: "冷", pinyin: "lěng", tone: 3 },
  { id: "duan3", hanzi: "短", pinyin: "duǎn", tone: 3 },
  { id: "yuan3", hanzi: "遠", pinyin: "yuǎn", tone: 3 },
  { id: "mi3", hanzi: "米", pinyin: "mǐ", tone: 3 },
  { id: "you3", hanzi: "有", pinyin: "yǒu", tone: 3 },
  { id: "nv3", hanzi: "女", pinyin: "nǚ", tone: 3 },
  { id: "yu3", hanzi: "雨", pinyin: "yǔ", tone: 3 },
  { id: "yi3", hanzi: "椅", pinyin: "yǐ", tone: 3 },
  { id: "zhi3", hanzi: "紙", pinyin: "zhǐ", tone: 3 },
  { id: "qing3", hanzi: "請", pinyin: "qǐng", tone: 3 },
  { id: "ma4b", hanzi: "罵", pinyin: "mà", tone: 4 },
  { id: "ba4", hanzi: "爸", pinyin: "bà", tone: 4 },
  { id: "si4", hanzi: "四", pinyin: "sì", tone: 4 },
  { id: "liu4", hanzi: "六", pinyin: "liù", tone: 4 },
  { id: "er4", hanzi: "二", pinyin: "èr", tone: 4 },
  { id: "da4", hanzi: "大", pinyin: "dà", tone: 4 },
  { id: "shi4", hanzi: "是", pinyin: "shì", tone: 4 },
  { id: "mai4", hanzi: "賣", pinyin: "mài", tone: 4 },
  { id: "dui4", hanzi: "對", pinyin: "duì", tone: 4 },
  { id: "kan4", hanzi: "看", pinyin: "kàn", tone: 4 },
  { id: "qu4", hanzi: "去", pinyin: "qù", tone: 4 },
  { id: "yao4", hanzi: "要", pinyin: "yào", tone: 4 },
  { id: "hui4", hanzi: "會", pinyin: "huì", tone: 4 },
  { id: "kuai4", hanzi: "快", pinyin: "kuài", tone: 4 },
  { id: "man4", hanzi: "慢", pinyin: "màn", tone: 4 },
  { id: "re4", hanzi: "熱", pinyin: "rè", tone: 4 },
  { id: "shu4", hanzi: "樹", pinyin: "shù", tone: 4 },
  { id: "hua4", hanzi: "話", pinyin: "huà", tone: 4 },
  { id: "fan4", hanzi: "飯", pinyin: "fàn", tone: 4 },
  { id: "cai4", hanzi: "菜", pinyin: "cài", tone: 4 },
  { id: "rou4", hanzi: "肉", pinyin: "ròu", tone: 4 },
  { id: "mian4", hanzi: "麵", pinyin: "miàn", tone: 4 },
  { id: "dian4", hanzi: "電", pinyin: "diàn", tone: 4 },
  { id: "lu4", hanzi: "路", pinyin: "lù", tone: 4 },
  { id: "yue4", hanzi: "月", pinyin: "yuè", tone: 4 },
  { id: "ke4", hanzi: "課", pinyin: "kè", tone: 4 },
  { id: "di4", hanzi: "弟", pinyin: "dì", tone: 4 },
  { id: "mei4", hanzi: "妹", pinyin: "mèi", tone: 4 },
  { id: "zuo4", hanzi: "坐", pinyin: "zuò", tone: 4 },
  { id: "chang4", hanzi: "唱", pinyin: "chàng", tone: 4 },
];
