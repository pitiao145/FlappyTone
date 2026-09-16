/**
 * The Simplified screen, checked in both directions.
 *
 * A screen that flags nothing is useless; a screen that flags a legitimate
 * Traditional character is worse, because it refuses a word list that is
 * correct. The second direction is pinned against the 120 words actually
 * shipped, which is the only real corpus of Traditional hanzi in this repo.
 */

import { describe, expect, it } from "vitest";

import { hasSimplified, simplifiedIn } from "./simplified.ts";
import wordsFallback from "../data/wordsFallback.json" with { type: "json" };

// Retargeted at the published catalog snapshot (Task 13, Sep 2026) — the
// word list is a Supabase `words` table now, not `wordlist.ts`'s `WORDS`.
const WORDS = wordsFallback.rows as { id: string; hanzi: string }[];

describe("hasSimplified", () => {
  it("flags a Simplified character", () => {
    expect(hasSimplified("妈")).toBe(true);
    expect(hasSimplified("马")).toBe(true);
    expect(hasSimplified("骂")).toBe(true);
  });

  it("passes the Traditional form of the same word", () => {
    expect(hasSimplified("媽")).toBe(false);
    expect(hasSimplified("馬")).toBe(false);
    expect(hasSimplified("罵")).toBe(false);
  });

  it("flags a mixed string", () => {
    // One Simplified character in an otherwise Traditional word is exactly the
    // drift this exists to catch — a list typed half from one source.
    expect(hasSimplified("學说")).toBe(true);
  });

  it("passes a string with no hanzi at all", () => {
    expect(hasSimplified("")).toBe(false);
    expect(hasSimplified("ma1")).toBe(false);
  });

  it("names which characters tripped it", () => {
    expect(simplifiedIn("说话")).toEqual(["说", "话"]);
    expect(simplifiedIn("說話")).toEqual([]);
    // Deduplicated: a repeated character is one complaint, not two.
    expect(simplifiedIn("说说")).toEqual(["说"]);
  });
});

describe("the screened set", () => {
  it("clears every shipped Traditional word", () => {
    // The over-broad-list check. A character that is BOTH a Traditional
    // character and the simplification of another (后, 里, 只, 干 …) must
    // never be in the set; if one slips in, one of these 120 words trips.
    for (const word of WORDS) {
      expect(simplifiedIn(word.hanzi), `${word.id} ${word.hanzi}`).toEqual([]);
    }
  });

  it("is big enough to be worth having", () => {
    // simplifiedChars() used to be exported just to check the set's size —
    // the only caller was this test. Inlined: flag a long, varied sample of
    // Simplified-only characters instead of reaching into the module's
    // internals.
    const sample =
      "计钱饥红贝车门见马辽队们个为与书东妈吗农业丛丧严丽举义乐习乡买乱亏亚产亲仅从仓仪价众优会伞伟传伤伦伪侦侧俭债倾偿储儿兑兰关兴养兽军冯冲决净准凑凭凯击凿刘则刚创剂剑劝办务劲动励劳势华协单卖卫厂厅历厉压厌县参双发变叙叠叶号叹吓吨听启员响哑团园围图圆圣坏块坚坛坝坟垒垦垫墙壮声壳处备复够头夹夺奋奖妆妇娇娱婴孙学宁宝实审宪宫宽宾对寻导寿将尔尘尝层届属岁岂岗岛岭峡币帅师帐帘帜带帮归当录彻忆忧怀态怜总恋恳恼悬惊惧惨惩战戏扑执扩扫扬扰抚抛择挂挠挡挣挤换据损捡揽摄摆摇摊敌数断无旧时昼显晒晓晕暂朴机杀杂权条来极构枢枪枫柜标栋栏树样桩档桥梦检楼欢欧歼残殴毁毕毙汇汉汤沟沦沧浅浆浇浊测济浑浓涛涡润涨渐湾湿滚满滤滨滩灭灯灵炉炼点烂烛热烧营爱爷牵牺状犹独狱狮狭猎猪献环现玺琐疗疮疯痒痪皱盏盐监盖盘睁瞒码砖础硕确碍碱礼祸离积称稳穷窃窍窜窝竖竞笔笼筑简篮类罗罚罢翘耻聂聋职联肠肤肾肿胀胆脏脑脸艰艺节芦苇苏苹荐荣药莱莲获莹萝萤萧蒋蓝虏虑虾蚀蚁蚂蚕蛮蜡蝇衔补衬袄袜装褴踪辆长";
    expect(simplifiedIn(sample).length).toBeGreaterThan(200);
  });
});
