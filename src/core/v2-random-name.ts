export const RANDOM_NAME_SURNAMES = [
  "李", "阳", "袁", "缪", "庄", "盛", "陈", "徐", "梁", "明",
  "马", "王", "汪", "张", "刘", "郑", "钱", "赵", "魏", "贾",
  "姜", "邹", "侯", "杨", "向", "廖", "牛", "谢", "吴", "文",
  "辛", "崔", "韩", "姚", "詹", "余", "罗", "陆", "黄", "姬",
  "朱", "殷", "储", "宋", "白", "方", "谭", "龚", "俞", "章",
] as const;

export const RANDOM_NAME_GIVEN_CHARS = [
  "旭", "霖", "沁", "宏", "皓", "洁", "长", "涛", "婉", "仪",
  "典", "墨", "天", "翔", "子", "凯", "俊", "驰", "怡", "哲",
  "铭", "聪", "临", "风", "兴", "彦", "泱", "家", "振", "力",
  "嫣", "可", "心", "梦", "欣", "啟", "嘉", "靖", "东", "宣",
  "普", "叶", "林", "淞", "垚", "希", "轩", "睿", "航", "智",
  "骞", "雨", "霄", "宇", "在", "吉", "祥", "禹", "博", "晨",
  "百", "川", "云", "松", "丰", "麟", "英", "卓", "骏", "亮",
  "倚", "钦", "奎", "佳", "择", "涵", "蕾", "寅", "虎", "泽",
  "坤", "岩", "锦", "雷", "楠", "辉", "志", "伟", "国", "君",
  "斌", "琪", "晓", "屿", "俣", "路", "强", "璇", "婷", "杰",
  "生", "宁", "雅", "江", "颖", "海", "能", "乾", "思", "名",
] as const;

function normalizeRoll(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999, Math.max(0, value));
}

function pickRandom(values: readonly string[], getRoll: () => number): string {
  return values[Math.floor(normalizeRoll(getRoll()) * values.length)] ?? values[0] ?? "";
}

export function generateRandomChineseName(getRoll: () => number = Math.random): string {
  const surname = pickRandom(RANDOM_NAME_SURNAMES, getRoll);
  if (normalizeRoll(getRoll()) >= 0.9) {
    return surname + pickRandom(RANDOM_NAME_GIVEN_CHARS, getRoll);
  }

  const first = pickRandom(RANDOM_NAME_GIVEN_CHARS, getRoll);
  let second = pickRandom(RANDOM_NAME_GIVEN_CHARS, getRoll);
  if (first === second && normalizeRoll(getRoll()) > 0.1) {
    second = pickRandom(RANDOM_NAME_GIVEN_CHARS, getRoll);
  }
  return surname + first + second;
}
