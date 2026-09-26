import { applyTierResist, formatTierResistedOutcome, formatResearchMiscSanChange, getActualResearchMiscSanChange, getResearchMiscSanNarrative, getTierResistedNarrative } from "./v2-sanity-rules";
import { getResearchCap } from "./v2-research-cap-system";
import { ADVISOR_HORIZONTAL_REWARD, PROJECT_LABOR_REWARD, PROJECT_PROGRESS_MAX } from "./v2-lab-projects";
import { getAdvisorGuidanceAmount } from "./v2-advisor-guidance";
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
  const guidanceRolls = Array.from({ length: (state.fellowProgressState.length + 1) * 2 }, () => getRoll());
  const accumulationGain = Math.floor(state.advisorProgressState.researchAccumulation * 0.1);
  const introDescription = [
    "导师叫你去办公室聊聊。你带着电脑过去，刚想打开论文，导师先说起了组里的开销：服务器要租，设备要维护，实验室每天一开门，就有花钱的地方。",
    "“项目得大家一起分担，实验室才能正常运转。”导师说，平时同学们各做一部分，有人补实验，有人改方案，这次想让你牵头负责一个，其他同学一起配合。你把电脑往回挪了挪，看来今天不只是来讲论文进度的。",
  ].join("\n\n");

  const event: PendingEvent = {
    id: `random-4-y${state.year}-m${state.month}-n${serial}`,
    title: "导师项目",
    description: introDescription,
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-4",
    stage: "act1",
    choices: [
      {
        id: `random-4-horizontal-${serial}`,
        label: "接横向项目",
        outcome: `${horizontalSanSummary}；横向进度 +${PROJECT_PROGRESS_MAX}；科研经费 +${ADVISOR_HORIZONTAL_REWARD}；金币 +${PROJECT_LABOR_REWARD}；${formatTierResistedOutcome("导师好感", 1, horizontalFavorResult)}`,
        effects: {
          san: horizontalSanChange,
          ...(horizontalFavorChange > 0 ? { favor: horizontalFavorChange } : {}),
          labProjectProgress: { type: "horizontal", amount: PROJECT_PROGRESS_MAX },
        },
      },
      {
        id: `random-4-vertical-${serial}`,
        label: "接纵向项目",
        outcome: `${verticalSanSummary}；纵向进度 +${PROJECT_PROGRESS_MAX}；导师科研积累 +${accumulationGain}；导师指导：你和每位同学的论文随机一项协作分 +${getAdvisorGuidanceAmount()}；${formatTierResistedOutcome("导师好感", 1, verticalFavorResult)}；${formatTierResistedOutcome("科研", 1, verticalResearchResult)}`,
        effects: {
          san: verticalSanChange,
          ...(verticalFavorChange > 0 ? { favor: verticalFavorChange } : {}),
          ...(verticalResearchChange > 0 ? { research: verticalResearchChange } : {}),
          labProjectProgress: { type: "vertical", amount: PROJECT_PROGRESS_MAX, guidanceRolls },
        },
      },
      {
        id: `random-4-reject-${serial}`,
        label: "拒绝承担",
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
    introDescription,
    decisionTitle: "你的选择",
    decisionDescription: [
      "你盘算了一下：横向要对接甲方、赶交付，做完能给实验室补经费，自己也有一笔劳务费；纵向得把研究问题啃下来，成果能帮导师积累科研成绩，结题后导师也会和大家一起打磨论文。平时在人际栏参与项目，是和同学一起往前推；这次接下来，就得由你牵头把一个项目做完。",
      "想到自己的论文还开着好几个坑，你又有些犹豫。可以把主要工作交给师弟师妹分担，自己负责交接，只是临时给别人添活，难免惹人抱怨；也可以坦白说这次不接，导师未必愿意听。",
    ].join("\n\n"),
    results: {
      [`random-4-horizontal-${serial}`]: {
        title: "横向项目",
        description: [
          "你牵头接下横向项目，把工作分给组里的同学，自己盯方案、对接甲方、收拢各处的结果。甲方每说一次“再小改一下”，文件名后面的版本号就往上跳一格，好在大家一起赶，总算把最后一版演示跑通了。",
          ["项目终于通过验收，实验室的经费补上了，你的劳务费也到了账。导师看完交付材料，合上电脑说这次辛苦了。你趴在桌边缓了一会儿，再翻开自己的研究笔记，竟得先想想上次做到哪里。", horizontalFavorNarrative, horizontalSanNarrative].filter(Boolean).join(""),
        ].join("\n\n"),
      },
      [`random-4-vertical-${serial}`]: {
        title: "纵向项目",
        description: [
          "你牵头负责纵向项目，和同学们一起查文献、拆问题、补实验。几轮讨论下来，桌上画不下的框图挪到了白板上，原本各做各的几组结果，总算能串成一条完整的思路。",
          ["项目顺利结题，导师把这次成果记进了后续申请材料，又约大家逐个聊论文：有稿子的当场改思路，还没准备好的留着之后再聊。轮到你汇报时，曾经要翻半天文献的问题，如今也能讲清来龙去脉了。", verticalFavorNarrative, verticalResearchNarrative, verticalSanNarrative].filter(Boolean).join(""),
        ].join("\n\n"),
      },
      [`random-4-reject-${serial}`]: {
        title: "拒绝承担",
        description: rejectFavorChange < 0
          ? [
              "你把近期的安排讲给导师，明确说这次不接项目。导师皱了下眉，说了句“大家都忙”，办公室里安静了一会儿。",
              ["最后导师没再往你这里派活，只是语气明显冷了些。你收好电脑，原来的日程保住了，刚才准备的几句解释还在心里打转。", rejectFavorNarrative].filter(Boolean).join(""),
            ].join("\n\n")
          : [
              "你把近期的安排讲给导师，明确说这次不接项目。导师问清手头的事做到哪里，看了看你的进度，终于点了点头。",
              ["这次没有再添新的分工，谈话也平稳收了尾。你把电脑收回包里，回到工位才松开一直攥着的笔；日程上那几行暂时不用擦掉重写了。", rejectFavorNarrative].filter(Boolean).join(""),
            ].join("\n\n"),
      },
      [`random-4-share-${serial}`]: {
        title: "分工协作",
        description: hasJunior
          ? shareSocialChange < 0
            ? [
                `你去找${familiarJuniorName}分担主要工作。对方看了眼材料，答应接手，却把自己的日程也推过来：“下次早点说，我这边也得挪。”`,
                ["你把手头资料整理好交过去，后续工作由对方接着安排。交接时，你多等了一会儿，也没等到往常那句闲聊。", shareSocialNarrative, shareSanNarrative].filter(Boolean).join(""),
              ].join("\n\n")
            : [
                `你带着材料找到${familiarJuniorName}，商量能否请对方接过主要工作。对方看完说了句“你这安排可真紧”，还是答应接手。`,
                ["你把背景和交接事项一一说明，后续安排总算有了着落。回到工位时，你还留着一点精神整理自己的笔记。", shareSocialNarrative, shareSanNarrative].filter(Boolean).join(""),
              ].join("\n\n")
          : shareSocialChange < 0
            ? [
                `你找一位不太熟的${unfamiliarJuniorLabel}分担主要工作，对方翻了翻材料，勉强接下。你以为已经说妥，后来才听说对方为临时添活抱怨了好几句。`,
                ["资料交接完，你确实少担了一摊事。只是再到对方工位前，道谢的话还没说完，对方就先问了一句“还有事吗”，让你有点站不住。", shareSocialNarrative, shareSanNarrative].filter(Boolean).join(""),
              ].join("\n\n")
            : [
                `你请一位不太熟的${unfamiliarJuniorLabel}接过主要工作，把背景材料和当前进展整理给对方。对方问清交接时间，念叨了一句“还挺赶”，最后还是应下了。`,
                ["交接结束，你过去道谢，对方抬头说了声“不客气”。气氛还算平和，你把剩下的注意事项补进文档，发了过去。", shareSocialNarrative, shareSanNarrative].filter(Boolean).join(""),
              ].join("\n\n"),
      },
    },
  });
}

