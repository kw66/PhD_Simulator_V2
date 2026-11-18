import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { investRoleTalentMoney, settleRoleTalentInvestments } from "../src/core/v2-role-talent-investments";
import { captureReplayRecording, verifyReplayRecording } from "../src/core/v2-local-replay";
import { createRunReplay, replayStateDigest } from "../src/core/v2-run-replay";
import type { GameState } from "../src/core/v2-types";

function state(): GameState {
  const s = createInitialState();
  return { ...s, phase: "playing", selectedRoleId: "rich-reversed", totalMonths: 1,
    player: { ...s.player, money: 5003 },
    roleTalents: { levels: { "finance-master": 3, "investment-acceleration": 6, "post-phd-money-conversion": 1, "spend-to-break-curse": 1 } }, degree: "phd" };
}
describe("batch investments", () => {
  it("matches one thousand individual investments without triggering spending rewards or using actions", () => {
    const before = state();
    const batch = investRoleTalentMoney(before, 5000).state;
    let single = before;
    for (let i = 0; i < 1000; i++) single = investRoleTalentMoney(single).state;
    expect(batch.player).toEqual(single.player);
    expect(batch.player.money).toBe(3);
    expect(batch.actionState).toEqual(before.actionState);
    expect(batch.personalSpending).toBe(before.personalSpending);
    expect(batch.roleTalents?.greedQualifiedSpending).toBeUndefined();
    expect(batch.roleTalents?.pendingMoneyConversionTransactions).toBeUndefined();
    expect(batch.roleTalents?.investments).toHaveLength(1);
    expect(settleRoleTalentInvestments({ ...batch, totalMonths: 6 }).count).toBe(0);
    const a = settleRoleTalentInvestments({ ...batch, totalMonths: 7 });
    const b = settleRoleTalentInvestments({ ...single, totalMonths: 7 });
    expect([a.principal, a.interest, a.count, a.state.player.money]).toEqual([b.principal, b.interest, b.count, b.state.player.money]);
    expect([a.principal, a.interest, a.count]).toEqual([5000, 3000, 1000]);
    expect(settleRoleTalentInvestments(a.state).count).toBe(0);
  });
  it.each([0, -5, 6, 5.5, 5005, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid or unaffordable amount %s atomically", amount => {
    const before = state();
    expect(investRoleTalentMoney(before, amount)).toMatchObject({ success: false, state: before });
  });
  it("records and verifies the amount through the normal replay format", async () => {
    const initial = createInitialState();
    const payload = { roleId: "rich" as const, talentAllocation: { "heiress": 4, "red-envelope": 1, "wealth-growth": 1, "investment-savvy": 1 } };
    const started = dispatchAction(initial, "start-game", payload);
    const replay = createRunReplay(initial, started, payload);
    const action = { kind: "action" as const, actionId: "invest-money" as const, payload: { investmentAmount: 5 } };
    const final = dispatchAction(started, action.actionId, action.payload);
    expect(final.player.money).toBe(started.player.money - 5);
    replay.commands.push(action);
    const recording = captureReplayRecording(replay, final);
    expect(replayStateDigest(await verifyReplayRecording(recording))).toBe(replayStateDigest(final));
  });
});
