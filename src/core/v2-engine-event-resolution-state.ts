import { addOrReplaceBuffs, removeBuffs } from "./v2-buffs";
import { createCustomFellowProgressProfile, getFellowName, getUniqueFellowName } from "./v2-fellow-progression";
import { applyFixedEventResolution } from "./v2-fixed-events";
import { getGraduationScoreTarget, getMonthLimitByDegree, getRoleDefinition } from "./v2-progression";
import { createGrantedPublishedPaper } from "./v2-publication-rules";
import { applyPaperReviewSettlement } from "./v2-publication-system";
import { applyPaperCompetitionResolution } from "./v2-paper-competition";
import { applyMultipliersThenAdditions, combineEffectMultipliers } from "./v2-numeric-modifiers";
import { clampResearchToCap } from "./v2-research-cap-system";
import { applyReadPaperActions, applyReadingCountProgress } from "./v2-reading-system";
import { canAddRelationship, syncRelationshipState, tryAddRelationship } from "./v2-relationship-rules";
import { buildInternshipInviteContext, createInternshipInviteAct1 } from "./v2-internship-events";
import { activateInternship, activateRemoteInternship, hasOngoingInternship, increaseInternshipExperimentMultiplier } from "./v2-internship-system";
import { buildJointTrainingContext, createJointTrainingAct1 } from "./v2-joint-training-events";
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1 } from "./v2-lover-events";
import { createLoverProgressState } from "./v2-lover-progression";
import { getShopRestSanGain } from "./v2-shop-items-effects";
import { advanceSharedLabProject } from "./v2-lab-projects";
import { addPaperCollaboration, applyPaperEffectUpdates, setPaperTotalScores } from "./v2-paper-collaboration";
import type { Buff, EventChoice, GameState, PaperActionType, PendingEvent } from "./v2-types";

export interface ResolvedEventChoiceState {
  nextState: GameState;
  resolvedOutcome: string;
  resolvedEnqueueEvents: PendingEvent[];
  resolvedPresentation?: Pick<PendingEvent, "title" | "description" | "completionLog">;
}

function createTriggeredFollowUpEvents(state: GameState, choice: EventChoice): PendingEvent[] {
  const effects = choice.effects;
  const events: PendingEvent[] = [];
  const hasQueuedChain = (chainId: string): boolean => state.eventQueue.some((event) => event.chainId === chainId);
  if (
    effects.triggerInternshipInvite
    && !state.conferenceCareerState.permanentlyBlockedInternship
    && !hasOngoingInternship(state)
    && !hasQueuedChain("internship-invite")
  ) {
    events.push(createInternshipInviteAct1({
      ...buildInternshipInviteContext(state),
      ...(effects.followUpContext ? { origin: effects.followUpContext } : {}),
    }));
  }
  if (
    effects.triggerJointTrainingInvite
    && !state.conferenceEncounterState.permanentlyBlockedBigBullCoop
    && !state.conferenceEncounterState.bigBullCooperation
    && !hasQueuedChain("joint-training")
  ) {
    events.push(createJointTrainingAct1({
      ...buildJointTrainingContext(state),
      ...(effects.followUpContext ? { origin: effects.followUpContext } : {}),
    }));
  }
  if (effects.triggerLoverDevelopment) {
    const hasLover = state.loverState.active || state.relationshipState.loverCount > 0;
    if (!hasLover && !hasQueuedChain("lover-development")) {
      events.push(createLoverDevelopmentAct1(buildLoverDevelopmentContext({
        conferenceEncounterState: state.conferenceEncounterState,
        totalMonths: state.totalMonths,
        type: effects.triggerLoverDevelopment,
        playerGender: getRoleDefinition(state.selectedRoleId).gender,
        canAddRelationship: canAddRelationship(state.relationshipState, "lover"),
        ...(effects.followUpContext ? { origin: effects.followUpContext } : {}),
      })));
    }
  }
  return events;
}

