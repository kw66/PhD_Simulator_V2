import { applyTierResist, formatTierResistedOutcome, formatResearchMiscSanChange, getActualResearchMiscSanChange, getResearchMiscSanNarrative, getTierResistedNarrative } from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { createGeneratedFellowProfileAddition, getFellowName, getFellowRoleLabel } from "./v2-fellow-progression";
import {
  createThreeStageRandomEvent,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorProjectRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const rejectFavorResult = applyTierResist(-2, state.player.favor, getRoll);
  const rejectFavorChange = rejectFavorResult.effectiveChange;
  const rejectFavorNarrative = getTierResistedNarrative("导师好感", -2, rejectFavorResult);
  const horizontalSanChange = getActualResearchMiscSanChange(-8, state.player.research, state.month, state.eventSupport, state.buffs);
  const horizontalSanSummary = formatResearchMiscSanChange(-8, state.player.research, state.month, state.eventSupport, state.buffs);
  const horizontalSanNarrative = getResearchMiscSanNarrative(-8, state.player.research);
  const verticalSanChange = getActualResearchMiscSanChange(-6, state.player.research, state.month, state.eventSupport, state.buffs);
  const verticalSanSummary = formatResearchMiscSanChange(-6, state.player.research, state.month, state.eventSupport, state.buffs);
  const verticalSanNarrative = getResearchMiscSanNarrative(-6, state.player.research);
  const shareSanChange = getActualResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const shareSanSummary = formatResearchMiscSanChange(-2, state.player.research, state.month, state.eventSupport, state.buffs);
  const shareSanNarrative = getResearchMiscSanNarrative(-2, state.player.research);
  const horizontalFavorResult = applyTierResist(1, state.player.favor, getRoll);
  const horizontalFavorChange = horizontalFavorResult.effectiveChange;
  const horizontalFavorNarrative = getTierResistedNarrative("导师好感", 1, horizontalFavorResult);
  const verticalFavorResult = applyTierResist(1, state.player.favor, getRoll);
  const verticalFavorChange = verticalFavorResult.effectiveChange;
  const verticalFavorNarrative = getTierResistedNarrative("导师好感", 1, verticalFavorResult);
  const verticalResearchResult = applyTierResist(1, state.player.research, getRoll, getResearchCap(state.researchCapacityState));
  const verticalResearchChange = verticalResearchResult.effectiveChange;
  const verticalResearchNarrative = getTierResistedNarrative("科研", 1, verticalResearchResult);
  const familiarJunior = state.fellowProgressState.find((profile) => profile.type === "junior");
  const hasJunior = familiarJunior !== undefined;
  const familiarJuniorLabel = familiarJunior ? getFellowRoleLabel(familiarJunior.type, familiarJunior.gender) : "";
  const familiarJuniorName = familiarJunior ? getFellowName(familiarJunior) : familiarJuniorLabel;
  const shareSocialRaw = hasJunior ? -1 : -2;
  const shareSocialResult = applyTierResist(shareSocialRaw, state.player.social, getRoll);
  const shareSocialChange = shareSocialResult.effectiveChange;
  const shareSocialNarrative = getTierResistedNarrative("社交", shareSocialRaw, shareSocialResult);
  const unfamiliarJunior = createGeneratedFellowProfileAddition("junior", serial + 307, undefined, [], getRoll);
  const unfamiliarJuniorLabel = getFellowRoleLabel(unfamiliarJunior.type, unfamiliarJunior.gender);

  const event: PendingEvent = {
    id: `random-4-y${state.year}-m${state.month}-n${serial}`,
    title: "导师项目",
    description: "组会快散场，导师又打开一页项目清单。大家刚合上的电脑重新掀开，开始听这次的分工。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-4",
    stage: "act1",
    choices: [
      {
        id: `random-4-horizontal-${serial}`,
        label: "接横向项目",
        outcome: `${horizontalSanSummary}；${formatTierResistedOutcome("导师好感", 1, horizontalFavorResult)}；金币 +5`,
        effects: {
          san: horizontalSanChange,
          ...(horizontalFavorChange > 0 ? { favor: horizontalFavorChange } : {}),
          money: 5,
        },
      },
      {
        id: `random-4-vertical-${serial}`,
        label: "接纵向项目",
        outcome: `${verticalSanSummary}；${formatTierResistedOutcome("导师好感", 1, verticalFavorResult)}；${formatTierResistedOutcome("科研", 1, verticalResearchResult)}`,
        effects: {
          san: verticalSanChange,
          ...(verticalFavorChange > 0 ? { favor: verticalFavorChange } : {}),
          ...(verticalResearchChange > 0 ? { research: verticalResearchChange } : {}),
        },
      },
      {
        id: `random-4-reject-${serial}`,
        label: "申请调整",
        outcome: `${formatTierResistedOutcome("导师好感", -2, rejectFavorResult)}`,
        effects: {
          ...(rejectFavorChange < 0 ? { favor: rejectFavorChange } : {}),
        },
      },
      {
        id: `random-4-share-${serial}`,
        label: "让师弟师妹分担",
        outcome: `${hasJunior ? `有熟悉的${familiarJuniorLabel}` : "无熟悉的师弟/师妹"}；${shareSanSummary}；${formatTierResistedOutcome("社交", shareSocialRaw, shareSocialResult)}`,
        effects: {
          san: shareSanChange,
          social: shareSocialChange,
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "组会快结束，你已经把笔帽扣好，导师又翻出一页项目清单。前排刚收起的电脑重新打开，椅子挪动的声音也停了。",
      "清单上列着横向和纵向的任务，旁边留了一列填负责人。同门陆续报了分工，导师往下移了移光标，问到你的安排。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "横向任务旁标着交付时间和劳务费，你多看了一眼报酬，又往下读那几行需求。纵向的材料里倒有个问题让你想接着看，只是参考文献一翻，又是一长串。",
      "导师还等着你报分工。你低头翻开自己的日程，几项任务的日期挤在同一周，刚有的一点兴致又被拉了回来。旁边的同门还在记刚领到的活，你攥着笔，得先说清自己这次能接下多少。",
    ].join("\n\n"),
    results: {
      [`random-4-horizontal-${serial}`]: {
        title: "横向项目",
        description: [
          "你接下这批横向任务，赶着把演示跑通。甲方发来的“再小改一下”攒了好几条，你对着验收清单逐项打勾，文件名里的版本号也跟着往上加。",
          "这批任务交付后，劳务费到了账，你终于能关掉那几页需求。趴在桌边缓了一会儿，再翻开原来的研究笔记，竟得先想想上次做到哪里。",
          ...(horizontalFavorNarrative ? [horizontalFavorNarrative] : []),
          ...(horizontalSanNarrative ? [horizontalSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-4-vertical-${serial}`]: {
        title: "纵向项目",
        description: [
          "你接下纵向项目里的一项研究任务，从立项材料翻到参考文献。方案写到一半才发现少了一组关键对照，只好把刚排齐的实验表重新拆开。",
          "汇报时，导师追问起设计依据，你把补过的对照逐项说明。这轮材料总算交了上去，你揉着发酸的肩膀收电脑，脑子里还在过刚才那几个问题。",
          ...(verticalFavorNarrative ? [verticalFavorNarrative] : []),
          ...(verticalResearchNarrative ? [verticalResearchNarrative] : []),
          ...(verticalSanNarrative ? [verticalSanNarrative] : []),
        ].join("\n\n"),
      },
      [`random-4-reject-${serial}`]: {
        title: "调整分工",
        description: rejectFavorChange < 0
          ? [
              "你把近期的安排摊给导师，申请这次先不接项目任务。导师皱了下眉，说了句“大家都忙”，停了一会儿才把分工表往下翻。",
              "这次没有再往你这里派活，导师的语气却明显冷了些。你把本子合上，原来的日程保住了，刚才准备的几句解释还在心里打转。",
              ...(rejectFavorNarrative ? [rejectFavorNarrative] : []),
            ].join("\n\n")
          : [
              "你把近期的安排摊给导师，申请这次先不接项目任务。导师看了一遍，问清手头的事做到哪里，终于点了点头。",
              "这次没有再添新的分工，谈话也平稳收了尾。你把本子收回包里，回到工位才松开一直攥着的笔；日程上那几行暂时不用擦掉重写了。",
              ...(rejectFavorNarrative ? [rejectFavorNarrative] : []),
            ].join("\n\n"),
      },
      [`random-4-share-${serial}`]: {
        title: "分工协作",
        description: hasJunior
          ? shareSocialChange < 0
            ? [
                `你去找${familiarJuniorName}分担这批任务。对方看了眼清单，答应帮忙，却把自己的日程也推过来：“下次早点说，我这边也得挪。”`,
                "两人把这批工作赶完，你少熬了一些，对方说话却没先前那么热络。交接材料时，你多等了一会儿，也没等到往常那句闲聊。",
                ...(shareSocialNarrative ? [shareSocialNarrative] : []),
                ...(shareSanNarrative ? [shareSanNarrative] : []),
              ].join("\n\n")
            : [
                `你带着清单找到${familiarJuniorName}，商量哪些能请对方帮忙。对方看完说了句“你这安排可真紧”，还是拿笔圈走了其中几项。`,
                "你把剩下的部分做完，再一起核对交接。这批任务总算收了尾，有人帮着分担，回到工位时还留着一点精神整理自己的笔记。",
                ...(shareSocialNarrative ? [shareSocialNarrative] : []),
                ...(shareSanNarrative ? [shareSanNarrative] : []),
              ].join("\n\n")
          : shareSocialChange < 0
            ? [
                `你找一位不太熟的${unfamiliarJuniorLabel}分担任务，对方翻了翻清单，勉强接下几项。你以为已经说妥，后来才听说对方为临时添活抱怨了好几句。`,
                "这批工作做完，你确实少费了些精力。只是再到对方工位前，道谢的话还没说完，对方就先问了一句“还有事吗”，让你有点站不住。",
                ...(shareSocialNarrative ? [shareSocialNarrative] : []),
                ...(shareSanNarrative ? [shareSanNarrative] : []),
              ].join("\n\n")
            : [
                `你请一位不太熟的${unfamiliarJuniorLabel}帮忙，把要做的几项单独列了出来。对方问清交接时间，念叨了一句“还挺赶”，最后还是应下了。`,
                "各自的部分交齐，这批工作总算结束。你过去道谢，对方抬头说了声“不客气”；气氛还算平和，你也终于能收起那张反复核对的清单。",
                ...(shareSocialNarrative ? [shareSocialNarrative] : []),
                ...(shareSanNarrative ? [shareSanNarrative] : []),
              ].join("\n\n"),
      },
    },
  });
}

