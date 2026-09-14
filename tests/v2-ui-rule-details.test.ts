import { describe, expect, it, vi } from "vitest";

import { renderApp } from "../src/app/v2-render";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { applyResearchOperation, previewResearchOperation } from "../src/core/v2-research-operation";
import type { Buff, GameState, Paper } from "../src/core/v2-types";

function createResearchState(): GameState {
  const state = createStartedGameState("normal");
  const paper = createDraftPaper(1, 0, () => 0);
  return {
    ...state,
    totalMonths: 1,
    month: 1,
    eventQueue: [],
    buffs: [],
    player: { ...state.player, research: 4, san: 20 },
    papers: [paper],
    selectedPaperId: paper.id,
  };
}

function createBuff(id: string, effects: Partial<Buff>): Buff {
  return { id, name: id, source: "测试", timing: "permanent", remainingMonths: null, ...effects };
}

function renderMetrics(paper: Paper): string {
  const state = createResearchState();
  const html = renderApp({ ...state, papers: [paper] }, createDefaultAccountProfile(), { activePlayTab: "research" });
  return html.split('<div class="research-metric-grid research-metric-grid-expanded">')[1]?.split('</section>')[0] ?? "";
}

describe("v2 research rule details and publication metrics", () => {
  it("keeps formulas collapsed and explains random scores, buff order and repeated execution", () => {
    const html = renderApp(createResearchState(), createDefaultAccountProfile(), { activePlayTab: "workstation" });
    const details = html.match(/<details class="workstation-tip-note workstation-formula-note panel-tip-note">([\s\S]*?)<\/details>/)?.[1] ?? "";

    const summary = details.match(/<summary>[\s\S]*?<\/summary>/)?.[0] ?? "";
    expect(summary).toBe("<summary>💡 小提示：idea/实验/写作上行是包含协作的合计分，下行是自身分；科研只更新自身，同学帮助持续累加。点击展开看细则</summary>");
    expect(details).toContain("本次分 = 四舍五入(基础分 × 总倍率 + 固定分)");
    expect(details).not.toContain("科研分 =");
    expect(details).toContain("基础分 = 科研能力 × 随机倍率（0.5～1.5）+ 随机加分（0～5）");
    expect(details).toContain("Buff 顺序：先合并倍率，再加固定分");
    expect(details).toContain("×1.5 算 +0.5，×0.8 算 −0.2");
    expect(details).toContain("两个 ×1.5 合并为 ×2");
    expect(details).toContain("新自身 = max(原自身+1,本次)");
    expect(details).toContain("协作分不会被科研覆盖，同一人反复帮助、多人帮助都持续累加");
    expect(details).toContain("某项自身20+协作10，本次25→新自身25+协作10=合计35");
    expect(details).toContain("最右总分为三项合计");
    expect(details).not.toContain("期刊送审后本次分直接累加");
    expect(details).toContain("执行次数 = max(1, 1 + 向下取整(Buff额外次数 + 装备额外次数))");
    expect(details).toContain("沿用上一遍自身分，不额外扣行动点或SAN");
    expect(details).toContain("“仅下次”Buff 的加分与倍率只用于第一遍");
    expect(details).toContain("持续Buff与装备每遍生效");
    expect(details).not.toContain("SAN消耗");
    expect(details).not.toContain("每月衰减");
    expect(details).not.toContain("重掷");
    const reviewNote = html.match(/<details class="workstation-review-note panel-tip-note"[\s\S]*?<\/details>/)?.[0] ?? "";
    const reviewSummary = reviewNote.match(/<summary>[\s\S]*?<\/summary>/)?.[0] ?? "";
    expect(reviewNote).toContain('data-workstation-note="review"');
    expect(reviewSummary).toContain("会议按投稿时合计分审稿3个月");
    expect(reviewSummary).toContain("期刊送审后不衰减，可持续修改，达标接收");
    expect(reviewNote).toContain("会议投稿冻结三项合计分快照，3位审稿人据此评分");
    expect(reviewNote).toContain("审稿期间当前分数仍衰减，快照不变");
    expect(reviewNote).toContain("保留衰减后的分数，再将审稿反馈加到自身分，协作分不变");
    expect(reviewNote).toContain("各项扣分=向下取整(合计×热度×10%)，至少扣1分、合计最低1分");
    expect(reviewNote).toContain("原本0或1不扣。先算合计扣分，再按自身/协作比例分摊");
    expect(reviewNote).toContain("期刊初始分=向下取整(3×三项合计的几何均值)");
    expect(reviewNote).toContain("修改分=初始分+各项较送审时合计的净新增（逐项最低0）");
    expect(reviewNote).toContain("自身与协作新增均计入");
    expect(reviewNote).toContain("期刊送审线/达标线：PAMI 75/125 分、NMI 100/250 分、Nature 150/500 分");
    expect(reviewNote).not.toContain("接收奖励会随");
    expect(reviewNote).not.toContain("递减");
    expect(html).toContain('class="workstation-notes"');
  });

  it.each([[0, 8], [50, 51]])("matches the documented score formula for current score %s", (currentScore, expectedScore) => {
    const state = createResearchState();
    state.player.research = 5;
    state.papers[0]!.idea = currentScore;
    state.buffs = [
      createBuff("first", { actionEffects: { idea: { multiplier: 1.5, bonus: 1 } } }),
      createBuff("second", { actionEffects: { idea: { multiplier: 1.5, bonus: 2 } } }),
    ];

    const nextState = applyResearchOperation(state, state.papers[0]!.id, "idea", () => 0);

    expect(nextState.papers[0]?.idea).toBe(expectedScore);
    expect(nextState.player.san).toBe(18);
    expect(nextState.actionState.used).toBe(1);
  });

  it("applies next-action score buffs only on the first internal execution and charges once", () => {
    const state = createResearchState();
    state.papers[0]!.idea = 1;
    state.shopState.gpuLevel = 1;
    state.buffs = [
      createBuff("ongoing", { actionEffects: { experiment: { bonus: 2 } } }),
      createBuff("once", { timing: "next-action", actionEffects: { experiment: { bonus: 10 } } }),
    ];
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(0.999);

    const nextState = applyResearchOperation(state, state.papers[0]!.id, "experiment", random);

    expect(nextState.papers[0]?.experiment).toBe(16);
    expect(random).toHaveBeenCalledTimes(4);
    expect(nextState.buffs.map((buff) => buff.id)).toEqual(["ongoing"]);
    expect(nextState.player.san).toBe(17);
    expect(nextState.actionState.used).toBe(1);
  });

  it("rounds the combined SAN multiplier before equipment and seasonal adjustments", () => {
    const state = createResearchState();
    state.shopState.keyboardOwned = true;
    state.buffs = [
      createBuff("first", { activeOperationSanMultiplier: 1.1, actionEffects: { writing: { sanDelta: 1 } } }),
      createBuff("second", { activeOperationSanMultiplier: 1.1 }),
    ];

    expect(previewResearchOperation(state, "writing", 4).sanCost).toBe(5);
    state.month = 7;
    expect(previewResearchOperation(state, "writing", 4).sanCost).toBe(4);
    state.month = 10;
    expect(previewResearchOperation(state, "writing", 4).sanCost).toBe(6);
    state.eventSupport.hasParasol = true;
    expect(previewResearchOperation(state, "writing", 4).sanCost).toBe(5);
    state.month = 4;
    expect(previewResearchOperation(state, "writing", 4).sanCost).toBe(5);
  });

  it("places duration fourth and the total citation multiplier last with two candidate label lines", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0, () => 0), status: "published", target: "A", conferenceHandled: true,
    }, 1, "Best Paper Candidate");
    const metrics = renderMetrics(paper);
    const labels = [...metrics.matchAll(/<div class="research-metric-item[^"]*">\s*<span[^>]*>([\s\S]*?)<\/span>/g)]
      .map((match) => match[1]!.replace(/<[^>]*>/g, ""));

    expect(labels).toEqual(["引用", "录用分", "当前分", "历时", "Best Paper", "热度", "影响力", "总引用倍率"]);
    expect(metrics).toContain('<span class="research-publication-label"><span>Best Paper</span><span>Candidate</span></span><strong>×5</strong>');
  });

  it("retains the zero multiplier before exposure and replaces arXiv with the conference award", () => {
    const paper = attachPaperPublication({ ...createDraftPaper(1, 0, () => 0), status: "published", target: "A" }, 1, "Oral");
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label">未开会</span><strong>×0</strong>');
    expect(renderMetrics(paper)).toContain('<span>总引用倍率</span><strong>0</strong>');
    paper.publication!.preprintExposed = true;
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label">arXiv</span><strong>×1</strong>');
    paper.conferenceHandled = true;
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label">Oral</span><strong>×1.5</strong>');
  });

  it("shows journal publication as ×1.0 without requiring conference attendance", () => {
    const paper = attachPaperPublication({
      ...createDraftPaper(1, 0, () => 0), status: "published", target: null, journalTarget: "pami",
    });
    expect(renderMetrics(paper)).toContain('<span class="research-publication-label">期刊</span><strong>×1.0</strong>');
  });

  it("explains coffee prerequisites, subscription skips and the different seasonal penalties", () => {
    const state = createResearchState();
    const coffeeHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "coffee" });
    const gearHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "gear" });

    expect(coffeeHtml).toContain("手动购买冰美式和月初自动续费均需咖啡机；自动续费在金币不足或 SAN 已满时跳过");
    expect(gearHtml).toContain("显卡和自行车可以逐档升级，提升效果");
    expect(gearHtml).toContain("夏季（公历 6–8 月）主动操作的 SAN 消耗 +1，遮阳伞可免除");
    expect(gearHtml).toContain("冬季（公历 12–2 月）每月 SAN -1，羽绒服可免除");
  });

  it("keeps the citation explanation in the results page", () => {
    const html = renderApp(createResearchState(), createDefaultAccountProfile(), { activePlayTab: "research" });
    const notes = html.match(/<details class="research-mechanism-note[^>]*data-research-note="citation"[\s\S]*?<\/details>/)?.[0] ?? "";
    const noteIndex = html.indexOf('data-research-note="citation"');

    expect((notes.match(/<details class="research-mechanism-note[^>]*"/g) ?? [])).toHaveLength(1);
    expect(notes).toContain('data-research-note="citation"');
    expect(notes).not.toContain('data-research-note="review"');
    expect(notes).toContain("会议开会或挂 arXiv 后开始被引，期刊接收后直接开始");
    expect(notes).toContain("会议论文接收后，开会才开始被引");
    expect(notes).toContain("每月引用增长 = 当前分 × 0.05 × 总引用倍率");
    expect(notes).toContain("Poster/Spotlight ×1、Oral ×1.5、Best Paper ×5");
    expect(notes).toContain("GitHub 只提升当前分");
    expect(html.indexOf("科研分")).toBeLessThan(noteIndex);
    expect(html.indexOf("A（")).toBeLessThan(noteIndex);
    expect(html.indexOf("C（")).toBeLessThan(noteIndex);
  });

  it("shows both the old and new hammock rest recovery in the shop and talent panel", () => {
    const state = createResearchState();
    state.shopState.chairOwned = true;
    const shopHtml = renderApp(state, createDefaultAccountProfile(), { activeShopTab: "rest", selectedChairUpgradeId: "chair-hammock" });
    state.shopState.chairUpgrade = "hammock";
    const talentHtml = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "talent", activeTalentTab: "equip" });

    expect(shopHtml.replace(/<[^>]*>/g, "")).toContain("休息动作从 SAN +2 提升为 SAN +5");
    expect(talentHtml).toContain("休息动作从 SAN +2 提升为 SAN +5");
    expect(talentHtml).not.toContain("休息动作改为 SAN +5");
  });
});
