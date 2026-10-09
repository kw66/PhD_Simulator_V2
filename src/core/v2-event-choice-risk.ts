import { applyFixedEventResolution } from "./v2-fixed-events";
import { getCcigActivityChainId, getCcigChainId } from "./v2-fixed-events-ccig-shared";
import { roundMoney } from "./v2-money";
import { projectPaperReviewSettlement } from "./v2-publication-system";
import { createRandomEventById } from "./v2-random-event-router";
import { previewReadPaperActions } from "./v2-reading-system";
import { clampResearchToCap } from "./v2-research-cap-system";
import { getShopEmergencySan, getShopRestSanGain } from "./v2-shop-items-effects";
import type { EventChoice, FixedEventResolution, GameState, PendingEvent } from "./v2-types";

export type EventChoiceRisk = "certain" | "possible" | null;

export interface EventChoiceRiskReason {
  resource: "funding" | keyof GameState["player"];
  risk: NonNullable<EventChoiceRisk>;
  threshold: number;
  projectedMin: number;
  projectedMax: number;
  text: string;
}

export interface EventChoiceRiskDetails {
  risk: NonNullable<EventChoiceRisk>;
  reasons: EventChoiceRiskReason[];
  explanation: string;
}

const riskResources: {
  resource: EventChoiceRiskReason["resource"];
  label: string;
  consequence: string;
  value: (state: GameState) => number | null;
}[] = [
  { resource: "funding", label: "实验室科研经费", consequence: "实验室破产", value: (state) => state.selectedAdvisorName && state.totalMonths > 0 ? roundMoney(state.advisorProgressState.funding) : null },
  { resource: "san", label: "SAN", consequence: "不堪重负", value: (state) => getShopEmergencySan(state.shopState, state.player.san) },
  { resource: "money", label: "金币", consequence: "穷困潦倒", value: (state) => roundMoney(state.player.money) },
  { resource: "favor", label: "导师好感", consequence: "逐出师门", value: (state) => state.player.favor },
  { resource: "social", label: "社交能力", consequence: "被孤立", value: (state) => state.player.social },
  { resource: "research", label: "科研能力", consequence: "用脑过度", value: (state) => state.player.research },
];

function formatProjectedValue(value: number): string {
  const rounded = roundMoney(value);
  return rounded === 0 && value !== 0 ? value < 0 ? "略低于 0" : "略高于 0" : String(rounded);
}

function rebaseValue(current: unknown, previous: unknown, intended: unknown): unknown {
  if (typeof current === "number" && typeof previous === "number" && typeof intended === "number") {
    return current + (intended - previous);
  }
  if (current && previous && intended && typeof current === "object" && typeof previous === "object"
    && typeof intended === "object" && !Array.isArray(current) && !Array.isArray(previous) && !Array.isArray(intended)) {
    const result = { ...current } as Record<string, unknown>;
    for (const key of new Set([...Object.keys(previous), ...Object.keys(intended)])) {
      result[key] = rebaseValue(result[key], (previous as Record<string, unknown>)[key], (intended as Record<string, unknown>)[key]);
    }
    return result;
  }
  return JSON.stringify(current) === JSON.stringify(previous) ? structuredClone(intended) : current;
}

function applyPendingPatch(state: GameState, event: PendingEvent): GameState {
  const next = structuredClone(state);
  for (const change of event.deferredStatePatch ?? []) {
    if (!["player", "sanCap", "advisorProgressState", "shopState", "actionState", "researchCapacityState", "selectedAdvisorName", "totalMonths"].includes(change.path[0] ?? "")) continue;
    let target = next as unknown as Record<string, unknown>;
    let valid = true;
    for (const segment of change.path.slice(0, -1)) {
      const child = target[segment];
      if (!child || typeof child !== "object" || Array.isArray(child)) { valid = false; break; }
      target = child as Record<string, unknown>;
    }
    const key = change.path.at(-1);
    if (valid && key) target[key] = rebaseValue(target[key], change.previousValue, change.value);
  }
  next.player.san = Math.min(next.sanCap, next.player.san);
  next.player.research = clampResearchToCap(next.player.research, next.researchCapacityState);
  next.player.social = Math.min(20, next.player.social);
  next.player.favor = Math.min(20, next.player.favor);
  return next;
}

function projectEffects(state: GameState, effects: EventChoice["effects"]): GameState {
  const sanCap = Math.max(0, state.sanCap + (effects.sanCapDelta ?? 0));
  let next: GameState = {
    ...state, sanCap,
    player: {
      san: effects.restoreSanToCap ? sanCap : Math.min(sanCap, state.player.san + (effects.san ?? 0)),
      research: clampResearchToCap(state.player.research + (effects.research ?? 0), state.researchCapacityState),
      social: Math.min(20, state.player.social + (effects.social ?? 0)),
      favor: Math.min(20, state.player.favor + (effects.favor ?? 0)),
      money: roundMoney(state.player.money + roundMoney(effects.money ?? 0)),
    },
    advisorProgressState: { ...state.advisorProgressState,
      funding: roundMoney(state.advisorProgressState.funding + roundMoney(effects.advisorProgressStateDeltas?.funding ?? 0)),
    },
  };
  if (effects.restAction && state.actionState.used < state.actionState.limit) {
    next.player.san = Math.min(sanCap, next.player.san + getShopRestSanGain(state.shopState));
    next.actionState = { ...state.actionState, used: state.actionState.used + 1 };
  }
  if (effects.readPaperActions) {
    next = previewReadPaperActions(next, effects.readPaperActions, {
      consumeMonthlyAction: false, allowSanOverdraw: true, random: () => 0,
    }).nextState;
  }
  if (effects.paperReviewSettlement) next = projectPaperReviewSettlement(next, effects.paperReviewSettlement);
  return next;
}

