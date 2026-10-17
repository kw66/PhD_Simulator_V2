import type { Buff, GameState, PendingEvent } from "./v2-types";
import { createThreeStageEvent } from "./v2-random-events-core-shared";
import { previewPlayerAttributeChange } from "./v2-player-attributes";
import { formatTierResistedOutcome } from "./v2-sanity-rules";
import { usesCurrentGameplayRules } from "./v2-rule-context";

export const STUDY_FATIGUE_EVENT_ID = 19;
export const STUDY_FATIGUE_RESEARCH_COSTS = { travel: 1, sport: 1, friends: 1, money: 2 } as const;

/** Only the player's own research operations count, including the AI bonus action. */
export function isStudyFatigueEligible(state: GameState): boolean {
  if (state.totalMonths < 4) return false;
  const lastEpisode = state.eventHistory.filter((event) => event.chainId === "random-19")
    .reduce((last, event) => Math.max(last, event.completedAtTotalMonths), 0);
  return [1, 2, 3].every((offset) => {
    const month = state.totalMonths - offset;
    return month > lastEpisode && (state.achievementProgress?.counters[`research-actions:${month}`] ?? 0) > 0;
  });
}

/** Apply each scheduled adjustment once, restoring the previous month's adjustment first. */
export function settleScheduledActionBuffs(state: GameState): GameState {
  let limit = state.actionState.limit;
  const buffs = state.buffs.map((buff) => {
    if (buff.actionLimitAtTotalMonths === undefined) return buff;
    if (buff.actionLimitAtTotalMonths < state.totalMonths && buff.appliedActionLimitDelta !== undefined) {
      limit -= buff.appliedActionLimitDelta;
      const { appliedActionLimitDelta: _, ...rest } = buff;
      return rest;
    }
    if (buff.actionLimitAtTotalMonths !== state.totalMonths || buff.appliedActionLimitDelta !== undefined) return buff;
    const nextLimit = Math.max(0, limit + (buff.monthlyActionLimitDelta ?? 0));
    const appliedActionLimitDelta = nextLimit - limit;
    limit = nextLimit;
    return { ...buff, appliedActionLimitDelta };
  });
  return { ...state, buffs, actionState: { ...state.actionState, limit } };
}

export function createStudyFatigueEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  const researchText = (amount: number) => {
    const result = previewPlayerAttributeChange(state, "research", amount);
    if (usesCurrentGameplayRules()) return formatTierResistedOutcome("科研", amount, result);
    const change = result.effectiveChange;
    return `科研 ${change > 0 ? "+" : ""}${Number(change.toFixed(10))}`;
  };
  const socialText = usesCurrentGameplayRules()
    ? formatTierResistedOutcome("社交", 1, previewPlayerAttributeChange(state, "social", 1)) : "社交 +1";
  const breakBuff: Buff = {
    id: `study-fatigue-break-${state.totalMonths}-${serial}`, name: "休整安排 · 普通行动点−1", source: "厌倦学习",
    timing: "monthly", remainingMonths: 2,
    monthlyActionLimitDelta: -1, actionLimitAtTotalMonths: state.totalMonths + 1,
    description: "下月减少1个普通行动点，不影响AI行动；再下月恢复",
  };
  const options = [
    { key: "travel", label: "旅游解忧", effects: { rawResearch: -STUDY_FATIGUE_RESEARCH_COSTS.travel, san: 6 }, outcome: `${researchText(-STUDY_FATIGUE_RESEARCH_COSTS.travel)}｜SAN +6｜下月普通行动点 -1`,
      result: "你把行程排得很满，又临时改掉一半。沿海坐慢车，在陌生小城吃早餐，爬到山顶等一场没等到的日出。相册里终于不全是报错截图和实验曲线。\n\n回来整理照片时，你发现有些文献的细节已经记不清了。但推开实验室的门，不再像前些天那样先叹一口气。" },
    { key: "sport", label: "运动解忧", effects: { rawResearch: -STUDY_FATIGUE_RESEARCH_COSTS.sport, sanCapDelta: 3 }, outcome: `${researchText(-STUDY_FATIGUE_RESEARCH_COSTS.sport)}｜SAN上限 +3｜下月普通行动点 -1`,
      result: "你跟着教练学滑雪，扶着冲浪板一遍遍落水，又在护具齐全的山道上尝试速降。最初只顾得上紧张，后来终于有空笑自己摔得太狼狈。\n\n酸痛的腿让你走楼梯慢了两天，脑子里盘旋的却不再只有指标。那些暂时放下的知识还要重新捡起来，而你觉得自己能多撑住一点了。" },
    { key: "friends", label: "交友解忧", effects: { rawResearch: -STUDY_FATIGUE_RESEARCH_COSTS.friends, rawSocial: 1 }, outcome: `${researchText(-STUDY_FATIGUE_RESEARCH_COSTS.friends)}｜${socialText}｜下月普通行动点 -1`,
      result: "你参加了几场与课题毫无关系的活动，认识了做设计的、教吉他的和刚辞职旅行的人。第一次自我介绍没有提研究方向，你竟然有些不知道接下来该说什么。\n\n从交换歌单到约饭，话题慢慢多了起来。月底再看论文时，你得翻回前几页找思路；手机里却多了几个可以随时问“今晚吃什么”的朋友。" },
    { key: "money", label: "赚钱解忧", effects: { rawResearch: -STUDY_FATIGUE_RESEARCH_COSTS.money, money: 3 }, outcome: `${researchText(-STUDY_FATIGUE_RESEARCH_COSTS.money)}｜金币 +3｜下月普通行动点 -1`,
      result: "你试着拍短视频、剪生活片段，又硬着头皮开了直播。第一次直播只有三个人，其中一个还是误点进来的。你盯后台数据的样子，和等实验结果时一样认真。\n\n折腾了一阵，总算赚到一点钱。搁置的课题已经有些生疏，可这笔小收入让你踏实：离开那几个熟悉的分数，你也并不是完全没有办法。" },
  ];
  const event: PendingEvent = {
    id: `random-19-y${state.year}-m${state.month}-n${serial}`, chainId: "random-19", title: "厌倦学习",
    source: "random", blocking: true, deadlineMonths: 0, stage: "act1", description: "",
    choices: options.map((option) => ({ id: `random-19-${option.key}-${serial}`, label: option.label,
      outcome: option.outcome, effects: { ...option.effects, addBuffs: [breakBuff] } })),
  };
  return createThreeStageEvent(event, {
    introDescription: "你已经连续几个月围着课题转。读文献、跑实验、改稿，日历上的日期在变，工位上的水杯却好像一直没挪过。\n\n今天又一次打开熟悉的文件，你忽然一个字也看不进去。不是困，也不是没吃饭；光是想到还要点开下一篇论文，胸口就先堵住了。你坐了很久，最后把电脑合上：真的学不动了。",
    decisionTitle: "换一种生活",
    decisionDescription: "你试着逼自己再坚持半小时，结果只是在同一行来回拖动光标。以前顺手就能接上的思路，现在伸手也抓不住，连“休息够了就好了”都听得有点烦。\n\n这次你想离开工位久一点，给别的事情腾出真正的时间。课题可能会生疏，回来的安排也得往后挪，但眼下你需要的，似乎正是一段不必证明自己有用的日子。",
    results: Object.fromEntries(options.map((option) => [`random-19-${option.key}-${serial}`, {
      title: option.label, description: option.result,
    }])),
  }, state);
}
