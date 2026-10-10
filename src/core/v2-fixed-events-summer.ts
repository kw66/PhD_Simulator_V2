import {
  appendMechanismSettlement,
  createFixedEvent,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import { applyTierResist, formatTierResistedOutcome } from "./v2-sanity-rules";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

function createSummerVacationResultEvent(params: {
  idSuffix: "home" | "research" | "travel";
  year: number;
  month: number;
  title: string;
  description: string;
  outcome: string;
  settlement: string;
  effects: PendingEvent["choices"][number]["effects"];
}): PendingEvent {
  return createFixedEvent({
    id: `summer-vacation-${params.idSuffix}-result-y${params.year}-m${params.month}`,
    title: params.title,
    description: appendMechanismSettlement(params.description, params.settlement),
    chainId: "summer-vacation",
    stage: "result",
    choices: [
      {
        id: `summer-vacation-${params.idSuffix}-finish-y${params.year}-m${params.month}`,
        label: "继续",
        outcome: params.outcome,
        effects: params.effects,
      },
    ],
  });
}

function formatSummerSanRecovery(missingSan: number, ratio: 0.3 | 0.5): string {
  const sanRecovery = Math.floor(missingSan * ratio);
  return `SAN +${sanRecovery}（已损SAN${ratio * 100}%）`;
}

function createSummerVacationPlanEvent(state: GameState): PendingEvent {
  return createFixedEvent({
    id: `summer-vacation-plan-y${state.year}-m${state.month}`,
    title: "暑假 ➜ 暑假计划",
    description: [
      "家里发来消息，问你暑假回不回家、准备什么时候动身。你盯着聊天框想了想：实验室规定的假期只有二十多天，回去一趟也不能拖到开学前才回来。",
      "朋友又发来旅行攻略，照片里的街道和小店让人心动。留校、回家，还是趁这段短假出去走走，你把三种安排在脑子里排了一遍。",
    ].join("\n\n"),
    chainId: "summer-vacation",
    stage: "act2",
    choices: [
      {
        id: `summer-vacation-home-y${state.year}-m${state.month}`,
        label: "回家休息",
        outcome: "回家休息。",
        effects: {
          fixedEventResolution: { kind: "summer-vacation-home" },
        },
      },
      {
        id: `summer-vacation-research-y${state.year}-m${state.month}`,
        label: "留校科研",
        outcome: "留校科研。",
        effects: {
          fixedEventResolution: { kind: "summer-vacation-research" },
        },
      },
      {
        id: `summer-vacation-travel-y${state.year}-m${state.month}`,
        label: "外出旅行",
        outcome: "外出旅行。",
        effects: {
          fixedEventResolution: { kind: "summer-vacation-travel" },
        },
      },
    ],
  });
}

export function createSummerVacationEvent(state: GameState): PendingEvent {
  return createFixedEvent({
    id: `summer-vacation-y${state.year}-m${state.month}`,
    title: "暑假",
    description: [
      "这一学年终于熬到了尾声。暑期食堂少开了几个窗口，你端着餐盘绕一圈，常吃的那家也放假了，实验楼的灯倒还照常亮着。",
      "本科生或许能放上两个月，研究生却没有这么长的暑假：实验室规定只休二十多天。你把电脑合上，第一次认真想起，这段短暂的空档该留给什么。",
    ].join("\n\n"),
    chainId: "summer-vacation",
    choices: [
      {
        id: `summer-vacation-continue-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: "选择暑假安排。",
        effects: {
          enqueueEvents: [createSummerVacationPlanEvent(state)],
        },
      },
    ],
  });
}

export function resolveSummerVacationFixedEvent(
  state: GameState,
  resolution: FixedEventResolution,
  getRoll: RandomRollProvider,
): FixedResolutionResult | null {
  switch (resolution.kind) {
    case "summer-vacation-home": {
      const missingSan = Math.max(0, state.sanCap - state.player.san);
      const sanRecovery = Math.floor(missingSan * 0.3);
      const sanSummary = formatSummerSanRecovery(missingSan, 0.3);
      return {
        nextState: state,
        outcome: `${sanSummary}。`,
        enqueueEvents: [createSummerVacationResultEvent({
          idSuffix: "home",
          year: state.year,
          month: state.month,
          title: "暑假 ➜ 暑假计划 ➜ 回家休息",
          description: [
            "回家后，你干脆关掉闹钟，睡到中午才慢吞吞地下楼。下午陪家人逛街，顺路买些零碎东西，晚饭也不用对着电脑边吃边看实验日志。",
            "几天过去，脑子里那根绷紧的弦终于松了。你偶尔想起论文，却没有立刻打开电脑；这次休息得更充分些，新学期再把状态慢慢接回来。",
          ].join("\n\n"),
          outcome: `${sanSummary}。`,
          settlement: `结果：${sanSummary}`,
          effects: sanRecovery === 0 ? {} : { san: sanRecovery },
        })],
      };
    }
    case "summer-vacation-research":
      return {
        nextState: state,
        outcome: "下次想idea +1 次，永久 idea +1。",
        enqueueEvents: [createSummerVacationResultEvent({
          idSuffix: "research",
          year: state.year,
          month: state.month,
          title: "暑假 ➜ 暑假计划 ➜ 留校的夏天",
          description: [
            "你留在校园，白天去图书馆和实验楼之间来回。树上的蝉叫得响，空荡荡的教学楼里却凉快，傍晚还能绕到操场走一圈，看留校的人慢慢多起来。",
            "晚上回到实验室，你才把文献、实验记录和疑问摊开，沿着一个问题慢慢查。没有人催你立刻给出结果，几轮对照后，笔记里终于多了一条能继续试的思路。",
          ].join("\n\n"),
          outcome: "下次想idea +1 次，永久 idea +1 分。",
          settlement: "结果：下次想 idea +1 次｜永久 idea +1",
          effects: {
            temporaryActionEffectUpdates: { idea: { extraActions: 1 } },
            ideaBonus: 1,
          },
        })],
      };
    case "summer-vacation-travel": {
      const missingSan = Math.max(0, state.sanCap - state.player.san);
      const sanRecovery = Math.floor(missingSan * 0.3);
      const sanSummary = formatSummerSanRecovery(missingSan, 0.3);
      const socialResult = applyTierResist(1, state.player.social, getRoll);
      const socialText = formatTierResistedOutcome("社交", 1, socialResult);
      const fullSanTier = state.player.san >= 18;
      return {
        nextState: state,
        outcome: `金币 -3，${sanSummary}，${socialText}${fullSanTier ? "，SAN上限 +1" : ""}。`,
        enqueueEvents: [createSummerVacationResultEvent({
          idSuffix: "travel",
          year: state.year,
          month: state.month,
          title: "暑假 ➜ 暑假计划 ➜ 难忘旅程",
          description: [
            "你和朋友去邻近城市，行程排得很松。白天闲逛，晚上找小馆子，聊的从实验进度变成了明天去哪儿、哪家店好吃，话题终于不只围着课题转。",
            "回程翻照片核对开销，拍得最多的还是吃的。你们约好下次再见；这趟花了钱，心情和熟络程度也确实往前走了一点。",
          ].join("\n\n"),
          outcome: `金币 -3，${sanSummary}。`,
          settlement: [
            "结果：金币 -3",
            `结果：${sanSummary}`,
            `结果：${socialText}`,
            ...(fullSanTier ? ["额外：条件：SAN ≥ 18｜结果：SAN上限 +1"] : []),
          ].join("\n"),
          effects: {
            money: -3,
            social: socialResult.effectiveChange,
            ...(fullSanTier ? { sanCapDelta: 1 } : {}),
            ...(sanRecovery === 0 ? {} : { san: sanRecovery }),
          },
        })],
      };
    }
    default:
      return null;
  }
}

export function refreshSummerVacationEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  if (event.chainId !== "summer-vacation" || event.stage !== "result") return event;

  const kind = event.id.includes("-home-result-")
    ? "summer-vacation-home"
    : event.id.includes("-research-result-")
      ? "summer-vacation-research"
      : event.id.includes("-travel-result-")
        ? "summer-vacation-travel"
        : null;
  if (!kind) return event;

  const resolution = resolveSummerVacationFixedEvent(state, { kind }, () => 0);
  const refreshed = resolution?.enqueueEvents?.[0];
  if (!refreshed) return event;
  return {
    ...event,
    title: refreshed.title,
    description: refreshed.description,
    choices: refreshed.choices.map((choice, index) => ({ ...choice, id: event.choices[index]?.id ?? choice.id })),
  };
}