const ACTION_LABELS: Record<PaperActionType, string> = {
  idea: "想 idea",
  experiment: "做实验",
  writing: "写论文",
};

function formatExtraActions(value: number): string {
  return `${value > 0 ? "多" : "少"} ${Math.abs(value)} 次`;
}

function createBuffsFromEventEffects(choice: EventChoice, state: GameState, source: string): Buff[] {
  const effects = choice.effects;
  const buffs: Buff[] = [];
  const idPrefix = `event-${choice.id}-${state.totalMonths}-${state.eventHistory.length}`;
  const add = (
    id: string,
    name: string,
    timing: Buff["timing"],
    description?: string,
    actionEffects?: Buff["actionEffects"],
    publicationEffects?: Buff["publicationEffects"],
  ): void => {
    buffs.push({
      id: `${idPrefix}-${id}`,
      name,
      source,
      timing,
      remainingMonths: null,
      description,
      actionEffects,
      publicationEffects,
    });
  };

  for (const [action, update] of Object.entries(effects.temporaryActionEffectUpdates ?? {})) {
    if (!update) continue;
    const typedAction = action as PaperActionType;
    const label = ACTION_LABELS[typedAction];
    const parts = [
      update.bonus ? `${update.bonus > 0 ? "+" : ""}${update.bonus}分` : "",
      update.multiplier !== undefined && update.multiplier !== 1 ? `总分 ×${update.multiplier}` : "",
      update.extraActions ? formatExtraActions(update.extraActions) : "",
    ].filter(Boolean);
    if (parts.length > 0) {
      add(`next-${action}`, `下次${label} ${parts.join(" · ")}`, "next-action", undefined, {
        [typedAction]: { ...update },
      });
    }
  }

  for (const [key, action] of [["ideaBonus", "idea"], ["experimentBonus", "experiment"], ["writingBonus", "writing"]] as const) {
    const value = effects[key];
    if (value) {
      add(`permanent-${key}`, `每次${ACTION_LABELS[action]} ${value > 0 ? "+" : ""}${value}分`, "permanent", undefined, {
        [action]: { bonus: value },
      });
    }
  }

  if (effects.nextPublicationPromotionMultiplier !== undefined) {
    add(
      "next-citation",
      `下篇论文宣传 ×${effects.nextPublicationPromotionMultiplier}`,
      "next-action",
      undefined,
      undefined,
      { nextPromotionMultiplier: effects.nextPublicationPromotionMultiplier },
    );
  }
  if (effects.citationDebuffMultiplier !== undefined) {
    add(
      "citation-penalty",
      `一作论文引用 ×${effects.citationDebuffMultiplier}`,
      "permanent",
      undefined,
      undefined,
      { citationDebuffMultiplier: effects.citationDebuffMultiplier },
    );
  }
  for (const [action, value] of Object.entries(effects.persistentExtraActionDeltas ?? {})) {
    if (value) {
      const typedAction = action as PaperActionType;
      add(`extra-${action}`, `每次${ACTION_LABELS[typedAction]} ${formatExtraActions(value)}`, "permanent", undefined, {
        [action]: { extraActions: value },
      });
    }
  }
  return buffs;
}

