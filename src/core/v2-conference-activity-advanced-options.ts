import { getConferenceMentorContact, getConferenceScholarContact } from "./v2-conference-contacts";
import { canTriggerConferenceInternshipInvite } from "./v2-internship-system";
import { applyTierResist, formatTierResistedOutcome } from "./v2-sanity-rules";
import { resolveConferenceActivityAttributes } from "./v2-conference-activity-shared";
import type { ConferenceActivityBuildState, ConferenceActivityContext, ConferenceActivityOptionDefinition } from "./v2-conference-activity-shared";

export function createAdvancedConferenceActivityOptions(
  state: ConferenceActivityBuildState,
  getRoll: () => number = Math.random,
  context?: ConferenceActivityContext,
): ConferenceActivityOptionDefinition[] {
  const typeRoll = getRoll();
  const levelRoll = getRoll();
  const identityRoll = getRoll();
  if (state.social < 6) return [];
  const encounter = state.conferenceEncounterState;
  const seed = { id: context?.id ?? "conference-contact", roll: identityRoll, levelRoll,
    selectedRoleId: state.selectedRoleId, playerGender: state.playerGender };
  const mentor = getConferenceMentorContact(encounter, seed);
  const nextCooperationCount = mentor.cooperationCount + 1;
  const jointTrainingInvite = state.research >= 12 && !encounter.jointTrainingReward && !encounter.bigBullCooperation && nextCooperationCount >= 3;
  const type = typeRoll < 0.5 ? "beautiful" : "smart";
  const scholar = getConferenceScholarContact(encounter, type, seed);
  const nextEncounterCount = scholar.encounterCount + 1;
  const hasLover = Boolean(state.loverState?.active || state.relationshipState.loverCount > 0);
  const loverInvite = state.social >= 12 && !hasLover;
  const intimacyChange = hasLover ? applyTierResist(-6, state.loverProgressState?.intimacy ?? 0, getRoll) : undefined;
  const nextEnterpriseCount = state.conferenceCareerState.enterpriseCount + 1;
  const internshipInvite = canTriggerConferenceInternshipInvite({ ...state,
    totalMonths: state.totalMonths ?? 0, papers: state.papers ?? [], externalPublications: state.externalPublications ?? [],
    internshipCount: state.internshipCount ?? 0,
  }, nextEnterpriseCount);
  const options: ConferenceActivityOptionDefinition[] = [
    {
      id: "big-bull-coop",
      label: "大牛合作",
      outcome: ["下次写论文 +8", ...(nextCooperationCount >= 2 ? ["社交 +1"] : []),
        ...(jointTrainingInvite ? ["联培邀请：已收到"] : [])].join("；") + "。",
      resultDescription: `你和${mentor.name}一起推敲草稿中的论证。这是你们第 ${nextCooperationCount} 次合作，对方把最需要补充的部分逐一标了出来。`,
      effects: {
        temporaryActionEffectUpdates: { writing: { bonus: 8 } },
        ...(nextCooperationCount >= 2 ? { social: 1 } : {}),
        conferenceEncounterUpdates: { bigBull: { ...mentor, cooperationCount: nextCooperationCount } },
        triggerJointTrainingInvite: jointTrainingInvite,
      },
    },
    {
      id: "opposite-scholar",
      label: "搭讪异性学者",
      outcome: [type === "beautiful" ? "SAN +5" : "下次想idea +2、额外 +2 次",
        ...(nextEncounterCount >= 2 ? ["社交 +1"] : []),
        ...(intimacyChange ? [formatTierResistedOutcome("恋人亲密度", -6, intimacyChange)] : []),
        ...(loverInvite ? ["关系邀请：已收到"] : [])].join("；") + "。",
      resultDescription: type === "beautiful"
        ? `你和活泼学者${scholar.name}聊起会场中的趣事，紧绷的心情放松了下来。这是你们第 ${nextEncounterCount} 次交流。`
        : `你和聪慧学者${scholar.name}一起讨论研究问题，记下新的思路和尝试。这是你们第 ${nextEncounterCount} 次交流。`,
      effects: {
        ...(type === "beautiful" ? { san: 5 } : { temporaryActionEffectUpdates: { idea: { bonus: 2, extraActions: 2 } } }),
        ...(nextEncounterCount >= 2 ? { social: 1 } : {}),
        ...(intimacyChange ? { loverIntimacyDelta: intimacyChange.effectiveChange } : {}),
        conferenceEncounterUpdates: { scholars: { ...encounter.scholars, [type]: { ...scholar, encounterCount: nextEncounterCount } } },
        ...(loverInvite ? { triggerLoverDevelopment: type } : {}),
      },
    },
    {
      id: "enterprise-networking",
      label: "与企业代表交流",
      outcome: "下次做实验 ×1.25" + (internshipInvite ? "；实习邀请：已收到。" : "。"),
      resultDescription: "你在企业展台问起实际应用中的问题，对方分享了实验设置与失效情况。你把新的尝试记进笔记，准备回去验证。",
      effects: {
        temporaryActionEffectUpdates: { experiment: { multiplier: 1.25 } },
        conferenceCareerUpdates: { enterpriseCount: nextEnterpriseCount },
        triggerInternshipInvite: internshipInvite,
      },
    },
  ];
  return options.map((option) => resolveConferenceActivityAttributes(option, state, getRoll));
}