function fixedBranchRolls(resolution: FixedEventResolution): number[] {
  switch (resolution.kind) {
    case "teachers-day-message": return [0, 0.999999];
    case "winter-vacation-rest": return [0, 0.3, 0.6];
    case "scholarship-apply": return [0, 0.999999];
    default: return [0];
  }
}

function projectChoice(state: GameState, event: PendingEvent, choice: EventChoice, visited: Set<PendingEvent>): GameState[] {
  const projected = projectEffects(applyPendingPatch(state, event), choice.effects);
  if (visited.has(event) || event.stage === "act1") return [projected];
  const nextVisited = new Set([...visited, event]);
  const resolution = choice.effects.fixedEventResolution;
  const resolutionChainId = resolution?.kind.startsWith("ccig-")
    ? (resolution.kind.startsWith("ccig-activity-") ? getCcigActivityChainId : getCcigChainId)(resolution.ccigCalendar ?? projected)
    : event.chainId;
  const branches = resolution && !/^(student-name|advisor)-(confirm|reroll)$/u.test(resolution.kind)
    ? fixedBranchRolls(resolution).map((roll) => applyFixedEventResolution(structuredClone(projected), resolution, () => roll))
    : [{ nextState: projected, enqueueEvents: [] }];
  return branches.flatMap((branch) => {
    const results = [
      ...(branch.enqueueEvents ?? []).filter((nextEvent) => nextEvent.chainId === resolutionChainId),
      ...(choice.effects.enqueueEvents ?? []).filter((nextEvent) => nextEvent.chainId === event.chainId),
    ].filter((nextEvent) => nextEvent.stage === "result" || nextEvent.stage === "act3");
    if (results.length !== 1) return [branch.nextState];
    const result = results[0]!;
    const confirmations = result.choices.filter((candidate) => !(candidate.effects.enqueueEvents ?? []).some((nextEvent) => nextEvent.stage === "act2"));
    return confirmations.length === 1
      ? projectChoice(branch.nextState, result, confirmations[0]!, nextVisited) : [branch.nextState];
  });
}

function randomChoiceVariants(state: GameState, event: PendingEvent, choice: EventChoice): EventChoice[] {
  const eventId = event.randomReplay?.eventId ?? Number(event.chainId.match(/^random-(\d+)$/u)?.[1]);
  if (event.stage !== "act2" || ![6, 7, 13, 15].includes(eventId)) return [choice];
  return [0, 0.999999].map((roll) => {
    const rebuilt = createRandomEventById(eventId, { ...state,
      totalRandomEventCount: event.randomReplay?.serial ?? state.totalRandomEventCount,
    }, () => roll).event;
    const decision = rebuilt?.choices[0]?.effects.enqueueEvents?.[0];
    return decision?.choices.find((candidate) => candidate.id === choice.id || candidate.label === choice.label) ?? choice;
  });
}

export function getEventChoiceRiskDetails(state: GameState, event: PendingEvent, choice: EventChoice): EventChoiceRiskDetails | null {
  if (state.phase !== "playing") return null;
  const snapshot = structuredClone(state);
  const outcomes = randomChoiceVariants(snapshot, event, choice)
    .flatMap((variant) => projectChoice(snapshot, event, variant, new Set()));
  const unsafeOutcomes = outcomes.map(() => false);
  const reasons: EventChoiceRiskReason[] = [];
  for (const { resource, label, consequence, value } of riskResources) {
    const values = outcomes.map(value);
    const unsafe = values.map((projected, index) => {
      const lethal = projected !== null && projected < 0;
      unsafeOutcomes[index] ||= lethal;
      return lethal;
    });
    if (!unsafe.some(Boolean)) continue;
    const risk = unsafe.every(Boolean) ? "certain" : "possible";
    const applicableValues = values.filter((projected): projected is number => projected !== null);
    const projectedMin = Math.min(...applicableValues);
    const projectedMax = Math.max(...applicableValues);
    const minimum = formatProjectedValue(projectedMin);
    const maximum = formatProjectedValue(projectedMax);
    const range = minimum === maximum ? minimum : `${minimum}～${maximum}`;
    reasons.push({ resource, risk, threshold: 0, projectedMin, projectedMax,
      text: risk === "certain"
        ? `${label}不足，结算后为${range}，将进入失败结局：${consequence}。`
        : `${label}可能不足（结算后${range}），可能进入失败结局：${consequence}。`,
    });
  }
  if (!reasons.length) return null;
  const risk = unsafeOutcomes.every(Boolean) ? "certain" : "possible";
  return { risk, reasons,
    explanation: reasons.map((reason) => reason.text).join("\n"),
  };
}

export function getEventChoiceRisk(state: GameState, event: PendingEvent, choice: EventChoice): EventChoiceRisk {
  return getEventChoiceRiskDetails(state, event, choice)?.risk ?? null;
}

export function getEventChoiceRiskExplanation(state: GameState, event: PendingEvent, choice: EventChoice): string | null {
  return getEventChoiceRiskDetails(state, event, choice)?.explanation ?? null;
}