function applyDirectCoreEffects(state: GameState, choice: EventChoice, buffSource: string): GameState {
  const effects = choice.effects;
  const sanCap = Math.max(0, state.sanCap + (effects.sanCapDelta ?? 0));
  const transferToPhd = effects.transferToPhd === true && state.degree === "master";
  const degree = transferToPhd ? "phd" : state.degree;
  const player = {
    san: Math.min(sanCap, state.player.san + (effects.san ?? 0)),
    research: clampResearchToCap(state.player.research + (effects.research ?? 0), state.researchCapacityState),
    social: Math.min(20, state.player.social + (effects.social ?? 0)),
    favor: Math.min(20, state.player.favor + (effects.favor ?? 0)),
    money: state.player.money + (effects.money ?? 0),
  };
  if (effects.restoreSanToCap) player.san = sanCap;

  const eventSupport = { ...state.eventSupport, ...(effects.eventSupportUpdates ?? {}) };
  const shopState = {
    ...state.shopState,
    entitlements: { ...state.shopState.entitlements },
  };
  for (const [key, value] of Object.entries(effects.shopEntitlementDeltas ?? {})) {
    const typedKey = key as keyof typeof shopState.entitlements;
    shopState.entitlements[typedKey] = Math.max(0, shopState.entitlements[typedKey] + (value ?? 0));
  }
  let actionState = state.actionState;
  if (effects.restAction && state.actionState.used < state.actionState.limit) {
    const restSanGain = getShopRestSanGain(state.shopState);
    const restedSan = Math.min(sanCap, player.san + restSanGain);
    const appliedRestGain = restedSan - player.san;
    player.san = restedSan;
    actionState = { ...state.actionState, used: state.actionState.used + 1 };
    if (state.shopState.chairUpgrade === "hammock" && appliedRestGain > 0) {
      shopState.chairSanRecovered = Math.max(0, shopState.chairSanRecovered ?? 0) + appliedRestGain;
    }
  }
  const illnessProbability = Math.max(0, Math.min(100, applyMultipliersThenAdditions(
    state.illnessProbability,
    effects.illnessProbabilityMultiplier === undefined ? [] : [effects.illnessProbabilityMultiplier],
    effects.illnessProbabilityDelta === undefined ? [] : [effects.illnessProbabilityDelta],
    "floor",
  )));
  const eventCounters = { ...state.eventCounters };
  for (const [key, value] of Object.entries(effects.counterDeltas ?? {})) {
    const typedKey = key as keyof typeof eventCounters;
    eventCounters[typedKey] += value ?? 0;
  }
  const scholarshipState = effects.scholarshipAward
    ? {
        lastAwardYear: effects.scholarshipAward.year,
        scoreBaseline: Math.max(0, effects.scholarshipAward.scoreBaseline),
        claimedPaperIds: [...new Set([
          ...state.scholarshipState.claimedPaperIds,
          ...effects.scholarshipAward.paperIds,
        ])],
      }
    : { ...state.scholarshipState, claimedPaperIds: [...state.scholarshipState.claimedPaperIds] };

  let relationshipState = syncRelationshipState(state.relationshipState, player.social);
  for (const relationshipKind of effects.relationshipAdditions ?? []) {
    relationshipState = tryAddRelationship(relationshipState, relationshipKind).nextState;
  }
  let fellowProgressState = state.fellowProgressState;
  const usedFellowNames = fellowProgressState.map((profile) => getFellowName(profile));
  for (const addition of effects.fellowAdditions ?? []) {
    const relationshipResult = tryAddRelationship(relationshipState, addition.type);
    relationshipState = relationshipResult.nextState;
    if (relationshipResult.added) {
      fellowProgressState = [
        ...fellowProgressState,
        createCustomFellowProgressProfile({
          type: addition.type,
          gender: addition.gender,
          startTotalMonths: state.totalMonths,
          research: addition.research,
          affinity: addition.affinity,
          ...(addition.name ? { name: addition.name } : {}),
          ...(addition.taskType ? { taskType: addition.taskType } : {}),
          usedNames: usedFellowNames,
        }),
      ];
      usedFellowNames.push(fellowProgressState.at(-1)!.name ?? "");
    }
  }
  if (effects.mentorshipStacks) {
    relationshipState = {
      ...relationshipState,
      mentorshipStacks: relationshipState.mentorshipStacks + effects.mentorshipStacks,
    };
  }
  const researchCapacityState = { ...state.researchCapacityState };
  for (const [key, value] of Object.entries(effects.researchCapacityStateDeltas ?? {})) {
    const typedKey = key as keyof typeof researchCapacityState;
    researchCapacityState[typedKey] += value ?? 0;
  }
  const advisorProgressState = { ...state.advisorProgressState };
  for (const [key, value] of Object.entries(effects.advisorProgressStateDeltas ?? {})) {
    if (key === "researchAccumulation" || key === "funding") {
      advisorProgressState[key] = Math.max(0, advisorProgressState[key] + (value ?? 0));
    }
  }
  advisorProgressState.funding = Math.max(0, advisorProgressState.funding);

  const thesisProgress = Math.min(100, state.thesis.progress + (effects.thesisProgress ?? 0));
  const thesis = effects.abandonThesis
    ? { ...state.thesis, abandoned: true }
    : effects.thesisProgress
      ? { ...state.thesis, started: true, progress: thesisProgress, completed: thesisProgress >= 100 }
      : state.thesis;
  const careerProgress = effects.careerType && effects.careerProgress
    ? {
        ...state.careerProgress,
        [effects.careerType]: state.careerProgress[effects.careerType] + effects.careerProgress,
      }
    : state.careerProgress;
  const scopedPapers = effects.draftCitationDebuffMultiplier === undefined
    ? state.papers
    : state.papers.map((paper) => {
        if (
          paper.status === "draft"
          && paper.nonFirstAuthor !== true
          && (paper.idea > 0 || paper.experiment > 0 || paper.writing > 0)
        ) {
          return {
            ...paper,
            citationDebuffMultiplierOnPublish: combineEffectMultipliers([
              paper.citationDebuffMultiplierOnPublish ?? 1,
              effects.draftCitationDebuffMultiplier,
            ]),
          };
        }
        return paper;
      });
  const clearedPapers = effects.clearDraftProgress
    ? scopedPapers.map((paper) => paper.status === "draft"
      ? setPaperTotalScores(paper, { idea: 0, experiment: 0, writing: 0 })
      : paper)
    : scopedPapers;
  const paperUpdates = effects.paperUpdates ?? [];
  const papers = clearedPapers.map((paper) => {
    let nextPaper = applyPaperEffectUpdates(paper, paperUpdates);
    for (const collaboration of effects.paperCollaborations ?? []) {
      nextPaper = addPaperCollaboration(nextPaper, collaboration);
    }
    return nextPaper;
  });
  const updatedExternalPublications = state.externalPublications.map((paper) => applyPaperEffectUpdates(paper, paperUpdates));
  const externalPublications = effects.grantedPublication
    ? [
        ...updatedExternalPublications,
        createGrantedPublishedPaper(state.totalMonths, updatedExternalPublications.length, effects.grantedPublication,
          [...papers, ...updatedExternalPublications, ...(state.fellowPapers ?? [])]),
      ]
    : updatedExternalPublications;
  const conferenceEncounterState = {
    ...state.conferenceEncounterState,
    ...(effects.conferenceEncounterUpdates ?? {}),
  };
  const conferenceCareerState = {
    ...state.conferenceCareerState,
    ...(effects.conferenceCareerUpdates ?? {}),
  };
  let internshipState = state.internshipState;
  if (effects.internshipStateUpdates) {
    if (effects.triggerInternshipInvite) {
      if (hasOngoingInternship(state)) {
        internshipState = increaseInternshipExperimentMultiplier(state.internshipState);
      }
    } else if (!hasOngoingInternship(state)) {
      if (effects.internshipStateUpdates.kind === "remote3") {
        if (state.player.favor >= 6) internshipState = activateRemoteInternship(state.totalMonths);
      } else if (!state.conferenceCareerState.permanentlyBlockedInternship) {
        internshipState = activateInternship();
      }
    }
  }
  const mergedLoverState = { ...state.loverState, ...(effects.loverStateUpdates ?? {}) };
  const loverUsedNames = [
    ...fellowProgressState.map((profile) => getFellowName(profile)),
    state.selectedAdvisorName ?? "",
    state.playerName ?? "",
  ];
  const loverState = mergedLoverState.name
    ? { ...mergedLoverState, name: getUniqueFellowName(mergedLoverState.name, loverUsedNames, `lover:${mergedLoverState.type}:${mergedLoverState.startTotalMonths}:${mergedLoverState.gender}`) }
    : mergedLoverState;
  const loverProgressState = {
    ...(effects.activateLoverProgress ? createLoverProgressState(effects.activateLoverProgress) : state.loverProgressState),
    ...(effects.loverProgressStateUpdates ?? {}),
  };

  const addedFellowIds = fellowProgressState.length > state.fellowProgressState.length
    ? fellowProgressState.slice(state.fellowProgressState.length).map((profile) => profile.id)
    : [];
  const relationshipId = effects.activateLoverProgress
    ? "lover"
    : addedFellowIds.length === 1 ? addedFellowIds[0] : undefined;
  const additions = [
    ...(effects.addBuffs ?? []).map((buff) => relationshipId ? { ...buff, relationshipId } : buff),
    ...createBuffsFromEventEffects(choice, state, buffSource).map((buff) => relationshipId ? { ...buff, relationshipId } : buff),
  ];
  const buffs = removeBuffs(addOrReplaceBuffs(state.buffs, additions), effects.removeBuffIds ?? []);

  const directlyResolvedState: GameState = {
    ...state,
    player,
    actionState,
    sanCap,
    degree,
    phdStartYear: transferToPhd ? state.year + 1 : state.phdStartYear,
    maxMonths: transferToPhd ? getMonthLimitByDegree("phd") : state.maxMonths,
    graduationScoreTarget: transferToPhd
      ? getGraduationScoreTarget("phd", state.selectedAdvisorName)
      : state.graduationScoreTarget,
    totalResearchScore: Math.max(0, state.totalResearchScore + (effects.score ?? 0)),
    thesis,
    careerProgress,
    papers,
    externalPublications,
    relationshipState,
    shopState,
    aiShopState: state.aiShopState,
    fellowProgressState,
    researchCapacityState,
    advisorProgressState,
    conferenceEncounterState,
    conferenceCareerState,
    internshipState,
    loverState,
    loverProgressState,
    eventSupport,
    illnessProbability,
    eventCounters,
    scholarshipState,
    buffs,
  };
  let resolvedState = directlyResolvedState;
  if (effects.readPaperActions) {
    resolvedState = applyReadPaperActions(resolvedState, effects.readPaperActions, {
      consumeMonthlyAction: false,
      allowSanOverdraw: true,
      writeLog: false,
      source: buffSource,
    }).nextState;
  }
  if (!effects.readingCount) return resolvedState;
  return applyReadingCountProgress(resolvedState, effects.readingCount).nextState;
}

