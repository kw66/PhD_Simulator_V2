import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { ADVISOR_REQUIREMENTS, ADVISOR_SALARY } from "../src/core/v2-content";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createPhdDecisionEvent } from "../src/core/v2-phd-decision-event";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import type { GameState, Paper, PendingEvent } from "../src/core/v2-types";

function decisionState(year: 2 | 3, score = 0): GameState {
  return { ...createStartedGameState("normal"), year, month: 9, totalMonths: year === 2 ? 21 : 33,
    degree: "master", totalResearchScore: score, papers: [], externalPublications: [], eventQueue: [] };
}

function nextStage(event: PendingEvent, choiceId = event.choices[0]!.id): PendingEvent {
  const next = event.choices.find((choice) => choice.id === choiceId)?.effects.enqueueEvents?.[0];
  expect(next).toBeDefined();
  return next!;
}

function publication(id: string, patch: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(1, 0, () => 0), id, status: "published", target: "B", ...patch };
}

describe("PhD decision copy", () => {
  it.each([2, 3] as const)("opens year %s with its narrative and application requirements", (year) => {
    const state = decisionState(year);
    const before = structuredClone(state);
    const intro = createPhdDecisionEvent(state);
    expect(intro).toMatchObject({ stage: "act1", blocking: true, chainId: "phd-decision",
      fixedTreePreview: { kind: "phd-decision", year, month: 9, totalMonths: year === 2 ? 21 : 33 } });
    expect(intro.choices.map((choice) => choice.label)).toEqual(["继续"]);
    expect(intro.description).toContain(year === 2 ? "硕士第二年5月" : "硕士第三年5月");
    expect(intro.description).toContain(year === 2 ? "问起你有没有继续读博的打算" : "最后一次申请机会");
    expect(intro.description).not.toMatch(/基础工资|劳务费|SAN|培养期|第六年|70个月/);
    expect(nextStage(intro).stage).toBe("act2");
    expect(state).toEqual(before);
  });

  it.each([2, 3] as const)("shows all policies and the same choices both below and at the year %s threshold", (year) => {
    const required = year === 2 ? ADVISOR_REQUIREMENTS.phdYear2 : ADVISOR_REQUIREMENTS.phdYear3;
    for (const score of [required - 1, required]) {
      const intro = createPhdDecisionEvent(decisionState(year, score));
      const decision = nextStage(intro);
      expect(decision.choices.map((choice) => [choice.id, choice.label])).toEqual([
        ["continue-master", "继续硕士"], ["transfer-phd", "申请转博"],
      ]);
      expect(intro.description).toContain(`已发表一作0篇，科研分${score}。今年转博需要达到 ${required} 分`);
      expect(intro.description).toContain(score < required ? "你的成果还不够" : "你已经过线");
      expect(decision.description).not.toMatch(/已发表一作|科研分|今年转博需要/);
      expect(decision.description).toContain("你听博士师兄说");
      expect(decision.description).toContain("简历迟迟没有回应");
      expect(decision.description).toContain("别觉得多一张文凭就稳了");
      expect(decision.description).toContain("AI发展得太快");
      expect(decision.description).toContain("自己的课题就失去了意义");
      expect(decision.description).toContain("自己找饭碗的日子往后推一推");
      expect(decision.description).not.toMatch(/月末判断|SAN|永久效果|金币|经费达到/);
      expect(intro.description).toContain(year === 2 ? "今年不转，明年还有一次机会" : "这是硕士阶段最后一次转博机会");
      const transfer = decision.choices.find((choice) => choice.id === "transfer-phd")!;
      expect(transfer.effects.transferToPhd).toBe(score >= required ? true : undefined);
      expect(transfer.disabledReason).toBeUndefined();
    }
  });

  it("counts unique published first-author conferences and journals while excluding other authors and unfinished papers", () => {
    const state = decisionState(3, 18);
    const conference = publication("conference");
    const pami = publication("pami", { target: null, journalTarget: "pami" });
    const nmi = publication("nmi", { target: null, journalTarget: "nmi" });
    const nature = attachPaperPublication(publication("nature", { target: null, journalTarget: "nature" }), 1);
    const metadataJournal = { ...nature, journalTarget: undefined };
    state.papers = [conference, pami, publication("draft", { status: "draft" }), publication("review", { status: "reviewing" })];
    state.externalPublications = [
      conference, { ...pami }, nmi, metadataJournal, { ...metadataJournal },
      publication("coauthor-conference", { nonFirstAuthor: true }),
      publication("coauthor-journal", { nonFirstAuthor: true, target: null, journalTarget: "pami" }),
      publication("fellow", { leadAuthorId: "fellow-1" }),
      publication("lover", { leadAuthorId: "lover-1", target: null, journalTarget: "nature" }),
      publication("explicit-lead", { leadAuthorId: "player" }),
      publication("unclassified", { target: null }),
      publication("journal-review", { target: null, journalTarget: "pami", status: "journal-reviewing" }),
    ];
    const before = structuredClone(state);
    const intro = createPhdDecisionEvent(state);
    expect(intro.description).toContain("已发表一作4篇，科研分18。");
    expect(intro.description).not.toMatch(/B 类|可计分的一作论文/);
    expect(state).toEqual(before);
  });

  it("renders the four emoji-led decision paragraphs separately", () => {
    const state = decisionState(2, 2);
    const decision = nextStage(createPhdDecisionEvent(state));
    const event = createEventQueueItem(decision, state.totalMonths);
    const html = renderApp({ ...state, eventQueue: [event] }, undefined, {
      isEventContentOpen: true, activeEventId: event.id,
    });
    const paragraphs = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gu) ?? [];
    for (const emoji of ["💼", "🤖", "💭", "📩"]) {
      const paragraph = paragraphs.find((entry) => entry.includes(emoji));
      expect(paragraph).toBeDefined();
      expect(["💼", "🤖", "💭", "📩"].filter((marker) => paragraph!.includes(marker))).toEqual([emoji]);
    }
  });

  it.each([2, 3] as const)("keeps the year %s success result concise with condition, degree, future salary and pressure", (year) => {
    const required = year === 2 ? ADVISOR_REQUIREMENTS.phdYear2 : ADVISOR_REQUIREMENTS.phdYear3;
    const decision = nextStage(createPhdDecisionEvent(decisionState(year, required)));
    const result = nextStage(decision, "transfer-phd");
    expect(result.stage).toBe("result");
    expect(result.description).toContain(`条件：科研分 ${required} ≥ ${required}｜结果：毕业要求 ${ADVISOR_REQUIREMENTS.masterGrad}→${ADVISOR_REQUIREMENTS.phdGrad}分｜工资 ${ADVISOR_SALARY.master}→${ADVISOR_SALARY.phd}金｜每月SAN -1`);
    expect(result.description.match(/机制结算/g)).toHaveLength(1);
    expect(result.description).not.toMatch(/转为博士|基础工资|每月，永久/);
    expect(result.description).toContain("多了一股无形的压力");
    expect(result.description).toContain("学院确认了你的转博资格");
    expect(result.description).toContain("毕业时间按入学第六年6月安排");
    expect(result.description).not.toMatch(/月末判断|共70个月|基础的每月|SAN \+1|金币 \+/);
    expect(result.choices.map((choice) => choice.label)).toEqual(["开始博士阶段"]);
    const transfer = decision.choices.find((choice) => choice.id === "transfer-phd")!;
    expect(transfer.effects.money).toBeUndefined();
    expect(transfer.effects.advisorProgressStateDeltas).toBeUndefined();
    expect(transfer.effects.addBuffs).toEqual([expect.objectContaining({ id: "phd-pressure", monthlyStats: { san: -1 }, remainingMonths: null })]);
  });

  it.each(["continue-master", "transfer-phd"])("describes preparation rather than guaranteed graduation for year three choice %s", (choiceId) => {
    const decision = nextStage(createPhdDecisionEvent(decisionState(3, 0)));
    const choice = decision.choices.find((entry) => entry.id === choiceId)!;
    const result = nextStage(decision, choiceId);
    expect(result.description).toContain("硕士毕业");
    expect(result.description).toContain("能否按期毕业，还要看6月结束时的成果");
    expect(result.description).not.toMatch(/继续按硕士路线毕业|仍按硕士路线毕业|硕士毕业成功|明年还有一次机会/);
    expect(choice.effects.transferToPhd).toBeUndefined();
    expect(choice.effects.addBuffs).toBeUndefined();
    if (choiceId === "transfer-phd") {
      expect(result.title).toContain("转博失败");
      expect(result.description).toContain(`条件：科研分 0 < ${ADVISOR_REQUIREMENTS.phdYear3}`);
    } else expect(choice.outcome).toBe("放弃本轮转博，继续准备硕士毕业。");
  });

  it.each(["continue-master", "transfer-phd"])("preserves another chance in year two after %s", (choiceId) => {
    const result = nextStage(nextStage(createPhdDecisionEvent(decisionState(2, 0))), choiceId);
    expect(result.description).toContain("明年还有一次机会");
    expect(result.description).not.toContain("最后一次转博机会");
  });

  it("reads changed salary parameters in the result without changing balances", () => {
    const salary = { ...ADVISOR_SALARY };
    const state = decisionState(2, 2);
    const before = structuredClone(state);
    try {
      Object.assign(ADVISOR_SALARY, { master: 1.75, phd: 3.25 });
      const decision = nextStage(createPhdDecisionEvent(state));
      expect(decision.description).toContain("读博每月有补助");
      const result = nextStage(decision, "transfer-phd");
      expect(result.description).toContain("工资 1.75→3.25金");
      expect(result.description).not.toContain("1→2.5");
      expect(state).toEqual(before);
    } finally {
      Object.assign(ADVISOR_SALARY, salary);
    }
  });
});
