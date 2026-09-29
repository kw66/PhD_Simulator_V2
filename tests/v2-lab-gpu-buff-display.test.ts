import { describe, expect, it } from "vitest";
import { getPlayHelpContext } from "../src/app/v2-play-help";
import { renderApp } from "../src/app/v2-render";
import { buildBuffDisplayBuckets } from "../src/app/v2-render-buffs";
import { advanceBuffDurations } from "../src/core/v2-buffs";
import { createInitialState } from "../src/core/v2-engine";
import { activateRemoteInternship } from "../src/core/v2-internship-system";
import { createLabGpuFailureBuff } from "../src/core/v2-lab-compute";
import type { Buff, GameState } from "../src/core/v2-types";

function createPlayingState(buffs: Buff[]): GameState {
  return { ...createInitialState(), phase: "playing", month: 2, totalMonths: 2, buffs, log: [] };
}

function renderBuffSidebar(state: GameState): string {
  const html = renderApp(state, undefined, { activePlayTab: "workstation" });
  const sidebar = html.match(/<aside class="play-left-rail[^"]*">[\s\S]*?<\/aside>/)?.[0];
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
      label: "实验金币+1",
      category: "money",
      isDebuff: true,
      sources: [expect.stringContaining("显卡故障 · 剩余 6 月")],
    })]);
    expect(buckets.monthly[0]!.sources[0]).toContain("玩家与同学共享");
    expect(buckets.monthly[0]!.sources[0]).toContain("优先导师经费，不足玩家自付，同学不足转横向");
  });

  it.each([
    { delta: 2, label: "实验金币+2", isDebuff: true },
    { delta: -1, label: "实验金币-1", isDebuff: false },
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
      const chip = getEffectChip(renderBuffSidebar(createPlayingState(buffs)), "实验金币+1");
      expect(chip).toContain(duration);
      buffs = advanceBuffDurations(buffs);
    }

    expect(buildBuffDisplayBuckets(buffs).monthly).toEqual([]);
    expect(renderBuffSidebar(createPlayingState(buffs))).not.toContain("实验金币+1");
  });

  it.each([0, -1])("hides an expired Buff with %i remaining months from both display paths", (remainingMonths) => {
    const buffs = [{ ...createLabGpuFailureBuff(), remainingMonths }];
    expect(buildBuffDisplayBuckets(buffs).monthly).toEqual([]);
    const sidebar = renderBuffSidebar(createPlayingState(buffs));
    expect(sidebar).not.toContain("实验金币+1");
    expect(sidebar).not.toContain("显卡故障");
  });

  it("keeps the shared surcharge alongside personal GPU and internship discounts with existing colors", () => {
    const state = createPlayingState([createLabGpuFailureBuff()]);
    state.shopState.gpuLevel = 8;
    state.internshipState = activateRemoteInternship(state.totalMonths - 1);
    const sidebar = renderBuffSidebar(state);
    const surcharge = getEffectChip(sidebar, "实验金币+1");

    expect(surcharge).toContain('class="effect-chip is-money is-debuff"');
    expect(surcharge).toContain("玩家与同学共享");
    expect(surcharge).toContain("优先导师经费，不足玩家自付，同学不足转横向");
    expect(getEffectChip(sidebar, "实验金币-2")).toContain('class="effect-chip is-money"');
    expect(getEffectChip(sidebar, "实验金币-2")).toContain("个人显卡");
    expect(getEffectChip(sidebar, "实验金币-1")).toContain('class="effect-chip is-money"');
    expect(getEffectChip(sidebar, "实验金币-1")).toContain("远程实习 · 剩余 3 月");

    state.buffs = [{ ...createLabGpuFailureBuff(), remainingMonths: 0 }];
    const expiredSidebar = renderBuffSidebar(state);
    expect(expiredSidebar).not.toContain("实验金币+1");
    getEffectChip(expiredSidebar, "实验金币-2");
    getEffectChip(expiredSidebar, "实验金币-1");
  });

  it.each(["workstation", "relationship"] as const)("explains shared costs and personal discounts in the existing %s help", (activePlayTab) => {
    const help = getPlayHelpContext({ activePlayTab }).pages
      .map((page) => page.summary + page.body).join("").replace(/<[^>]*>/g, "");

    expect(help).toContain("算力短缺持续6个月，玩家与同学每次实验费用+1");
    expect(help).toContain("减免仅限玩家");
    expect(help).toContain("先算共享涨价与个人减免，再");
    if (activePlayTab === "relationship") {
      expect(help).toContain("同学经费不足当次实验费用时改做横向");
    }
  });

  it("clarifies the same scope in the existing equipment help page", () => {
    const help = getPlayHelpContext({ activePlayTab: "shop", activeShopTab: "gear" });
    expect(help.pages).toHaveLength(1);
    expect(help.pages[0]!.body).toContain("个人显卡与实习的实验减免仅限玩家，不影响同学；算力短缺则使双方实验费用上涨");
  });
});
