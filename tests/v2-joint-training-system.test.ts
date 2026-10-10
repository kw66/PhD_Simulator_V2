import { describe, expect, it } from "vitest";

import { getJointTrainingCitationCapBonus } from "../src/core/v2-joint-training-system";
import { createJointTrainingAct1, refreshJointTrainingEvent } from "../src/core/v2-joint-training-events";
import { createConferenceMentorContact } from "../src/core/v2-conference-contacts";
import { createInitialState } from "../src/core/v2-engine-state-factory";

describe("v2 joint training system", () => {
  it.each([0, 1, 5])("keeps invitations open after %s prior refusals", (rejectedBigBullCoopCount) => {
    const event = createJointTrainingAct1({ rejectedBigBullCoopCount, pendingCitationCapBonus: 3 });
    const decline = event.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id === "decline")!;
    expect(decline.label).toBe("委婉拒绝");
    expect(decline.effects.enqueueEvents![0]!.title).toContain("委婉拒绝");
    const result = decline.effects.enqueueEvents![0]!;
    const context = result.jointTrainingPreview!.context;
    expect(result.narrativeNames).toEqual([context.contact!.name, context.replacement!.name]);
    expect(decline.effects.conferenceEncounterUpdates).toBeUndefined();
    expect(decline.effects.enqueueEvents![0]!.choices[0]!.effects.conferenceEncounterUpdates).toMatchObject({
      rejectedBigBullCoopCount: 0,
      permanentlyBlockedBigBullCoop: false,
      bigBullCoopCount: 0,
    });
    expect(decline.effects.enqueueEvents![0]!.description.split("机制结算")[1]?.trim()).toBe(
      `结果：合作学者：${context.replacement!.name}`,
    );
    expect(result.description).toContain(context.contact!.name);
    expect(result.description).toContain(context.replacement!.name);
    expect(result.description).toContain("转来另一位学者");
    expect(result.completionLog).toBe(`你婉拒了${context.contact!.name}的联培邀请，经引荐结识${context.replacement!.name}；合作学者：${context.replacement!.name}。`);
    expect(decline.outcome).toBe("婉拒联培，结识新的合作学者。");
    expect(result.choices[0]!.effects.conferenceEncounterUpdates?.bigBull).toEqual(context.replacement);
    expect(result.description).not.toMatch(/暂不联培|重置|清零|计数|拒绝次数/u);
  });

  it.each([
    [-1, 1], [0, 1], [199, 1], [200, 2], [399, 2], [400, 3], [799, 4], [800, 5], [999, 5], [1000, 6], [1600, 6],
  ])("awards the capped research bonus for %s citations", (citations, bonus) => {
    expect(getJointTrainingCitationCapBonus(citations)).toBe(bonus);
  });

  it.each([0, 1, 2] as const)("includes mentor level %s in the capped bonus", (level) => {
    expect(getJointTrainingCitationCapBonus(0, level)).toBe(level);
    expect(getJointTrainingCitationCapBonus(399, level)).toBe(level + 1);
    expect(getJointTrainingCitationCapBonus(1200, level)).toBe(6);
  });

  it.each([
    [0, "容易踩坑的实验细节"],
    [1, "换个角度就找到了突破口"],
    [2, "整个领域都在追问的问题"],
  ] as const)("describes level %s through ability without revealing numerical rewards", (level, story) => {
    const contact = { ...createConferenceMentorContact(), level };
    const root = createJointTrainingAct1({ rejectedBigBullCoopCount: 0, pendingCitationCapBonus: level + 1, contact });
    const decision = root.choices[0]!.effects.enqueueEvents![0]!;
    expect(decision.description).toContain(story);
    expect(decision.description).toContain(contact.name);
    expect(decision.description).not.toMatch(/等级|科研上限|永久|idea|机制结算|[0-9]/u);
    expect(decision.narrativeNames).toEqual([contact.name]);
    const result = decision.choices.find((choice) => choice.id === "accept")!.effects.enqueueEvents![0]!;
    expect(result.choices[0]!.effects).toMatchObject({ ideaBonus: 4 + level, writingBonus: 4 + level });
  });

  it.each([{}, { active: true }, { contactAvailable: false }])("keeps all joint-training scenes grounded and emoji within prose for %j", (availability) => {
    const root = createJointTrainingAct1({ rejectedBigBullCoopCount: 0, pendingCitationCapBonus: 3,
      origin: "会场讨论", ...availability });
    const decision = root.choices[0]!.effects.enqueueEvents![0]!;
    const results = decision.choices.flatMap((choice) => choice.effects.enqueueEvents ?? []);
    expect(root.description).toContain("会场讨论结束后");
    expect(decision.description).toContain("向两边解释清楚");
    for (const event of [root, decision, ...results]) {
      const narrative = event.description.split(/机制结算|小提示：/u)[0]!.trim();
      const paragraphs = narrative.split("\n\n");
      expect(paragraphs.length).toBeGreaterThanOrEqual(2);
      expect(paragraphs.length).toBeLessThanOrEqual(3);
      expect(narrative).toContain(root.jointTrainingPreview!.context.contact!.name);
      for (const paragraph of paragraphs) {
        expect(paragraph).not.toMatch(/[。！？]\s*\p{Extended_Pictographic}/u);
        expect(paragraph).not.toMatch(/\p{Extended_Pictographic}[\uFE0F\u200D\s]*$/u);
      }
    }
  });

  it("preserves the named replacement and refusal effects through refresh without mutating the event", () => {
    const contact = { ...createConferenceMentorContact({ id: "original" }), name: "林知远" };
    const replacement = { ...createConferenceMentorContact({ id: "replacement" }), name: "周明岚" };
    const root = createJointTrainingAct1({ rejectedBigBullCoopCount: 0, pendingCitationCapBonus: 3, contact, replacement });
    const result = root.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id === "decline")!.effects.enqueueEvents![0]!;
    const initial = createInitialState();
    const state = { ...initial, conferenceEncounterState: { ...initial.conferenceEncounterState, bigBull: contact } };
    const queued = { ...result, id: "queued-decline", queueOrder: 7 };
    const before = structuredClone(queued);
    const refreshed = refreshJointTrainingEvent(state, queued);
    expect(refreshed.id).toBe(queued.id);
    expect(refreshed.queueOrder).toBe(7);
    expect(refreshed.narrativeNames).toEqual(["林知远", "周明岚"]);
    expect(refreshed.description).toContain("林知远理解了你的选择，随后转来另一位学者周明岚");
    expect(refreshed.description.split("机制结算")[1]?.trim()).toBe("结果：合作学者：周明岚");
    expect(refreshed.choices[0]!.effects).toEqual(result.choices[0]!.effects);
    expect(refreshJointTrainingEvent(state, refreshed)).toEqual(refreshed);
    expect(queued).toEqual(before);
    const unavailableState = { ...state, conferenceEncounterState: { ...state.conferenceEncounterState, bigBull: replacement } };
    const unavailable = refreshJointTrainingEvent(unavailableState, refreshed);
    expect(unavailable.choices[0]!.effects).toEqual({});
    expect(unavailable.description.split("机制结算")[1]?.trim()).toBe("结果：无事发生");
    expect(unavailable.completionLog).not.toContain("经引荐");
  });
});
