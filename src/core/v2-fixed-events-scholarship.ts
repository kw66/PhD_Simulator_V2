import {
  appendMechanismSettlement,
  createFixedEvent,
  drawInclusiveInt,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import { formatActualSanChange, getActualSanChange } from "./v2-sanity-rules";
import { hasScholarshipDisqualification } from "./v2-academic-integrity";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

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

function buildScholarshipResultEvent(state: GameState, context: ScholarshipOutcomeContext): PendingEvent {
  const result = buildScholarshipAwardEvent(context, hasScholarshipDisqualification(state));
  const san = getActualSanChange(-2, state.month, state.eventSupport, state.buffs);
  const sanSummary = formatActualSanChange(-2, state.month, state.eventSupport, state.buffs);
  return {
    ...result,
    description: result.description.replace("\n结果：", `\n结果：${sanSummary}\n结果：`),
    choices: result.choices.map((choice) => ({
      ...choice,
      outcome: `${sanSummary}；${choice.outcome}`,
      effects: { ...choice.effects, san },
    })),
  };
}

function buildScholarshipAwardEvent(context: ScholarshipOutcomeContext, disqualified = false): PendingEvent {
  if (context.requirement === null) throw new Error("国奖分数线须在申报后抽取");
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
  const range = context.year <= 2 ? "1分" : context.year === 3 ? "2～4分" : context.year === 4 ? "5～8分" : "8～12分";
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
      `细则写着：${getScholarshipGradeLabel(state)}共 5 个名额，按科研积分排名，已用于获奖的论文不能再次计入。你核对成果，这次能计入 ${context.score} 分；往年同年级的分数线在${range}，今年还要看大家提交的成果。`,
      `本年度国奖奖金为 **${context.reward}金币**。整理证明材料、准备答辩PPT，再上台讲清自己的成果，少不了一番忙碌。${context.score > 0
        ? "你翻着手里的成果，已经在想奖金能添置些什么，又赶紧收住心：材料还没交，钱倒先花上了。"
        : "申报表的成果栏还空着，你盯着光标看了一会儿，又看向桌边没写完的论文。"}没用于获奖的成果可以留到以后，不必这次就申报。`,
    ].join("\n\n"),
    chainId: "scholarship",
    stage: "act2",
    choices: [
      {
        id: `scholarship-apply-y${context.year}-m${context.month}`,
        label: "准备材料并申报",
        outcome: `准备材料与答辩，${formatActualSanChange(-2, state.month, state.eventSupport, state.buffs)}；入选后金币 +${context.reward}。`,
        effects: {
          fixedEventResolution: { kind: "scholarship-apply", scholarshipYear: context.year, scholarshipMonth: context.month },
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

export function createScholarshipEvent(state: GameState, _getRoll: RandomRollProvider): PendingEvent {
  const reward = getScholarshipReward(state.year);
  const scoreBaseline = state.scholarshipState.scoreBaseline;
  const eligiblePaperIds = getEligiblePublishedPaperIds(state);
  const score = Math.max(0, state.totalResearchScore - scoreBaseline);
  const context = {
    year: state.year,
    month: state.month,
    score,
    requirement: null,
    reward,
    scoreBaseline,
    eligiblePaperIds,
    success: false,
  };
  return buildScholarshipIntroEvent(state, context);
}

export function resolveScholarshipApplication(state: GameState, resolution: FixedEventResolution, getRoll: RandomRollProvider): FixedResolutionResult {
  const year = resolution.scholarshipYear ?? state.year;
  const requirement = getScholarshipRequirement(year, getRoll);
  const scoreBaseline = state.scholarshipState.scoreBaseline;
  const score = Math.max(0, state.totalResearchScore - scoreBaseline);
  const result = buildScholarshipResultEvent(state, {
    year, month: resolution.scholarshipMonth ?? state.month, requirement,
    reward: getScholarshipReward(year), score, scoreBaseline,
    eligiblePaperIds: getEligiblePublishedPaperIds(state), success: score >= requirement,
  });
  return { nextState: state, outcome: "材料和答辩已完成，查看评选结果。", enqueueEvents: [result] };
}

function buildScholarshipIntroEvent(state: GameState, context: ScholarshipOutcomeContext): PendingEvent {
  return createScholarshipScene(context, {
    id: `scholarship-y${context.year}-m${context.month}`,
    title: "国奖评选",
    description: [
      "晚上十点，学院群弹出“国奖评选启动”的通知，紧接着是申报表、材料清单和答辩安排。原本安静的群一下热闹起来，消息很快刷过了屏幕。",
      "你把手头的文档切到一旁，点开通知。附件占了半屏，有人找往年的模板，有人问盖章要去哪个办公室。你先把文件存进文件夹，再从头读起这次的评选细则。",
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
    success: context.requirement !== null && score >= context.requirement,
  };
  const rebuilt = event.stage === "result"
    ? buildScholarshipResultEvent(state, currentContext)
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
