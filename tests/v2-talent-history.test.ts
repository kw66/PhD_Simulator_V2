import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { settleFellowCoauthoredPapers, settleLabResearchGrowth } from "../src/core/v2-lab-talent";
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
      name: "实验室传承", recipient: '<同学> & "姓名"', reason: "认识12个月",
      effects: ["科研+2（2→4）"], details: ["<script>unsafe</script>"],
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
    expect(html).toContain("认识12个月");
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(html.replace(/<[^>]*>/g, "")).toContain("科研+2（2→4）");
    expect(html).toContain("&lt;同学&gt; &amp; &quot;姓名&quot;");
    expect(html).not.toContain("<script>unsafe</script>");
    expect(html).not.toContain('data-action="resolve-event"');
    expect(renderApp({ ...next, totalMonths: 14 }, undefined, { activeLogPage: 13 }).replace(/<[^>]*>/g, ""))
      .toContain("科研+2（2→4）");
  });

  it("records nominal publication rewards alongside capped actual changes", () => {
    const base = state();
    base.player.san = 19;
    base.player.research = 20;
    base.externalPublications = [attachPaperPublication({ ...createDraftPaper(1, 0, () => 0), status: "published", target: "A" }, 1, "Best Paper")];
    const next = applyPublicationTalentRewards(base);
    expect(triggers(next).map((trigger) => trigger.name)).toEqual(["研究之始", "初露锋芒", "最佳之作"]);
    expect(triggers(next)[0]!.effects).toContain("SAN+2（19→20）");
    expect(triggers(next)[1]!.effects).toContain("SAN+4（20→20）");
    expect(triggers(next)[2]!.effects).toContain("SAN+8（20→20）");
    expect(next.player.research).toBe(21);
    expect(triggers(next).flatMap((trigger) => trigger.effects).filter((effect) => effect.startsWith("科研+")).length).toBe(3);
    expect(triggers(next)[2]!.effects).toContain("科研上限+1（20→21）");
    expect(applyPublicationTalentRewards(next)).toBe(next);
    expect(next.eventQueue).toBe(base.eventQueue);
  });

  it("retains capped favor and social rewards", () => {
    const base = state();
    base.player.favor = 20;
    base.player.social = 20;
    base.externalPublications = [false, true].map((nonFirstAuthor, index) => attachPaperPublication({
      ...createDraftPaper(1, index, () => 0), status: "published", target: "C", nonFirstAuthor,
    }));
    const next = applyPublicationTalentRewards(base);
    expect(triggers(next).find((trigger) => trigger.name === "研究之始")!.effects).toContain("好感+1（20→20）");
    expect(triggers(next).find((trigger) => trigger.name === "携手启程")!.effects).toContain("社交+1（20→20）");
    expect(next.player.favor).toBe(20);
    expect(next.player.social).toBe(20);
  });

  it.each([19, 20])("retains inheritance rewards at research %i", (research) => {
    const base = state();
    base.player.research = 25;
    base.fellowProgressState = [research, 20, 20].map((value, index) => ({
      ...createCustomFellowProgressProfile({ type: "peer", gender: "female", research: value, affinity: 1, startTotalMonths: 1 }),
      id: `fellow-${index}`,
    }));
    const next = settleLabResearchGrowth(base);
    expect(triggers(next)[0]!.effects).toEqual([research === 19 ? "科研+2（19→20）" : "科研+1（20→20）"]);
    expect(next.fellowProgressState[0]!.research).toBe(20);
  });

  it.each([19, 20])("retains two coauthorship rewards at affinity %i", (affinity) => {
    const base = state();
    const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 2, affinity, startTotalMonths: 1 });
    const papers = [0, 1].map((index) => ({ ...createDraftPaper(1, index, () => 0),
      status: "published" as const, leadAuthorId: fellow.id, collaborators: [{ id: "player", name: "林青" }],
    }));
    const next = settleFellowCoauthoredPapers({ ...base, fellowProgressState: [fellow], fellowPapers: papers });
    expect(triggers(next)[0]!.effects).toEqual([`默契+2（${affinity}→20）`]);
    expect(next.fellowProgressState[0]!.affinity).toBe(20);
  });

  it("identifies each fellow's annual research change and records capped anniversaries", () => {
    const base = state();
    base.fellowProgressState = [2, 6, 20].map((research, index) => ({
      ...createCustomFellowProgressProfile({ type: "peer", gender: "female", research, affinity: 1, startTotalMonths: 1 }),
      id: `fellow-${index}`, name: `同学${index}`,
    }));
    const next = settleLabResearchGrowth(base);
    expect(triggers(next).map((trigger) => trigger.recipient)).toEqual(["同学0", "同学1", "同学2"]);
    expect(triggers(next)[0]!.effects).toEqual(["科研+2（2→4）"]);
    expect(triggers(next)[2]!.effects).toEqual(["科研0（20→20）"]);
    expect(settleLabResearchGrowth(next)).toBe(next);
  });

  it("records collaboration rapport with the person's name and deduplicated paper titles", () => {
    const base = state();
    const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 2, affinity: 1, startTotalMonths: 1, name: "周明" });
    const paper = { ...createDraftPaper(1, 0, () => 0), status: "published" as const, leadAuthorId: fellow.id,
      title: "合作研究", collaborators: [{ id: "player", name: "林青" }] };
    const next = settleFellowCoauthoredPapers({ ...base, fellowProgressState: [fellow], fellowPapers: [paper], externalPublications: [paper] });
    expect(triggers(next)).toEqual([expect.objectContaining({ name: "论文合作", recipient: "你与周明", effects: ["默契+1（1→2）"], details: ["《合作研究》"] })]);
    expect(settleFellowCoauthoredPapers(next)).toBe(next);
  });

  it("records reading and work milestones through real actions", () => {
    const base = state();
    base.readingState.readCount = 9;
    const read = dispatchAction(base, "read-paper");
    expect(triggers(read).map((trigger) => trigger.name)).toEqual(["阅读积累"]);
    expect(read.player.research).toBe(11);
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
    const after = { ...before, eventCounters: { ...before.eventCounters, badmintonCount: 1, pokerCount: 1, meetingCount: 4 },
      eventSupport: { ...before.eventSupport, hasStrongBodyTalent: true } };
    const next = recordTalentTransitions(before, after);
    expect(triggers(next).map((trigger) => trigger.name)).toEqual(["会议经验", "羽毛球水平", "牌局策略"]);
    expect(triggers(next)[1]!.effects).toContain("首次获胜，每月SAN+1");
    expect(next.eventCounters).toBe(after.eventCounters);
    expect(next.player).toBe(after.player);
  });
});
