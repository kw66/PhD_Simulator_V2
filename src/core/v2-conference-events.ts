import { createConferenceActivityEvent } from "./v2-conference-activity-events";
import type { ConferenceActivityBuildState, ConferenceActivityContext } from "./v2-conference-activity-shared";
import { getConferenceInfo, getConferenceLocation } from "./v2-conference-catalog";
import { getConferenceTripId } from "./v2-conference-identity";
import { getPaperConferencePromotionMultiplier } from "./v2-publication-system";
import { getConferencePaperPresentationResults, getConferencePaperPresentationTitles } from "./v2-conference-activity-shared";
import type { EventCounters, EventSupportState, GameState, PaperAcceptType, PendingEvent, PaperTarget, ShopState } from "./v2-types";
import type { ConferenceDecisionMode, ConferenceRegionId } from "./v2-conference-system";
import { getConferenceBaseCosts, resolveConferenceDecisionCost } from "./v2-conference-system";

export interface ConferenceAcceptedPaperCandidate {
  id: string;
  target: PaperTarget;
  submittedMonth: number;
  submittedYear: number;
  title?: string;
  acceptType?: PaperAcceptType;
}

export interface ConferenceEventContext extends ConferenceActivityContext {
  region: ConferenceRegionId;
  locationSeed?: number | null;
  paperIds: string[];
}

export interface ConferenceEventBuilderState extends ConferenceActivityBuildState {
  favor: number;
  money?: number;
  advisorFunding?: number;
  advisorProgressState?: Pick<GameState["advisorProgressState"], "funding" | "paidPlayerConferenceTrips">;
  conferenceLocationSeed?: number | null;
  shopState: ShopState;
  eventSupport: EventSupportState;
  eventCounters: EventCounters;
  fellowProgressState?: GameState["fellowProgressState"];
  fellowPapers?: GameState["fellowPapers"];
  papers?: GameState["papers"];
  externalPublications?: GameState["externalPublications"];
}

function getRegionName(region: ConferenceRegionId): string {
  if (region === "domestic") return "国内";
  if (region === "asia") return "亚太";
  return "欧美";
}

function getPaperTargetPriority(target: PaperTarget): number {
  if (target === "A") return 3;
  if (target === "B") return 2;
  return 1;
}

function createPaperHandledUpdates(context: ConferenceEventContext, conferenceHandled = true) {
  return [...new Set(context.paperIds)].map((id) => ({ id, conferenceHandled }));
}

function getConferenceSettlementItems(decision: ReturnType<typeof resolveConferenceDecisionCost>): string[] {
  const items = [
    ...(decision.resource === "favor" ? [`导师好感 -${decision.actualCost}`]
      : decision.actualCost > 0 ? [`金币 -${decision.actualCost}`] : []),
    ...(decision.fundingCost > 0 ? [`科研经费 -${decision.fundingCost}`] : []),
  ];
  return items.length > 0 ? items : ["无额外费用"];
}

