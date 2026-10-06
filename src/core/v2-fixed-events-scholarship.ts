import {
  appendMechanismSettlement,
  createFixedEvent,
  drawInclusiveInt,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import { formatActualSanChange, getActualSanChange } from "./v2-sanity-rules";
import { hasScholarshipDisqualification } from "./v2-academic-integrity";
import type { GameState, PendingEvent } from "./v2-types";

type ScholarshipOutcomeContext = NonNullable<PendingEvent["scholarshipContext"]>;

function createScholarshipScene(
  context: ScholarshipOutcomeContext,
  params: Parameters<typeof createFixedEvent>[0],
): PendingEvent {
  return { ...createFixedEvent(params), scholarshipContext: context };
}

export function getScholarshipRequirement(year: number, getRoll: RandomRollProvider): number {
  if (year <= 2) return 1;
  if (year === 3) return drawInclusiveInt(2, 4, getRoll);
  if (year === 4) return drawInclusiveInt(5, 8, getRoll);
  return drawInclusiveInt(8, 12, getRoll);
}

export function getScholarshipReward(year: number): number {
  return year >= 4 ? 9 : 6;
}

function getScholarshipGradeLabel(state: Pick<GameState, "year" | "degree" | "phdStartYear">): string {
  const numerals = ["一", "二", "三", "四", "五", "六"] as const;
  if (state.degree === "phd" && state.phdStartYear !== null) {
    const phdYear = Math.max(1, state.year - state.phdStartYear + 1);
    return `博${numerals[phdYear - 1] ?? phdYear}`;
  }
  return `研${numerals[state.year - 1] ?? state.year}`;
}

function getEligiblePublishedPaperIds(state: GameState): string[] {
  const claimed = new Set(state.scholarshipState.claimedPaperIds);
  return [...state.papers, ...state.externalPublications]
    .filter((paper) => paper.status === "published" && paper.nonFirstAuthor !== true && !claimed.has(paper.id))
    .map((paper) => paper.id);
}

function buildScholarshipResultEvent(context: ScholarshipOutcomeContext, disqualified = false): PendingEvent {
  if (context.success && disqualified) {
    return createScholarshipScene(context, {
      id: `scholarship-result-y${context.year}-m${context.month}`,
      title: "国奖评选 ➜ 申报决定 ➜ 资格取消",
      description: appendMechanismSettlement([
        "公示名单里有你的名字，你刚截好图，学院又发来消息——公示期间有人举报你用于评奖的论文存在图片误用，核实后取消了你的国奖资格。",
        "你重新打开名单，自己的名字已经被划去。申报材料还放在桌边，那张准备发给家里的截图，最后也没发出去。",
      ].join("\n\n"), `条件：评奖科研分 ${context.score} ≥ 分数线 ${context.requirement}；被举报\n结果：资格取消，金币 +0`),
      chainId: "scholarship",
      stage: "result",
      choices: [{
        id: `scholarship-claim-y${context.year}-m${context.month}`,
        label: "确定",
        outcome: "国奖资格取消，金币 +0。",
        effects: {},
      }],
    });
  }
  if (context.success) {
    const diff = context.score - context.requirement;
    const reaction = diff >= 3
      ? "你在名单里找到自己的名字，截了张图，又点开确认一遍。刚才还嫌通知太多，这一条倒是舍不得划掉。"
      : diff >= 1
        ? "你找到自己的名字，才松开一直攥着鼠标的手。申报文件夹里又多了一份通知，这次不用改格式，也不用补附件了。"
        : "你把名字和分数来回核了两遍，刚好踩线。截完图还不放心，又放大看了一眼，生怕自己高兴得太早，看错了行。";
    return createScholarshipScene(context, {
      id: `scholarship-result-y${context.year}-m${context.month}`,
      title: "国奖评选 ➜ 申报决定 ➜ 获得奖学金",
      description: appendMechanismSettlement([
        `📱 学院通知弹出：“恭喜获得本年度国家奖学金。”你的科研积分为 ${context.score} 分，分数线为 ${context.requirement} 分。`,
        reaction,
      ].join("\n\n"), `条件：评奖科研分 ${context.score} ≥ 分数线 ${context.requirement}\n结果：金币 +${context.reward}`),
      chainId: "scholarship",
      stage: "result",
      choices: [
        {
          id: `scholarship-claim-y${context.year}-m${context.month}`,
          label: "收下奖金",
          outcome: `拿到奖学金，金币 +${context.reward}。`,
          effects: {
            money: context.reward,
            scholarshipAward: {
              year: context.year,
              scoreBaseline: context.scoreBaseline + context.score,
              paperIds: context.eligiblePaperIds,
            },
          },
        },
      ],
    });
  }

  const diff = context.requirement - context.score;
  const reaction = diff === 1
    ? "你把分数又加了一遍，还是差那一点。计算器关了又打开，也算不出另一种结果。没用于获奖的成果能继续累计，只是眼下还不太甘心。"
    : diff <= 3
      ? "你逐项核了一遍材料，没有漏算。申报页面停了好一会儿，最后还是关掉了；文件留在原处，未用于获奖的成果可以继续累计。"
      : "你看着分数线，原本准备好的安慰自己的话，一时也没想起来。申报材料先收进文件夹，未用于获奖的成果仍能累计，下次再用得上。";

  return createScholarshipScene(context, {
    id: `scholarship-result-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 申报决定 ➜ 遗憾落选",
    description: appendMechanismSettlement([
      `📱 学院通知弹出，你没能进入获奖名单。你的科研积分为 ${context.score} 分，距离 ${context.requirement} 分的分数线还差 ${diff} 分。`,
      reaction,
    ].join("\n\n"), `条件：评奖科研分 ${context.score} < 分数线 ${context.requirement}\n结果：金币 +0`),
    chainId: "scholarship",
    stage: "result",
    choices: [
      {
        id: `scholarship-fail-y${context.year}-m${context.month}`,
        label: "明年再战",
        outcome: "没有获奖，明年再来。",
        effects: {},
      },
    ],
  });
}

function buildScholarshipDecisionEvent(state: GameState, context: ScholarshipOutcomeContext): PendingEvent {
  const diff = context.score - context.requirement;
  const thoughts = diff >= 3
    ? "对照往年的获奖材料，成果充实不少，心里总算有了底。"
    : diff >= 1
      ? "对照往年的获奖材料，你觉得有些把握，又确认了一遍没有重复申报。"
      : diff === 0
        ? "对照往年的获奖材料，像是刚好够得着，没多少余裕。"
        : diff >= -2
          ? "对照往年的获奖材料，总觉得还差一点，你又查了遍有没有漏填。"
          : "比起往年的获奖材料，积累仍显单薄，这回恐怕不太乐观。";
  const skipped = createFixedEvent({
    id: `scholarship-skip-result-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 申报决定 ➜ 暂不申报",
    description: appendMechanismSettlement([
      "你关掉申报页面，把论文和证明材料归进文件夹。这次先不交了，没用于获奖的成果还能留到以后。",
      "群里还在追问附件格式，你把消息设成免打扰，重新打开手头的工作。至少今晚不用再和表格较劲。",
    ].join("\n\n"), "结果：无事发生"),
    chainId: "scholarship",
    stage: "result",
    choices: [{ id: `scholarship-skip-finish-y${context.year}-m${context.month}`, label: "确定", outcome: "暂不申报，成果留到以后。", effects: {} }],
  });

  return createScholarshipScene(context, {
    id: `scholarship-decision-y${context.year}-m${context.month}`,
    title: "国奖评选 ➜ 申报决定",
    description: [
      `你翻出论文和证明材料，先给自己估了个分：这次能计入 ${context.score} 分。${thoughts}`,
      `本年度国奖奖金为 **${context.reward}金币**。申报表还空着几栏，整理附件也得花些精力。你已经在心里列起购物清单，刚到第二件就赶紧叫停：材料还没交，钱倒先花上了。`,
    ].join("\n\n"),
    chainId: "scholarship",
    stage: "act2",
    choices: [
      {
        id: `scholarship-apply-y${context.year}-m${context.month}`,
        label: "准备材料并申报",
        outcome: `准备申报材料，${formatActualSanChange(-2, state.month, state.eventSupport, state.buffs)}；入选后金币 +${context.reward}。`,
        effects: {
          san: getActualSanChange(-2, state.month, state.eventSupport, state.buffs),
          enqueueEvents: [buildScholarshipResultEvent(context, hasScholarshipDisqualification(state))],
        },
      },
      {
        id: `scholarship-skip-y${context.year}-m${context.month}`,
        label: "暂不申报",
        outcome: "暂不申报，成果留到以后。",
        effects: { enqueueEvents: [skipped] },
      },
    ],
  });
}

export function createScholarshipEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const requirement = getScholarshipRequirement(state.year, getRoll);
  const reward = getScholarshipReward(state.year);
  const scoreBaseline = state.scholarshipState.scoreBaseline;
  const eligiblePaperIds = getEligiblePublishedPaperIds(state);
  const score = Math.max(0, state.totalResearchScore - scoreBaseline);
  const context = {
    year: state.year,
    month: state.month,
    score,
    requirement,
    reward,
    scoreBaseline,
    eligiblePaperIds,
    success: score >= requirement,
  };
  return buildScholarshipIntroEvent(state, context);
}

