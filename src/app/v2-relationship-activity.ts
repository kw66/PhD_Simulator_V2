export function compactRelationshipActivity(activity: string): string[] {
  const compact = activity
    .replace(/暂无项目安排|暂无安排/gu, "暂无活动")
    .replace(/(?:推进)?(横向|纵向)(?:项目)?进度/gu, "$1")
    .replace(/推进(横向|纵向)项目/gu, "$1")
    .replace(/(玩耍|学习|协作)进度/gu, "$1")
    .replace(/(?:新稿|论文)(idea|实验|写作)/gu, "$1")
    .replace(/论文中稿（与你合作）/gu, "合作中稿")
    .replace(/论文中稿|论文退稿/gu, (text) => text === "论文中稿" ? "中稿" : "退稿")
    .replace(/（长期合作，推进2次）/gu, "")
    .replace(/（项目完成）|（完成并指导论文）/gu, "（结项）")
    .replace(/\s*([+\-])\s*/gu, "$1")
    .replace(/([A-Za-z])\s+(\d)/gu, "$1$2");
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of compact) {
    if (character === "（" || character === "(") depth += 1;
    if (character === "）" || character === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && /[，；]/u.test(character)) {
      if (current) parts.push(current);
      current = "";
    } else current += character;
  }
  if (current) parts.push(current);
  return [...new Set(parts)].filter((part) => !/^订阅|^论文打磨$/u.test(part));
}

export function summarizeRelationshipActivity(parts: string[], budget = 44): string {
  const selected: string[] = [];
  const width = (text: string) => Array.from(text).reduce((total, character) => total + (/[^\x00-\xff]/u.test(character) ? 2 : 1), 0);
  for (const part of parts) {
    const text = width(part) > budget ? part.replace(/（[^）]*）/gu, "") : part;
    if (width([...selected, text].join("｜")) > budget) continue;
    selected.push(text);
  }
  return selected.join("｜") || "暂无活动";
}
