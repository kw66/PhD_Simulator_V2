import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { settleFellowCoauthoredPapers, settleLabResearchGrowth } from "../src/core/v2-lab-talent";
import { advanceFellowResearch } from "../src/core/v2-fellow-research";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { applyPublicationTalentRewards } from "../src/core/v2-publication-talent";
import { recordTalentTrigger } from "../src/core/v2-talent-history";
import { recordTalentTransitions } from "../src/core/v2-talent-transitions";
import type { GameState } from "../src/core/v2-types";

function state(): GameState {
  const base = createStartedGameState("normal");
  return { ...base, totalMonths: 13, year: 2, month: 1, eventQueue: [], playerName: "林青",
    player: { ...base.player, research: 10, san: 10 } };
}

function triggers(value: GameState) {
  return value.eventHistory.flatMap((entry) => entry.stages.flatMap((stage) => stage.talentTrigger ? [stage.talentTrigger] : []));
}

describe("talent trigger history", () => {
  it("shows a passive talent snapshot inline without a replay action or gameplay changes", () => {
    const base = state();
    const random = vi.spyOn(Math, "random");
    const next = recordTalentTrigger(base, "test", {
      name: "实验室传承", recipient: '<同学> & "姓名"', reason: "第2学年开始，结算实验室传承",
      effects: ["科研 +2（2→4）"], details: ["<script>unsafe</script>"],
    });
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(next.player).toBe(base.player);
    expect(next.eventQueue).toBe(base.eventQueue);
    expect(next.actionState).toBe(base.actionState);
    expect(next.log[0]).toMatchObject({ eventHistoryId: "talent:test", month: 13 });
    expect(recordTalentTrigger(next, "test", { name: "重复", recipient: "你", reason: "", effects: [] })).toBe(next);
    const html = renderApp(next, undefined, { activePlayTab: "events", isEventContentOpen: true, activeEventHistoryId: "talent:test" });
    expect(html).not.toContain('data-ui-open-event-history-id="talent:test"');
    expect(html).not.toContain('event-history-log-entry');
    expect(html).not.toContain('event-panel showing-content');
    expect(html).toContain("第2学年开始，结算实验室传承");
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(html.replace(/<[^>]*>/g, "")).toContain("科研 +2（2→4）");
    expect(html).toContain("&lt;同学&gt; &amp; &quot;姓名&quot;");
    expect(html).not.toContain("<script>unsafe</script>");
    expect(html).not.toContain('data-action="resolve-event"');
    expect(renderApp({ ...next, totalMonths: 14 }, undefined, { activeLogPage: 13 }).replace(/<[^>]*>/g, ""))
      .toContain("科研 +2（2→4）");
  });

  it("records publication rewards with SAN capped and research cap bonuses applied first", () => {
    const base = state();
    base.player.san = 19;
    base.player.research = 20;
    base.externalPublications = [attachPaperPublication({ ...createDraftPaper(1, 0, () => 0), status: "published", target: "A" }, 1, "Best Paper")];
    const next = applyPublicationTalentRewards(base, () => 0.99);
    expect(triggers(next).map((trigger) => trigger.name)).toEqual(["研究之始", "初露锋芒", "最佳之作"]);
    expect(triggers(next)[0]!.effects).toContain("SAN +2（19→20）");
    expect(triggers(next)[1]!.effects).toContain("SAN +4（20→20）");
    expect(triggers(next)[2]!.effects).toContain("SAN +8（20→20）");
    expect(next.player.research).toBe(20.75);
    expect(triggers(next)[0]!.effects).toContain("科研 +0.25（20→20.25，抵抗0.75）");
    expect(triggers(next)[1]!.effects).toContain("科研 +0.25（20.25→20.5，抵抗0.75）");
    expect(triggers(next)[2]!.effects).toContain("科研 +0.25（20.5→20.75，抵抗0.75）");
    expect(triggers(next)[2]!.effects).toContain("科研上限 +1（20→21）");
    expect(applyPublicationTalentRewards(next)).toBe(next);
    expect(next.eventQueue).toBe(base.eventQueue);
  });

  it("shows capped favor and social rewards as actual changes", () => {
    const base = state();
    base.player.favor = 20;
    base.player.social = 20;
    base.externalPublications = [false, true].map((nonFirstAuthor, index) => attachPaperPublication({
      ...createDraftPaper(1, index, () => 0), status: "published", target: "C", nonFirstAuthor,
    }));
    const next = applyPublicationTalentRewards(base, () => 0.99);
    expect(triggers(next).find((trigger) => trigger.name === "研究之始")!.effects).toContain("好感 +0（20→20，抵抗0.75，上限）");
    expect(triggers(next).find((trigger) => trigger.name === "携手启程")!.effects).toContain("社交 +0（20→20，抵抗0.75，上限）");
    expect(next.player.favor).toBe(20);
    expect(next.player.social).toBe(20);
  });

  it("runs publication favor, social and research rewards through the tier resist point by point", () => {
    const base = state();
    base.player.favor = 11;
    base.player.social = 6;
    base.player.research = 10;
    base.externalPublications = [false, true].map((nonFirstAuthor, index) => attachPaperPublication({
      ...createDraftPaper(1, index, () => 0), status: "published", target: "C", nonFirstAuthor,
    }));

    const resisted = applyPublicationTalentRewards(base, () => 0);
    expect(resisted.player).toMatchObject({ favor: 11.75, social: 6.75, research: 10.75, san: 14 });
    const resistedEffects = triggers(resisted).flatMap((trigger) => trigger.effects);
    expect(resistedEffects).toContain("好感 +0.75（11→11.75，抵抗0.25）");
    expect(resistedEffects).toContain("社交 +0.75（6→6.75，抵抗0.25）");
    expect(resistedEffects).toContain("科研 +0.75（10→10.75，抵抗0.25）");

    const random = vi.fn(() => 0.99);
    const applied = applyPublicationTalentRewards(base, random);
    expect(applied).toEqual(resisted);
    expect(random).not.toHaveBeenCalled();
  });

  it.each([19, 20])("preserves the original combined annual reward display at research cap %i", (research) => {
    const base = { ...state(), totalMonths: 12, year: 1, month: 12 };
    base.player.research = 25;
    base.fellowProgressState = [research, 20, 20].map((value, index) => ({
      ...createCustomFellowProgressProfile({ type: "peer", gender: "female", research: value, affinity: 1, startTotalMonths: 1 }),
      id: `fellow-${index}`,
    }));
    const next = settleLabResearchGrowth(base, () => 0.99);
    expect(triggers(next)[0]!.effects).toEqual([research === 19 ? "科研 +1（19→20，抵抗3）" : "科研 +3（20→20）"]);
    expect(triggers(next)[0]!.details).toEqual([
      `原始奖励：自然成长 +2，实验室传承 +${research === 19 ? 2 : 1}，合计 +${research === 19 ? 4 : 3}；合并后逐点抵抗并受科研上限限制`,
      ...(research === 20 ? ["档位抵抗 2.25 点，上限限制 0.75 点"] : []),
    ]);
    expect(next.fellowProgressState[0]!.annualResearchGrowthTotal ?? 0).toBe(20 - research);
    expect(next.fellowProgressState[0]!.research).toBe(20);
  });

  it.each([8, 9])("preserves the player's original inheritance reward display at their own cap from %i", (research) => {
    const base = { ...state(), totalMonths: 12, year: 1, month: 12 };
    base.player.research = research;
    base.researchCapacityState.baseCap = 9;
    base.fellowProgressState = [10, 10, 10].map((value, index) => ({
      ...createCustomFellowProgressProfile({ type: "peer", gender: "female", research: value, affinity: 1, startTotalMonths: 1 }),
      id: `fellow-${index}`,
    }));
    const next = settleLabResearchGrowth(base, () => 0.99);
    expect(triggers(next).find((trigger) => trigger.recipient === "你·林青")).toMatchObject({
      effects: [`科研 +2（${research}→9）`],
      details: ["原始奖励：实验室传承 +2；逐点抵抗并受科研上限限制", `档位抵抗 0.5 点，上限限制 ${research === 8 ? 0.5 : 1.5} 点`],
    });
    expect(next.player.research).toBe(9);
    expect(settleLabResearchGrowth(next, () => 0.99)).toBe(next);
  });

  it.each(["fellow", "player", "lover"] as const)
    ("accounts for fractional resistance and cap loss independently of RNG for %s", (recipient) => {
      let base = { ...state(), totalMonths: 12, year: 1, month: 12 };
      base.player.research = 20;
      base.fellowProgressState = [20, 21, 21, 21].map((research, index) => ({
        ...createCustomFellowProgressProfile({ type: "peer", gender: "female", research, affinity: 1, startTotalMonths: 1 }),
        id: `fellow-${index}`, name: `同学${index}`,
        lastAnnualGrowthTotalMonths: recipient === "fellow" && index === 0 ? undefined : 12,
      }));
      if (recipient !== "player") base = recordTalentTrigger(base, "inheritance:player:12", {
        name: "实验室传承", recipient: "你·林青", reason: "已结算", effects: [],
      });
      base.loverState = { ...base.loverState, active: recipient === "lover", name: "周明", startTotalMonths: 12 };
      base.loverProgressState = { ...base.loverProgressState, active: recipient === "lover", research: 20 };
      const reward = recipient === "fellow" ? 4 : 2;
      const target = recipient === "fellow" ? "同学0" : recipient === "player" ? "你·林青" : "周明";
      const random = vi.fn().mockReturnValueOnce(0).mockReturnValue(0.99);
      const capped = settleLabResearchGrowth(base, random);
      const cappedTrigger = triggers(capped).find((trigger) => trigger.recipient === target)!;
      expect(cappedTrigger.effects).toEqual([`科研 +${reward}（20→20）`]);
      expect(cappedTrigger.details).toContain(`档位抵抗 ${reward * 0.75} 点，上限限制 ${reward * 0.25} 点`);
      expect(random).not.toHaveBeenCalled();
      const resisted = settleLabResearchGrowth(base, () => 0);
      expect(resisted).toEqual(capped);
      for (const next of [capped, resisted]) {
        expect(next.player.research).toBe(20);
        expect(next.fellowProgressState[0]!.research).toBe(20);
        expect(next.fellowProgressState[0]!.annualResearchGrowthTotal ?? 0).toBe(0);
        expect(next.loverProgressState.research).toBe(20);
        expect(settleLabResearchGrowth(next, () => 0.99)).toBe(next);
      }
    });

  it.each([19, 20])("retains two coauthorship rewards at affinity %i", (affinity) => {
    const base = state();
    const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 2, affinity, startTotalMonths: 1 });
    const papers = [0, 1].map((index) => ({ ...createDraftPaper(1, index, () => 0),
      status: "published" as const, leadAuthorId: fellow.id, collaborators: [{ id: "player", name: "林青" }],
    }));
    const next = settleFellowCoauthoredPapers({ ...base, fellowProgressState: [fellow], fellowPapers: papers });
    const expected = affinity === 19
      ? "默契 +0.5（19→19.5，抵抗1.5）"
      : "默契 +0（20→20，抵抗1.5，上限）";
    expect(triggers(next)[0]!.effects).toEqual([expected]);
    expect(next.fellowProgressState[0]!.affinity).toBe(affinity === 19 ? 19.5 : 20);
  });

  it("records August year-end inheritance for the player and fellows including August joiners", () => {
    const base = { ...state(), totalMonths: 12, year: 1, month: 12 };
    base.fellowProgressState = [2, 6, 20].map((research, index) => ({
      ...createCustomFellowProgressProfile({ type: "peer", gender: "female", research, affinity: 1, startTotalMonths: [1, 6, 12][index]! }),
      id: `fellow-${index}`, name: `同学${index}`,
    }));
    const next = settleLabResearchGrowth(base, () => 0.99);
    expect(triggers(next).map((trigger) => trigger.recipient)).toEqual(["同学0", "同学1", "同学2", "你·林青", "第1学年末"]);
    expect(triggers(next)[0]!.effects).toEqual(["科研 +4（2→6）"]);
    expect(triggers(next)[1]!.effects).toEqual(["科研 +2.25（6→8.25，抵抗0.75）"]);
    expect(triggers(next)[2]!.effects).toEqual(["科研 +2（20→20）"]);
    expect(triggers(next)[3]!.effects).toEqual(["科研 +0.75（10→10.75，抵抗0.25）"]);
    expect(triggers(next).every((trigger) => trigger.reason === "第1学年结束，结算年度科研成长")).toBe(true);
    expect(next.eventHistory.filter((entry) => entry.id.startsWith("talent:inheritance:")))
      .toEqual(Array.from({ length: 4 }, () => expect.objectContaining({ completedAtTotalMonths: 12, completedAtMonth: 12, completedAtYear: 1 })));
    expect(next.log).toHaveLength(base.log.length + 1);
    expect(next.log[0]).toMatchObject({ id: "talent:annual-research:group:12", month: 12, eventHistoryId: "talent:annual-research:group:12" });
    expect(triggers(next)[4]!.effects).toEqual([
      "同学0：科研 +4（2→6）", "同学1：科研 +2.25（6→8.25，抵抗0.75）", "同学2：科研 +2（20→20）", "你·林青：科研 +0.75（10→10.75，抵抗0.25）",
    ]);
    expect(settleLabResearchGrowth(next, () => 0.99)).toBe(next);
    const october = { ...base, totalMonths: 14, month: 2 };
    expect(settleLabResearchGrowth(october, () => 0.99)).toBe(october);
    const html = renderApp(next, undefined, { activePlayTab: "events" }).replace(/<[^>]*>/g, "");
    expect(html).toContain("第1学年结束，结算年度科研成长");
    expect(html).toContain("科研 +2.25（6→8.25，抵抗0.75）");
    expect(html).toContain("自然成长 +2，实验室传承 +1，合计 +3");
  });

  it("shows pointwise inheritance resistance when a gain crosses a research tier", () => {
    const base = { ...state(), totalMonths: 12, year: 1, month: 12 };
    base.player.research = 5;
    base.fellowProgressState = [5, 10, 10, 10].map((research, index) => ({
      ...createCustomFellowProgressProfile({ type: "peer", gender: "female", research, affinity: 1, startTotalMonths: 1 }),
      id: `fellow-${index}`, name: `同学${index}`,
    }));
    const next = settleLabResearchGrowth(base, () => 0.1);
    expect(triggers(next)[0]!.effects).toEqual(["科研 +3.25（5→8.25，抵抗0.75）"]);
    expect(triggers(next).find((trigger) => trigger.recipient === "你·林青")!.effects).toEqual(["科研 +1.75（5→6.75，抵抗0.25）"]);
    expect(next.fellowProgressState[0]!.research).toBe(8.25);
    const html = renderApp(next, undefined, { activePlayTab: "events" }).replace(/<[^>]*>/g, "");
    expect(html).toContain("科研 +1.75（5→6.75，抵抗0.25）");
  });

  it.each([1, 2, 4, 7, 11, 16])("does not grant research or milestone history for %i fellow publications", (count) => {
    const base = state();
    const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 6, affinity: 1, startTotalMonths: 1, name: "周明" });
    base.fellowProgressState = [fellow];
    base.fellowPapers = Array.from({ length: count }, (_, index) => ({
      ...createDraftPaper(1, index, () => 0), status: "published" as const, leadAuthorId: fellow.id,
    }));
    base.externalPublications = [...base.fellowPapers];
    for (const roll of [0, 0.99]) {
      const next = advanceFellowResearch(base, () => roll);
      expect(next.fellowProgressState[0]!.research).toBe(6);
      expect(triggers(next).some((trigger) => trigger.name === "发表积累")).toBe(false);
      expect(next.eventHistory.some((entry) => entry.id.startsWith("talent:fellow-publication:"))).toBe(false);
      expect(advanceFellowResearch(next, () => 0.99)).toBe(next);
    }
  });

  it("records collaboration rapport with the person's name and deduplicated paper titles", () => {
    const base = state();
    const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 2, affinity: 1, startTotalMonths: 1, name: "周明" });
    const paper = { ...createDraftPaper(1, 0, () => 0), status: "published" as const, leadAuthorId: fellow.id,
      title: "合作研究", collaborators: [{ id: "player", name: "林青" }] };
    const next = settleFellowCoauthoredPapers({ ...base, fellowProgressState: [fellow], fellowPapers: [paper], externalPublications: [paper] });
    expect(triggers(next)).toEqual([expect.objectContaining({ name: "论文合作", recipient: "你与周明", effects: ["默契 +1（1→2）"], details: ["《合作研究》"] })]);
    expect(settleFellowCoauthoredPapers(next)).toBe(next);
  });

  it("records reading and work milestones through real actions", () => {
    const base = state();
    base.readingState.readCount = 9;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const read = dispatchAction(base, "read-paper");
    vi.restoreAllMocks();
    expect(triggers(read).map((trigger) => trigger.name)).toEqual(["阅读积累"]);
    expect(read.player.research).toBe(10.75);
    const workBase = { ...base, partTimeWorkCount: 7 };
    const work = dispatchAction(workBase, "part-time-work");
    expect(triggers(work).map((trigger) => trigger.name)).toEqual(["熟练打工"]);
  });

  it("records equipment activation and growth once across nested dispatches", () => {
    const before = state();
    const after = { ...before,
      shopState: { ...before.shopState, ebikeOwned: true, bikeSanCapGains: 1, bikeSanSpent: 6 },
      eventSupport: { ...before.eventSupport, hasParasol: true, hasDownJacket: true }, sanCap: before.sanCap + 1,
      coffeeState: { ...before.coffeeState, machineOwned: true, machineUpgrade: "advanced" as const, machineTrackedCoffeeCount: 10 },
    };
    const next = recordTalentTransitions(before, after);
    expect(triggers(next).map((trigger) => trigger.name)).toEqual(["骑行积累", "高级咖啡机", "整装待发"]);
    expect(recordTalentTransitions(before, next)).toBe(next);
    expect(recordTalentTransitions(next, next)).toBe(next);
  });

  it("records sports, card-game and conference progress without changing the resulting state", () => {
    const before = state();
    const after = { ...before, eventCounters: { ...before.eventCounters, badmintonCount: 1, pokerCount: 1, meetingCount: 4, domesticMeetingCount: 3 },
      eventSupport: { ...before.eventSupport, hasStrongBodyTalent: true } };
    const next = recordTalentTransitions(before, after);
    expect(triggers(next).map((trigger) => trigger.name)).toEqual(["羽毛球水平", "牌局策略"]);
    expect(triggers(next)[0]!.effects).toContain("首次获胜，每月SAN +1");
    expect(triggers(next)[0]!.effects).toContain("胜率提升");
    expect(triggers(next)[1]!.effects).toEqual(["胜率 40%→50%"]);
    expect(next.eventCounters).toBe(after.eventCounters);
    expect(next.player).toBe(after.player);
  });
});
