import { getAiCollaborationStatus } from "./v2-ai-shop";
import { getCurrentCoffeeBonus } from "./v2-coffee-system";
import { getMeetingSelfPayDiscount, hasFullGear } from "./v2-meeting-system";
import { getReadingIdeaBonus } from "./v2-reading-system";
import { getResearchCap } from "./v2-research-cap-system";
import { describeTalentChange, recordTalentTrigger } from "./v2-talent-history";
import type { GameState } from "./v2-types";

export function recordTalentTransitions(before: GameState, after: GameState): GameState {
  if (before.phase !== "playing" || after.phase === "setup" || after.totalMonths < before.totalMonths) return after;
  let state = after;
  const add = (key: string, name: string, reason: string, effects: string[]): void => {
    if (after.eventHistory.some((entry) => entry.chainId.startsWith(`talent:${key}:`)
      && !before.eventHistory.some((old) => old.id === entry.id))) return;
    const serial = before.eventHistory.filter((entry) => entry.chainId.startsWith(`talent:${key}:`)).length;
    state = recordTalentTrigger(state, `${key}:${after.totalMonths}:${serial}`, {
      name, recipient: after.playerName ? `你·${after.playerName}` : "你", reason, effects,
    });
  };
  const readBefore = Math.floor(before.readingState.readCount / 10);
  const readAfter = Math.floor(after.readingState.readCount / 10);
  if (readAfter > readBefore) {
    add("reading-growth", "阅读积累", `累计阅读${after.readingState.readCount}次`, [
      `科研奖励+${readAfter - readBefore}，受科研上限限制（当前${after.player.research}/${getResearchCap(after.researchCapacityState)}）`,
      describeTalentChange("后续阅读的idea加分", getReadingIdeaBonus(before.readingState.readCount + 1), getReadingIdeaBonus(after.readingState.readCount + 1)),
    ]);
  }
  const workGrowth = Math.floor(after.partTimeWorkCount / 8) - Math.floor(before.partTimeWorkCount / 8);
  if (workGrowth > 0) add("part-time-growth", "兼职熟练度", `累计打工${after.partTimeWorkCount}次`, [
    `后续打工金币收入+${workGrowth}`, `后续打工SAN消耗+${workGrowth}`,
  ]);
  const meetingEffects = [2, 4, 6].flatMap((cost, index) => {
    const old = getMeetingSelfPayDiscount(before.eventCounters.meetingCount, cost);
    const current = getMeetingSelfPayDiscount(after.eventCounters.meetingCount, cost);
    return current > old ? [describeTalentChange(`${["国内", "亚太", "欧美"][index]}参会减免`, old, current)] : [];
  });
  if (meetingEffects.length) add("meeting-experience", "会议经验", `累计参会${after.eventCounters.meetingCount}次`, meetingEffects);
  if (after.eventCounters.badmintonCount > before.eventCounters.badmintonCount) {
    const effects = [describeTalentChange("实力中的SAN倍率", before.eventCounters.badmintonCount + 3, after.eventCounters.badmintonCount + 3)];
    if (!before.eventSupport.hasStrongBodyTalent && after.eventSupport.hasStrongBodyTalent) effects.push("首次获胜，每月SAN+1");
    add("badminton-growth", "羽毛球水平", `累计参加${after.eventCounters.badmintonCount}次`, effects);
  }
  const oldPokerRate = Math.min(100, 40 + before.eventCounters.pokerCount * 10);
  const pokerRate = Math.min(100, 40 + after.eventCounters.pokerCount * 10);
  if (pokerRate > oldPokerRate) add("poker-growth", "牌局策略", `累计参加${after.eventCounters.pokerCount}次`, [`后续胜率${oldPokerRate}%→${pokerRate}%`]);
  const bikeGain = after.shopState.bikeSanCapGains - before.shopState.bikeSanCapGains;
  if (bikeGain > 0) add("bike", "骑行积累", `累计骑行消耗SAN ${after.shopState.bikeSanSpent}`, [`SAN上限+${bikeGain}（当前${after.sanCap}）`]);
  const coffeeBefore = getCurrentCoffeeBonus(before.coffeeState);
  const coffeeAfter = getCurrentCoffeeBonus(after.coffeeState);
  if (coffeeAfter > coffeeBefore) add("coffee-machine", "高级咖啡机", `累计生产${after.coffeeState.machineTrackedCoffeeCount}杯冰美式`, [
    describeTalentChange("每杯额外SAN", coffeeBefore, coffeeAfter),
  ]);
  if (!hasFullGear(before.shopState, before.eventSupport) && hasFullGear(after.shopState, after.eventSupport)) {
    add("full-gear", "整装待发", "集齐小电驴、遮阳伞和羽绒服", ["小电驴改为春夏秋冬每月SAN+1"]);
  }
  if (!getAiCollaborationStatus(before.aiShopState).active && getAiCollaborationStatus(after.aiShopState).active) {
    add("ai-collaboration", "AI协作", "三路AI同时生效，且包含GPT或Claude", ["每月额外1次科研操作，不消耗行动点，SAN消耗+2"]);
  }
  if (!before.actionState.aiResearchBonusUsed && after.actionState.aiResearchBonusUsed && before.totalMonths === after.totalMonths) {
    add("ai-collaboration-use", "AI协作", "使用本月额外科研操作", ["行动点不变，本次SAN消耗额外+2"]);
  }
  return state;
}
