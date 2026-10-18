import { describe, expect, it } from "vitest";
import { getPlayHelpContext } from "../src/app/v2-play-help";
import { renderApp } from "../src/app/v2-render";
import { buildBuffDisplayBuckets } from "../src/app/v2-render-buffs";
import { advanceBuffDurations } from "../src/core/v2-buffs";
import { createInitialState } from "../src/core/v2-engine";
import { activateInternship, activateRemoteInternship } from "../src/core/v2-internship-system";
import { createLabGpuFailureBuff } from "../src/core/v2-lab-compute";
import type { Buff, GameState } from "../src/core/v2-types";

function createPlayingState(buffs: Buff[]): GameState {
  return { ...createInitialState(), phase: "playing", month: 2, totalMonths: 2, buffs, log: [] };
}

function renderBuffSidebar(state: GameState): string {
  const html = renderApp(state, undefined, { activePlayTab: "workstation" });
  const sidebar = html.match(/<aside class="play-left-rail[^"]*"[^>]*>[\s\S]*?<\/aside>/)?.[0];
  expect(sidebar).toBeDefined();
  return sidebar!;
}

function getEffectChip(sidebar: string, label: string): string {
  const chips = sidebar.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const chip = chips.find((item) => item.endsWith(`>${label}</button>`));
  expect(chip).toBeDefined();
  return chip!;
}

