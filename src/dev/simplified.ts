/**
 * A screen for Simplified characters — NOT a converter.
 *
 * CLAUDE.md hard rule 9: every hanzi anywhere in this product is Traditional,
 * because Jane records Taiwan Mandarin and the character on the HUD must be
 * the one she is reading. The one time this drifted (`src/brand.ts` shipping
 * 妈/马/骂) it was caught by eye, months later. A word list is typed once and
 * recorded against for weeks, so the cheap place to catch it is the importer.
 *
 * What this does: answers "does this string contain a character that only
 * exists in Simplified?" for a curated set of the ~230 most common ones. What
 * it does NOT do: convert anything, or claim completeness. A Simplified
 * character outside the set passes the screen — this is a guard rail, not a
 * proof, and `import-words` says so when it refuses a row.
 *
 * Every character below is Simplified-ONLY: it is not a standard Traditional
 * character in its own right. That exclusion is the whole design. Characters
 * that are both a Traditional character AND the simplification of a different
 * one — 后 (empress / 後), 里 (a unit of distance / 裡), 只 (only / 隻), 干
 * (dry / 乾·幹), 台, 面, 云, 谷, 发's neighbours and so on — are deliberately
 * ABSENT: flagging them would refuse legitimate Traditional words like 皇后,
 * which is a worse failure than missing one Simplified character. When in
 * doubt about a character, leave it out.
 *
 * Verified against the 120 shipped Traditional words in `wordlist.ts` by
 * `simplified.test.ts`: none of them may trip this.
 */

/**
 * Written as one string rather than an array so a character can be added
 * without a comma, and deduplicated into the set so a repeat is harmless.
 * Grouped loosely by radical, which is how simplification actually works and
 * therefore how a missing character is easiest to spot.
 */
const SIMPLIFIED_ONLY_CHARS =
  // 讠 (言)
  "计订认讨让训议讯记讲讳讶许论讼访设诀证评识诉词译试诗诚话诞诡询该详语误说诵读课谁调谅谈请诸诺谋谎谜谢谣谦谨谊谱" +
  // 钅 (金)
  "钱钟铁银错镇铺链锁锋键镜钢铜铝针钉钩铃铅锅锐锈锦" +
  // 饣 (食)
  "饥饭饮饰饱饲饶饺饼馄馆馈馒" +
  // 纟 (糸)
  "红级纪纯纲纸纷组细织经绍绑结绕给络绝统继绩绪续绳维绿缘编缩缝缠纤约纹纽绅绘绣绸综缆缓缕缔缚" +
  // 贝
  "贝贞负贡财责贤败账货质贩贪贫购贮贯贱贴贵贷贸费贺资赌赎赏赐赔赖赚赛赠赢赵赶" +
  // 车
  "车轨转轮软轻载较辅输辆辈辑辞" +
  // 门
  "门闪闭问闯闲间闷闹闻阅阔" +
  // 见 / 页
  "见观规觉览页顶项顺须顾顿预领颂频颗题颜额颤顷顽颈" +
  // 马 / 鸟 / 鱼
  "马驮驯驰驱驳驴驶驻驾骂骄骆验骑骗骤鸟鸡鸣鸭鸽鸿鹅鹉鹤鹰鱼鲁鲜鲸" +
  // 辶
  "辽达迁过迈运还这进远违连迟迹适选逊递逻遗" +
  // 阝 and the rest, by shape
  "队阳阴阵阶际陆陈险隐难邓邮邻郑" +
  "们个为与书东妈吗农业丛丧严丽举义乐习乡买乱亏亚产亲仅从仓仪价众优会伞伟传伤伦伪侦侧俭债倾偿储儿兑兰关兴养兽军冯冲决净准凑凭凯击凿刘则刚创剂剑劝办务劲动励劳势华协单卖卫厂厅历厉压厌县参双发变叙叠叶号叹吓吨听启员响哑团园围图圆圣坏块坚坛坝坟垒垦垫墙壮声壳处备复够头夹夺奋奖妆妇娇娱婴孙学宁宝实审宪宫宽宾对寻导寿将尔尘尝层届属岁岂岗岛岭峡币帅师帐帘帜带帮归当录彻忆忧怀态怜总恋恳恼悬惊惧惨惩战戏扑执扩扫扬扰抚抛择挂挠挡挣挤换据损捡揽摄摆摇摊敌数断无旧时昼显晒晓晕暂朴机杀杂权条来极构枢枪枫柜标栋栏树样桩档桥梦检楼欢欧歼残殴毁毕毙汇汉汤沟沦沧浅浆浇浊测济浑浓涛涡润涨渐湾湿滚满滤滨滩灭灯灵炉炼点烂烛热烧营爱爷牵牺状犹独狱狮狭猎猪献环现玺琐疗疮疯痒痪皱盏盐监盖盘睁瞒码砖础硕确碍碱礼祸离积称稳穷窃窍窜窝竖竞笔笼筑简篮类罗罚罢翘耻聂聋职联肠肤肾肿胀胆脏脑脸艰艺节芦苇苏苹荐荣药莱莲获莹萝萤萧蒋蓝虏虑虾蚀蚁蚂蚕蛮蜡蝇衔补衬袄袜装褴踪辆长";

const SIMPLIFIED_ONLY = new Set(SIMPLIFIED_ONLY_CHARS);

/** The characters the screen knows about, for tests and for a report. */
export function simplifiedChars(): ReadonlySet<string> {
  return SIMPLIFIED_ONLY;
}

/** Every Simplified-only character in `text`, in order of first appearance. */
export function simplifiedIn(text: string): string[] {
  const found: string[] = [];
  for (const char of text) {
    if (SIMPLIFIED_ONLY.has(char) && !found.includes(char)) found.push(char);
  }
  return found;
}

/** True when `text` contains at least one known Simplified-only character. */
export function hasSimplified(text: string): boolean {
  for (const char of text) if (SIMPLIFIED_ONLY.has(char)) return true;
  return false;
}