function mergeFixedCoreState(base: GameState, resolved: GameState): GameState {
  const relationshipState = syncRelationshipState(resolved.relationshipState, resolved.player.social);
  return {
    ...base,
    player: { ...resolved.player },
    playerName: resolved.playerName,
    sanCap: resolved.sanCap,
    selectedAdvisorName: resolved.selectedAdvisorName,
    phdStartYear: resolved.phdStartYear,
    graduationScoreTarget: resolved.graduationScoreTarget,
    relationshipState,
    advisorProgressState: { ...resolved.advisorProgressState },
    researchCapacityState: { ...resolved.researchCapacityState },
    fellowProgressState: resolved.fellowProgressState.map((profile) => ({ ...profile })),
    eventSupport: { ...resolved.eventSupport },
    illnessProbability: resolved.illnessProbability,
    eventCounters: { ...resolved.eventCounters },
    scholarshipState: {
      ...resolved.scholarshipState,
      claimedPaperIds: [...resolved.scholarshipState.claimedPaperIds],
    },
    buffs: resolved.buffs.map((buff) => ({
      ...buff,
      monthlyStats: buff.monthlyStats ? { ...buff.monthlyStats } : undefined,
      activeOperationSanMultiplier: buff.activeOperationSanMultiplier,
      actionEffects: buff.actionEffects
        ? Object.fromEntries(Object.entries(buff.actionEffects).map(([action, effect]) => [action, effect ? { ...effect } : effect]))
        : undefined,
      paperPolishEffects: buff.paperPolishEffects ? { ...buff.paperPolishEffects } : undefined,
      readingEffect: buff.readingEffect ? { ...buff.readingEffect } : undefined,
      relationshipOperationSanDelta: buff.relationshipOperationSanDelta,
      publicationEffects: buff.publicationEffects ? { ...buff.publicationEffects } : undefined,
      scheduledPublication: buff.scheduledPublication
        ? { ...buff.scheduledPublication, targetWeights: { ...buff.scheduledPublication.targetWeights } }
        : undefined,
    })),
    eventQueue: resolved.eventQueue,
  };
}

