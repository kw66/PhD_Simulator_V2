import { gameRandom } from "./v2-game-random";
import { getConferenceMentorContact, getConferenceScholarContact } from "./v2-conference-contacts";
import { applyTierResist, formatTierResistedOutcome } from "./v2-sanity-rules";
import { resolveConferenceActivityAttributes } from "./v2-conference-activity-shared";
import type { ConferenceActivityBuildState, ConferenceActivityContext, ConferenceActivityOptionDefinition } from "./v2-conference-activity-shared";

export function createAdvancedConferenceActivityOptions(
  state: ConferenceActivityBuildState,
  getRoll: () => number = gameRandom,
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
  const cooperationResult = `与${mentor.name}合作达${nextCooperationCount}次`;
  const jointTrainingInvite = state.research >= 12 && !encounter.jointTrainingReward && !encounter.bigBullCooperation && nextCooperationCount >= 3;
  const type = typeRoll < 0.5 ? "beautiful" : "smart";
  const scholar = getConferenceScholarContact(encounter, type, seed);
  const nextEncounterCount = scholar.encounterCount + 1;
  const encounterResult = `与${scholar.name}搭讪达${nextEncounterCount}次`;
  const hasLover = Boolean(state.loverState?.active || state.relationshipState.loverCount > 0);
  const loverInvite = state.social >= 12 && nextEncounterCount >= 3 && !hasLover;
  const intimacyChange = hasLover ? applyTierResist(-6, state.loverProgressState?.intimacy ?? 0, getRoll) : undefined;
  const mentorOpening = mentor.cooperationCount === 0
    ? `等提问的人散去，你向${mentor.name}介绍了自己的工作。对方接过草稿，没有急着评价结果，而是在引言旁问：“你最想让读者相信哪一件事？”😅你准备好的介绍忽然有些接不上。`
    : `${mentor.name}认出了你，问起上次讨论的工作。这回你没从头介绍背景，直接翻到改过的论证。对方圈出一处跳跃：“你知道这一步为什么成立，读者可未必知道。”💬你们顺着这句话重新理了一遍。`;
  const mentorEnding = encounter.jointTrainingReward || encounter.bigBullCooperation
    ? "联培之后，你们已经习惯这样直奔问题。对方帮你划掉几段绕远的铺垫，把该提前交代的假设移到前面。原本越写越乱的故事终于有了清楚的顺序，📝你在页边记下了回去要改的地方。"
    : jointTrainingInvite
      ? "聊到会场工作人员开始收拾桌椅，对方仍在追问你的下一步打算。几次合作下来，你们已经很熟悉彼此的思路。“有没有考虑来我们这里待一段时间？”临走前，🤝对方把话题转到了联培上。"
      : "你们把问题、证据和结论重新排了一遍，发现最有力的实验一直被埋在后面。对方建议先把这个故事讲清楚，再谈更大的计划。收起满是批注的草稿时，✍️你已经想好了下一次该从哪里落笔。";
  const scholarOpening = type === "beautiful"
    ? (scholar.encounterCount === 0
      ? `你向邻座的${scholar.name}搭话，对方笑着问你是不是也在几个分会场之间迷了路。从难找的报告厅聊到茶歇点心，你们越说越投机。原本还在脑中反复回放的展示卡壳，😄这会儿也成了能拿来开玩笑的事。`
      : `${scholar.name}隔着茶歇区向你挥手，笑着问起上次聊过的近况。这回不用绞尽脑汁找开场白，你们从刚听完的报告聊到各自组里的趣事。对方接连抛来的玩笑，😄让你暂时忘了还没改完的论文。`)
    : (scholar.encounterCount === 0
      ? `你向${scholar.name}问起刚才报告中的一个细节，对方翻开笔记，反问你的方法换一种数据分布还能不能成立。你们借着会务手册的空白处画起示意图，原本只是随口搭话，💬却越聊越不愿停下来。`
      : `${scholar.name}还记得你上次提过的问题，见面便问后来有没有验证。你们挨着坐下，把新想到的假设写在同一页纸上。对方追问的一处反例让你愣了片刻，💡随即又想到了两种可以继续尝试的思路。`);
  const scholarEnding = loverInvite
    ? "下一场报告快开始了，你们却都没有立刻起身。对方收好笔记，试探着问会后能不能单独约个时间。💗你听出了这句话里不止是学术交流的意思。"
    : type === "beautiful"
      ? "你们一直聊到下一场报告入场。告别时，你才发现自己已经很久没有这样轻松地笑过；紧绷了一路的肩膀放松下来，🌤️连下午拥挤的议程都没那么难熬了。"
      : "谈话结束后，你把零散的箭头整理成几条新的问题，又圈出最值得试的两个切口。对方的追问还在脑中盘旋，回去之后，📝你想留出时间把这些念头好好展开。";
  const loverReaction = intimacyChange
    ? ((state.loverProgressState?.intimacy ?? 0) + intimacyChange.effectiveChange < 0
      ? "恋人得知你这次带着暧昧意味的搭讪后，沉默了很久。那些积压的不满终于一起涌了出来，对方说不想再继续这段关系。你看着聊天框，💔没能把人挽留下来。"
      : "恋人得知这次搭讪后，问你为什么聊得这样亲近。你试着解释只是会场交流，对方却没有像往常那样接话。晚上的消息变得简短，😔你能感觉到彼此之间多了一点隔阂。")
    : "";
  const options: ConferenceActivityOptionDefinition[] = [
    {
      id: "big-bull-coop",
      label: "大牛合作",
      outcome: ["下次写论文 +8", cooperationResult, ...(nextCooperationCount >= 2 ? ["社交 +1"] : []),
        ...(jointTrainingInvite ? ["联培邀约"] : [])].join("；") + "。",
      resultDescription: `${mentorOpening}\n\n${mentorEnding}`,
      effects: {
        temporaryActionEffectUpdates: { writing: { bonus: 8 } },
        ...(nextCooperationCount >= 2 ? { social: 1 } : {}),
        conferenceEncounterUpdates: { bigBull: { ...mentor, cooperationCount: nextCooperationCount } },
        triggerJointTrainingInvite: jointTrainingInvite,
      },
    },
    {
      id: "opposite-scholar",
      label: "异性学者",
      outcome: [type === "beautiful" ? "SAN +5" : "下次想idea +2分；下次想idea +2 次",
        encounterResult,
        ...(nextEncounterCount >= 2 ? ["社交 +1"] : []),
        ...(intimacyChange ? [formatTierResistedOutcome("恋人亲密度", -6, intimacyChange)] : []),
        ...(loverInvite ? ["会后有约"] : [])].join("；") + "。",
      resultDescription: [scholarOpening, scholarEnding, loverReaction].filter(Boolean).join("\n\n"),
      effects: {
        ...(type === "beautiful" ? { san: 5 } : { temporaryActionEffectUpdates: { idea: { bonus: 2, extraActions: 2 } } }),
        ...(nextEncounterCount >= 2 ? { social: 1 } : {}),
        ...(intimacyChange ? { loverIntimacyDelta: intimacyChange.effectiveChange } : {}),
        conferenceEncounterUpdates: { scholars: { ...encounter.scholars, [type]: { ...scholar, encounterCount: nextEncounterCount } } },
        ...(loverInvite ? { triggerLoverDevelopment: type } : {}),
      },
    },
  ];
  return options.map((option) => {
    const resolved = resolveConferenceActivityAttributes(option, state, getRoll);
    const parts = resolved.outcome.replace(/[。.]+$/u, "").split("；");
    const socialText = parts.find((part) => part.startsWith("社交 "));
    let settlementItems: string[];
    if (option.id === "big-bull-coop") {
      settlementItems = [
        `结果：下次写论文 +8｜${cooperationResult}`,
        ...(socialText ? [`额外：条件：与${mentor.name}合作 ≥ 2次｜结果：${socialText}`] : []),
        ...(jointTrainingInvite ? [`额外：条件：科研 ≥ 12｜与${mentor.name}合作 ≥ 3次｜尚未联培｜结果：联培邀约`] : []),
      ];
    } else if (option.id === "opposite-scholar") {
      const intimacyText = parts.find((part) => part.startsWith("恋人亲密度"));
      const lostLover = intimacyChange && (state.loverProgressState?.intimacy ?? 0) + intimacyChange.effectiveChange < 0;
      settlementItems = [
        `条件：${type === "beautiful" ? "活泼" : "聪慧"}学者（50%）`,
        `结果：${type === "beautiful" ? "SAN +5" : "下次想idea +2分｜下次想idea +2 次"}｜${encounterResult}`,
        ...(socialText ? [`额外：条件：与${scholar.name}搭讪 ≥ 2次｜结果：${socialText}`] : []),
        ...(intimacyText ? [`额外：条件：已有恋人｜结果：${intimacyText}`] : []),
        ...(lostLover ? ["额外：条件：亲密 < 0｜结果：恋人 -1"] : []),
        ...(loverInvite ? [`额外：条件：社交 ≥ 12｜与${scholar.name}搭讪 ≥ 3次｜没有恋人｜结果：会后有约`] : []),
      ];
    } else {
      settlementItems = [];
    }
    return { ...resolved, settlementItems };
  });
}