describe("lab GPU failure Buff display", () => {
  it("shows the shared experiment surcharge as a monthly money debuff with its scope", () => {
    const buckets = buildBuffDisplayBuckets([createLabGpuFailureBuff()]);

    expect(buckets.permanent).toEqual([]);
    expect(buckets.nextAction).toEqual([]);
    expect(buckets.monthly).toEqual([expect.objectContaining({
      label: "实验费用 +1",
      category: "money",
      isDebuff: true,
      sources: [expect.stringContaining("显卡故障 · 剩余 6 月")],
    })]);
    expect(buckets.monthly[0]!.sources[0]).toContain("玩家与同学共享");
    expect(buckets.monthly[0]!.sources[0]).toContain("优先使用科研经费，同学可自付差额");
    expect(buckets.monthly[0]!.sources[0]).not.toMatch(/玩家自付|自费/);
  });

  it.each([
    { delta: 2, label: "实验费用 +2", isDebuff: true },
    { delta: -1, label: "实验费用 -1", isDebuff: false },
  ])("renders the numeric field independently of the Buff identity: $delta", ({ delta, label, isDebuff }) => {
    const buff: Buff = {
      ...createLabGpuFailureBuff(),
      id: "different-lab-resource",
      name: "另一种算力变化",
      source: "测试来源",
      description: undefined,
      labExperimentMoneyDelta: delta,
    };

    expect(buildBuffDisplayBuckets([buff]).monthly).toEqual([expect.objectContaining({
      label, category: "money", isDebuff,
      sources: [expect.stringContaining("测试来源 · 剩余 6 月")],
    })]);
  });

  it.each([undefined, 0, Number.NaN])("does not infer a surcharge from the name when the field is %s", (delta) => {
    const buff = { ...createLabGpuFailureBuff(), labExperimentMoneyDelta: delta };
    expect(buildBuffDisplayBuckets([buff]).monthly).toEqual([]);
  });

  it("updates the remaining duration and removes the effect after six months", () => {
    let buffs = [createLabGpuFailureBuff()];
    for (let elapsed = 0; elapsed < 6; elapsed += 1) {
      const duration = `剩余 ${6 - elapsed} 月`;
      expect(buildBuffDisplayBuckets(buffs).monthly[0]!.sources[0]).toContain(duration);
      const chip = getEffectChip(renderBuffSidebar(createPlayingState(buffs)), "实验费用 +1");
      expect(chip).toContain(duration);
      buffs = advanceBuffDurations(buffs);
    }

    expect(buildBuffDisplayBuckets(buffs).monthly).toEqual([]);
    expect(renderBuffSidebar(createPlayingState(buffs))).not.toContain("实验费用 +1");
  });

  it.each([0, -1])("hides an expired Buff with %i remaining months from both display paths", (remainingMonths) => {
    const buffs = [{ ...createLabGpuFailureBuff(), remainingMonths }];
    expect(buildBuffDisplayBuckets(buffs).monthly).toEqual([]);
    const sidebar = renderBuffSidebar(createPlayingState(buffs));
    expect(sidebar).not.toContain("实验费用 +1");
    expect(sidebar).not.toContain("显卡故障");
  });

  it("nets monthly shared surcharges and personal internship discounts while retaining each source", () => {
    const state = createPlayingState([createLabGpuFailureBuff()]);
    state.shopState.gpuLevel = 8;
    state.internshipState = activateRemoteInternship(state.totalMonths - 1);
    const sidebar = renderBuffSidebar(state);
    const monthlyCost = getEffectChip(sidebar, "实验费用 +0");

    expect(monthlyCost).toContain('class="effect-chip is-money"');
    expect(monthlyCost).toContain("显卡故障 · 剩余 6 月 · 实验费用 +1");
    expect(monthlyCost).toContain("远程实习 · 剩余 3 月 · 实验费用 -1");
    expect(monthlyCost).toContain("玩家与同学共享");
    expect(monthlyCost).toContain("优先使用科研经费，同学可自付差额");
    expect(monthlyCost).not.toMatch(/玩家自付|自费/);
    expect(sidebar).not.toContain(">实验费用 +1</button>");
    expect(sidebar).not.toContain(">实验费用 -1</button>");
    expect(getEffectChip(sidebar, "实验费用 -2")).toContain('class="effect-chip is-money"');
    expect(getEffectChip(sidebar, "实验费用 -2")).toContain("个人显卡");
    expect(sidebar).not.toContain("实验金币");

    state.buffs = [{ ...createLabGpuFailureBuff(), remainingMonths: 0 }];
    const expiredSidebar = renderBuffSidebar(state);
    expect(expiredSidebar).not.toContain("实验费用 +1");
    getEffectChip(expiredSidebar, "实验费用 -2");
    expect(getEffectChip(expiredSidebar, "实验费用 -1")).toContain("远程实习 · 剩余 3 月");
  });

  it("combines six-month enterprise savings with a shorter GPU failure only while both are active", () => {
    const state = createPlayingState([{ ...createLabGpuFailureBuff(), remainingMonths: 4 }]);
    state.internshipState = activateInternship();

    const combined = getEffectChip(renderBuffSidebar(state), "实验费用 -1");
    expect(combined).toContain("显卡故障 · 剩余 4 月 · 实验费用 +1");
    expect(combined).toContain("大厂实习 · 剩余 6 月 · 实验费用 -2");

    state.buffs = [];
    const internshipOnly = getEffectChip(renderBuffSidebar(state), "实验费用 -2");
    expect(internshipOnly).toContain("大厂实习 · 剩余 6 月 · 实验费用 -2");
    expect(internshipOnly).not.toContain("显卡故障");
  });

  it("keeps player experiment settlement in research help and fellow fallback in relationship help", () => {
    const research = getPlayHelpContext({ activePlayTab: "workstation" }).pages.find((entry) => entry.title === "实验经费")!;
    const relationship = getPlayHelpContext({ activePlayTab: "relationship" }).pages.find((entry) => entry.title === "科研经费")!;
    expect(research.body).toContain("先结算全组费用变动，再扣你的个人减免");
    expect(research.body).toContain("不足的差额由你自付金币");
    expect(research.body).toContain("经费和金币合计不足时，本次无法做实验");
    expect(research.body).not.toContain("同学经费不足");
    expect(relationship.body).toContain("同学实验先用经费，不足差额用钱包");
    expect(relationship.body).not.toContain("个人减免");
  });

  it("keeps equipment scope in the shop without repeating experiment settlement", () => {
    const help = getPlayHelpContext({ activePlayTab: "shop", activeShopTab: "gear" });
    expect(help.pages).toHaveLength(1);
    expect(help.pages[0]!.body).toContain("显卡只为你的实验减费");
    expect(help.pages[0]!.body).toContain("不替同学减费");
    expect(help.pages[0]!.body).toContain("详细结算见科研提示");
    expect(help.pages[0]!.body).not.toContain("科研经费不足");
  });
});