export function applyChoiceEffectsToState(
  state: GameState,
  choice: EventChoice,
  buffSource = "事件",
  currentEvent?: PendingEvent,
): ResolvedEventChoiceState {
  if (choice.effects.paperCompetitionResolution) {
    return {
      ...applyPaperCompetitionResolution(state, choice.effects.paperCompetitionResolution),
      resolvedEnqueueEvents: [],
    };
  }
  let nextState = applyDirectCoreEffects(state, choice, buffSource);
  if (choice.effects.labProjectProgress) {
    const { type, amount, guidanceRolls } = choice.effects.labProjectProgress;
    let rollIndex = 0;
    const random = guidanceRolls ? () => guidanceRolls[rollIndex++] ?? 0 : Math.random;
    nextState = advanceSharedLabProject(nextState, type, amount, random).state;
  }
  if (choice.effects.paperReviewSettlement) {
    nextState = applyPaperReviewSettlement(nextState, choice.effects.paperReviewSettlement);
  }
  let resolvedOutcome = choice.outcome;
  let resolvedEnqueueEvents: PendingEvent[] = [];
  let resolvedPresentation: ResolvedEventChoiceState["resolvedPresentation"];

  if (choice.effects.internshipStateUpdates && !choice.effects.triggerInternshipInvite
    && nextState.internshipState === state.internshipState) {
    resolvedOutcome = hasOngoingInternship(state)
      ? "已有实习安排，本次不新增、不延期，原实习保持不变。"
      : choice.effects.internshipStateUpdates.kind === "remote3"
        ? "导师好感不足，本次未确认远程实习。"
        : "企业实习机会已关闭，本次未开始实习。";
    resolvedPresentation = {
      title: "实习安排未变更",
      description: `确认前，你又核对了一遍眼下的安排，把这次申请暂时放下。\n\n机制结算\n${resolvedOutcome}`,
      completionLog: resolvedOutcome,
    };
    if (currentEvent?.stage === "result") {
      resolvedEnqueueEvents.push({
        ...resolvedPresentation,
        id: `${currentEvent.id}-unavailable`,
        source: currentEvent.source,
        blocking: true,
        deadlineMonths: 0,
        chainId: currentEvent.chainId,
        stage: "result",
        choices: [{ id: `${choice.id}-unavailable-close`, label: "确定", outcome: resolvedOutcome, effects: {} }],
      });
    }
  }

  if (choice.effects.fixedEventResolution) {
    const result = applyFixedEventResolution(nextState, choice.effects.fixedEventResolution);
    nextState = mergeFixedCoreState(nextState, result.nextState);
    resolvedOutcome = result.outcome;
    resolvedEnqueueEvents = result.enqueueEvents ?? [];
  }

  resolvedEnqueueEvents = [
    ...resolvedEnqueueEvents,
    ...createTriggeredFollowUpEvents(nextState, choice),
  ];

  return { nextState, resolvedOutcome, resolvedEnqueueEvents, resolvedPresentation };
}