function buildScholarshipIntroEvent(state: GameState, context: ScholarshipOutcomeContext): PendingEvent {
  return createScholarshipScene(context, {
    id: `scholarship-y${context.year}-m${context.month}`,
    title: "国奖评选",
    description: [
      `晚上十点，学院发来“国奖评选启动”通知：${getScholarshipGradeLabel(state)}共 5 个名额，按科研积分排名。你翻出往年的获奖材料，今年的结果仍要等正式名单。用于获奖的论文不能再次计入。`,
      "附件占了半屏，群里又在追问格式。" + (context.score > 0
        ? "手里还有没用于获奖的成果，值得试试。准备材料费精力，暂不申报也能留到以后。"
        : "翻过成果记录，这次还没有能计入的新积累。申报恐怕难入选，准备材料还得花精力。"),
    ].join("\n\n"),
    chainId: "scholarship",
    choices: [
      {
        id: `scholarship-continue-y${context.year}-m${context.month}`,
        label: "继续",
        outcome: "查看申报材料。",
        effects: {
          enqueueEvents: [buildScholarshipDecisionEvent(state, context)],
        },
      },
    ],
  });
}

export function refreshScholarshipEvent<T extends PendingEvent>(state: GameState, event: T): T {
  const context = event.scholarshipContext;
  if (event.chainId !== "scholarship" || !context) return event;
  const scoreBaseline = state.scholarshipState.scoreBaseline;
  const score = Math.max(0, state.totalResearchScore - scoreBaseline);
  const currentContext: ScholarshipOutcomeContext = {
    ...context,
    score,
    scoreBaseline,
    eligiblePaperIds: getEligiblePublishedPaperIds(state),
    success: score >= context.requirement,
  };
  const rebuilt = event.stage === "result"
    ? buildScholarshipResultEvent(currentContext, hasScholarshipDisqualification(state))
    : event.stage === "act2"
      ? buildScholarshipDecisionEvent(state, currentContext)
      : buildScholarshipIntroEvent(state, currentContext);
  const choices = rebuilt.choices.map((choice, index) => ({ ...choice, id: event.choices[index]?.id ?? choice.id }));
  if (event.title === rebuilt.title && event.description === rebuilt.description
    && JSON.stringify(event.scholarshipContext) === JSON.stringify(currentContext)
    && JSON.stringify(event.choices) === JSON.stringify(choices)) return event;
  return {
    ...event,
    title: rebuilt.title,
    description: rebuilt.description,
    completionLog: rebuilt.completionLog,
    scholarshipContext: currentContext,
    choices,
  };
}