function createConferenceDecisionAct3(
  context: ConferenceEventContext,
  state: ConferenceEventBuilderState,
  decision: ReturnType<typeof resolveConferenceDecisionCost>,
  getRoll: () => number,
): PendingEvent {
  const modeText = decision.mode === "self" ? "自费参会" : decision.mode === "advisor" ? "导师报销" : "找人代贴";
  const settlementItems = getConferenceSettlementItems(decision);
  const settlementSummary = settlementItems.join("，");
  const travelCost = state.advisorProgressState?.paidPlayerConferenceTrips?.includes(getConferenceTripId(context))
    ? 0 : getConferenceBaseCosts(context.region).selfPay;
  const presentationResults = getConferencePaperPresentationResults(context);
  const resultItems = [
    `结果：${settlementSummary}`,
    ...presentationResults.map((result) => `结果：${result}`),
  ];

  return {
    id: `${context.id}-act3-${decision.mode}`,
    title: `${context.conferenceName}安排 ➜ 参会方式 ➜ 参会确认`,
    description: [
      decision.mode === "proxy"
        ? "你联系了一位实验室外的参会者，对方恰好也去现场，答应顺手帮忙，不收费用。你把海报和展示时间发过去，又补了几条可能被问到的问题。"
        : "参会方式定下来了，你照着会务邮件准备材料。电脑里存了一份，邮箱里再留一份，毕竟会场的网速还没见识过。",
      decision.mode === "proxy"
        ? "对方回了句“收到”，说贴好后给你拍张照片。你又检查了一遍文件，把联系方式留在邮件末尾，免得现场有人追问时找不到你。"
        : `你把车票、住宿和展示时间逐项核对，算下来差旅 ${travelCost} 金币。${decision.mode === "advisor" ? "准备走导师报销，票据得仔细收好。" : "这笔钱自己出，你又翻了翻订房记录，确认没多订一晚。"}`,
      "机制结算",
      ...resultItems,
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: context.id,
    stage: "act3",
    discardPaperUpdates: createPaperHandledUpdates(context, false),
    completionLog: decision.countsAsMeeting
      ? [modeText, settlementSummary, ...presentationResults, "论文展示已完成"].join("；")
      : [modeText, settlementSummary, ...presentationResults, "论文参会已处理"].join("；"),
    choices: decision.countsAsMeeting
      ? [{
          id: "enter-venue",
          label: "确定",
          outcome: "进入会场安排。",
          effects: {
            recordPlayerConferenceTrip: getConferenceTripId(context),
            paperUpdates: createPaperHandledUpdates(context),
            ...(decision.resource === "money" && decision.actualCost > 0 ? { money: -decision.actualCost } : {}),
            ...(decision.resource === "favor" && decision.actualCost > 0 ? { favor: -decision.actualCost } : {}),
            ...(decision.fundingCost > 0 ? { advisorProgressStateDeltas: { funding: -decision.fundingCost } } : {}),
            counterDeltas: {
              meetingCount: 1,
              ...(context.region === "domestic" ? { domesticMeetingCount: 1 } : context.region === "asia" ? { asiaMeetingCount: 1 } : { westMeetingCount: 1 }),
            },
            enqueueEvents: [createConferenceActivityEvent(context, state, settlementItems, getRoll)],
          },
        }]
      : [{
          id: "proxy-finish",
          label: "确定",
          outcome: `实验室外的人免费代贴，${settlementSummary}。`,
          effects: {
            paperUpdates: createPaperHandledUpdates(context),
          },
        }],
  };
}

function createConferenceDecisionAct2(
  context: ConferenceEventContext,
  state: ConferenceEventBuilderState,
  getRoll: () => number,
): PendingEvent {
  const travelAlreadyPaid = state.advisorProgressState?.paidPlayerConferenceTrips?.includes(getConferenceTripId(context)) ?? false;
  const baseInput = {
    region: context.region,
    travelAlreadyPaid,
    favor: state.favor,
    social: state.social,
    shopState: state.shopState,
    eventSupport: state.eventSupport,
    eventCounters: state.eventCounters,
  };
  const favorRolls = Array.from({ length: 3 }, () => getRoll());
  let favorRollIndex = 0;
  const selfDecision = resolveConferenceDecisionCost({ ...baseInput, mode: "self" });
  const advisorDecision = resolveConferenceDecisionCost({ ...baseInput, mode: "advisor" }, () => favorRolls[favorRollIndex++]!);
  const proxyDecision = resolveConferenceDecisionCost({ ...baseInput, mode: "proxy" });
  const regionName = getRegionName(context.region);
  const baseCosts = getConferenceBaseCosts(context.region);
  const selfCostHint = `差旅 ${travelAlreadyPaid ? 0 : baseCosts.selfPay} 金币，同一场会议只收一次，可以自付或申请导师报销。`;
  const proxyCostHint = "也可以找实验室外的人免费代贴，对方恰好也去，愿意顺手帮忙。";
  const advisorHint = state.favor >= 6
    ? "你平时和导师聊得还算顺，开口问报销不至于太拘谨，不过总归又要麻烦老师一次。"
    : "你和导师还不算熟，报销申请在聊天框里打了又删，想着怎么开口才不显得太冒失。";

  const createChoice = (mode: ConferenceDecisionMode, decision: ReturnType<typeof resolveConferenceDecisionCost>) => ({
    id: mode,
    label: mode === "self" ? "自费参会" : mode === "advisor" ? "导师报销" : "找人代贴",
    outcome: `${getConferenceSettlementItems(decision).join("，")}。`,
    effects: {
      enqueueEvents: [createConferenceDecisionAct3(context, state, decision, getRoll)],
    },
  });

  return {
    id: `${context.id}-act2`,
    title: `${context.conferenceName}安排 ➜ 参会方式`,
    description: [
      `你查好去${context.city}的行程，把${regionName}参会的费用加了一遍。` + (context.paperCount >= 2
        ? `同会的 ${context.paperCount} 篇论文得一起安排，展示材料也要逐份核对。`
        : "这次有 1 篇论文要展示，你还挺想亲口讲讲自己的工作。") + selfCostHint,
      `${advisorHint}${proxyCostHint}只是这样一来，会场里那些想当面聊聊的人，就只能等下次再见了。`,
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: context.id,
    stage: "act2",
    discardPaperUpdates: createPaperHandledUpdates(context, false),
    choices: [
      createChoice("self", selfDecision),
      createChoice("advisor", advisorDecision),
      createChoice("proxy", proxyDecision),
    ],
  };
}

export function createConferenceDecisionAct1(
  context: ConferenceEventContext,
  state: ConferenceEventBuilderState,
  getRoll: () => number = Math.random,
): PendingEvent {
  const rolls: number[] = [];
  const root = buildConferenceDecisionAct1(context, state, () => {
    const roll = getRoll();
    rolls.push(roll);
    return roll;
  });
  while (rolls.length < 16) rolls.push(getRoll());
  const attach = (event: PendingEvent, mode?: ConferenceDecisionMode): PendingEvent => event.chainId !== context.id ? event : {
    ...event,
    conferencePreview: { context, rolls, mode },
    choices: event.choices.map((choice) => ({
      ...choice,
      effects: {
        ...choice.effects,
        ...(choice.effects.enqueueEvents ? {
          enqueueEvents: choice.effects.enqueueEvents.map((next) => attach(next,
            choice.id === "self" || choice.id === "advisor" || choice.id === "proxy" ? choice.id : mode)),
        } : {}),
      },
    })),
  };
  return attach(root);
}

export function refreshConferenceDecision<Event extends PendingEvent>(state: GameState, event: Event): Event {
  const preview = event.conferencePreview;
  if (!preview) return event;
  let rollIndex = 0;
  let rebuilt = createConferenceDecisionAct1(preview.context, {
    ...state,
    research: state.player.research,
    social: state.player.social,
    favor: state.player.favor,
    money: state.player.money,
    advisorFunding: state.advisorProgressState.funding,
  }, () => preview.rolls[rollIndex++] ?? preview.rolls.at(-1)!);
  if (event.stage === "act2" || event.stage === "act3") rebuilt = rebuilt.choices[0]!.effects.enqueueEvents![0]!;
  if (event.stage === "act3") {
    const result = rebuilt.choices.find((choice) => choice.id === preview.mode)?.effects.enqueueEvents?.[0];
    if (!result) return event;
    rebuilt = result;
  }
  const merge = (current: PendingEvent, fresh: PendingEvent): PendingEvent => ({
    ...current,
    title: fresh.title, description: fresh.description, completionLog: fresh.completionLog,
    conferencePreview: fresh.conferencePreview,
    discardPaperUpdates: fresh.discardPaperUpdates,
    choices: fresh.choices.map((choice, index) => ({
      ...choice,
      id: current.choices[index]?.id ?? choice.id,
      effects: {
        ...choice.effects,
        ...(choice.effects.enqueueEvents ? {
          enqueueEvents: choice.effects.enqueueEvents.map((next, nextIndex) => {
            const previous = current.choices[index]?.effects.enqueueEvents?.[nextIndex];
            return previous?.conferencePreview ? merge(previous, next) : next;
          }),
        } : {}),
      },
    })),
  });
  return merge(event, rebuilt) as Event;
}

function buildConferenceDecisionAct1(
  context: ConferenceEventContext,
  state: ConferenceEventBuilderState,
  getRoll: () => number = Math.random,
): PendingEvent {
  return {
    id: `${context.id}-act1`,
    title: `${context.conferenceName}安排`,
    description: [
      `会议临近，会务邮件催你确认展示安排。这次是 ${context.conferenceName} ${context.conferenceYear}，地点在${context.city}，${context.country}。`,
      context.paperCount >= 2
        ? `同一场会议有 ${context.paperCount} 篇论文要展示，你在日历上挨个标好。平时看着挺空的几格，忽然写得密密麻麻。`
        : "这次有一篇论文要展示。你把自己的名字从日程里找出来，又核了一遍时间，才把那封长长的会务邮件往下翻。",
      ...getConferencePaperPresentationTitles(context),
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: context.id,
    stage: "act1",
    discardPaperUpdates: createPaperHandledUpdates(context, false),
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "选择参会方式。",
      effects: {
        enqueueEvents: [createConferenceDecisionAct2(context, state, getRoll)],
      },
    }],
  };
}

export function buildConferenceDecisionEventsForAcceptedPapers(
  papers: ConferenceAcceptedPaperCandidate[],
  state: ConferenceEventBuilderState,
  getRoll: () => number = Math.random,
): PendingEvent[] {
  const groupedContexts = new Map<string, ConferenceEventContext>();
  const seenPaperIds = new Set<string>();

  for (const paper of papers) {
    if (seenPaperIds.has(paper.id)) continue;
    seenPaperIds.add(paper.id);
    const conferenceInfo = getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear);
    const conferenceLocation = getConferenceLocation(
      paper.submittedMonth,
      paper.target,
      paper.submittedYear,
      state.conferenceLocationSeed,
    );
    const key = getConferenceTripId({ conferenceName: conferenceInfo.name, conferenceYear: conferenceInfo.year, city: conferenceLocation.city });
    const existing = groupedContexts.get(key);
    if (existing) {
      existing.paperCount += 1;
      existing.paperIds.push(paper.id);
      existing.paperPresentations?.push({
        id: paper.id,
        title: paper.title ?? "论文",
        acceptType: paper.acceptType ?? "Poster",
        citationPromotionMultiplier: getPaperConferencePromotionMultiplier(paper.acceptType),
      });
      if (getPaperTargetPriority(paper.target) > getPaperTargetPriority(existing.grade)) {
        existing.grade = paper.target;
      }
      continue;
    }

    groupedContexts.set(key, {
      id: `conference-${paper.submittedYear}-${paper.submittedMonth}-${paper.target}-${conferenceLocation.city}`,
      conferenceName: conferenceInfo.name,
      conferenceYear: conferenceInfo.year,
      city: conferenceLocation.city,
      country: conferenceLocation.country,
      region: conferenceLocation.region,
      locationSeed: state.conferenceLocationSeed,
      grade: paper.target,
      paperCount: 1,
      paperIds: [paper.id],
      paperPresentations: [{
        id: paper.id,
        title: paper.title ?? "论文",
        acceptType: paper.acceptType ?? "Poster",
        citationPromotionMultiplier: getPaperConferencePromotionMultiplier(paper.acceptType),
      }],
    });
  }

  return Array.from(groupedContexts.values()).map((context) => createConferenceDecisionAct1(context, state, getRoll));
}
