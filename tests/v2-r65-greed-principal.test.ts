import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyGreedAttributeLoss, settleGreedCoinGames, settleGreedReset } from "../src/core/v2-role-talent-greed";
import { getDesignedTalentNodes } from "../src/core/v2-role-talent-definitions";
import { applyPlayerAttributeChange } from "../src/core/v2-player-attributes";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { createRunReplay, replayStateDigest, executeReplayCommand } from "../src/core/v2-run-replay";
import { captureReplayRecording, verifyReplayRecording } from "../src/core/v2-local-replay";
import type { GameState } from "../src/core/v2-types";

function fixture(): GameState {
 const s=createInitialState();
 return {...s,phase:"playing",selectedRoleId:"rich-reversed",degree:"phd",totalMonths:2,month:2,
  player:{san:10,research:10,social:2,favor:0,money:100},
  roleTalents:{levels:{"loss-to-money":1,"coin-game":1,"coin-game-comeback":5,"post-phd-money-conversion":1,"spend-to-break-curse":1}}};
}
const income=(s:GameState)=>s.achievementProgress?.counters[`income:${s.totalMonths}`]??0;

describe("r65 greed income-only stake",()=>{
 it("merges attribute incomes and compounds all twelve point rolls without staking savings",()=>{
  const before=fixture();
  const queued=applyGreedAttributeLoss(applyGreedAttributeLoss(before,10),2);
  expect(queued.player.money).toBe(100);
  expect(income(queued)).toBe(0);
  expect(queued.roleTalents?.pendingGreedStake).toBe(12);
  expect(queued.roleTalents?.pendingCoinGames).toBe(12);
  let calls=0;
  const settled=settleGreedCoinGames(queued,()=>{calls++;return 0;});
  expect(calls).toBe(12);
  expect(settled.player.money).toBe(1656.96);
  expect(income(settled)).toBe(1556.96);
  expect(settled.roleTalents?.pendingGreedStake).toBe(0);
  expect(settled.roleTalents?.pendingCoinGames).toBe(0);
  expect(settleGreedCoinGames(settled,()=>{throw Error("duplicate draw");})).toBe(settled);
  expect(before.player.money).toBe(100);
 });
 it("losing reduces only new income and never creates spending, conversions, or curse progress",()=>{
  const before=fixture(),queued=applyGreedAttributeLoss(before,12);
  let calls=0;
  const next=settleGreedCoinGames(queued,()=>{calls++;return .9;});
  expect(calls).toBe(12);
  expect(next.player.money).toBe(100.07);
  expect(income(next)).toBe(.07);
  expect(next.personalSpending??0).toBe(0);
  expect(next.roleTalents?.greedQualifiedSpending??0).toBe(0);
  expect(next.roleTalents?.pendingMoneyConversionTransactions??[]).toEqual([]);
  expect(next.player.research).toBe(before.player.research);
  expect(next.sanCap).toBe(before.sanCap);
  expect(next.researchCapacityState).toEqual(before.researchCapacityState);
 });
 it("rounds once after compounded wins and losses, and counts the entire payout as income",()=>{
  const queued=applyGreedAttributeLoss(fixture(),2),rolls=[0,.9];
  const next=settleGreedCoinGames(queued,()=>rolls.shift()!);
  expect(next.player.money).toBe(101.95);
  expect(income(next)).toBe(1.95);
  expect(rolls).toHaveLength(0);
 });
 it("carries fractional point losses across settled batches without per-attribute rounding",()=>{
  let s=applyGreedAttributeLoss(fixture(),.4);
  s=settleGreedCoinGames(s,()=>{throw Error("fraction must not draw");});
  expect(s.roleTalents?.greedLossRemainder).toBe(.4);
  expect(s.roleTalents?.coinGameRemainder).toBe(.4);
  s=applyGreedAttributeLoss(s,.8);
  expect(s.roleTalents?.pendingGreedStake).toBe(1);
  expect(s.roleTalents?.pendingCoinGames).toBe(1);
  const next=settleGreedCoinGames(s,()=>0);
  expect(next.player.money).toBe(101.5);
  expect(next.roleTalents?.greedLossRemainder).toBe(.2);
  expect(next.roleTalents?.coinGameRemainder).toBe(.2);
 });
 it("integrates ordinary attribute reactions and monthly reset without duplicating income",()=>{
  let s=fixture();s.player.research=18;
  s=applyPlayerAttributeChange(s,"research",-1).state;
  expect(s.roleTalents?.greedLossRemainder).toBe(.4);
  expect(s.player.money).toBe(100);
  const reset=settleGreedReset(fixture());
  expect(reset.player).toMatchObject({san:0,research:0,social:0,favor:0,money:100});
  expect(reset.roleTalents?.pendingGreedStake).toBe(12);
  expect(reset.roleTalents?.pendingCoinGames).toBe(12);
  expect(settleGreedReset(reset)).toBe(reset);
  expect(settleGreedCoinGames(reset,()=>0).player.money).toBe(1656.96);
 });
 it("leaves the non-gambling income talent immediate and unchanged",()=>{
  const s=fixture();s.roleTalents!.levels["coin-game"]=0;
  const next=applyGreedAttributeLoss(s,12);
  expect(next.player.money).toBe(112);
  expect(income(next)).toBe(12);
  expect(next.roleTalents?.pendingCoinGames??0).toBe(0);
  expect(settleGreedCoinGames(next)).toBe(next);
 });
 it("preserves r64's wallet stake, income ledger and spending feedback",()=>withGameplayRuleset("20261117-r64",()=>{
  let s=fixture();s.degree="master";
  s=applyGreedAttributeLoss(s,2);
  expect(s.player.money).toBe(102);
  expect(income(s)).toBe(2);
  const next=settleGreedCoinGames(s,()=>.9);
  expect(next.player.money).toBe(43.1);
  expect(next.personalSpending).toBe(58.9);
  expect(next.roleTalents?.greedQualifiedSpending).toBe(58.9);
  expect(income(next)).toBe(2);
 }));
 it("charges two talent points now and retains the historical three-point cost",()=>{
  const cost=()=>getDesignedTalentNodes("rich-reversed").find(n=>n.id==="coin-game")!.cost;
  expect(cost()).toBe(2);
  expect(withGameplayRuleset("20261117-r64",cost)).toBe(3);
 });
 it.each(["20261117-r64","20261119-r65"] as const)("records ordinary start/month actions and verifies %s playback",async ruleset=>{
  const initial=createInitialState();initial.randomState={seed:20261121,cursor:0};
  const payload={roleId:"rich-reversed" as const,talentAllocation:{"money-growth":3,"loss-to-money":1,"post-phd-money-conversion":1,"finance-master":1,"coin-game":1,"coin-game-comeback":5,"spend-to-break-curse":1}};
  const started=withGameplayRuleset(ruleset,()=>dispatchAction(initial,"start-game",payload));
  expect(started.phase).toBe("playing");
  const replay=createRunReplay(initial,started,payload);
  // Construct the historical recording envelope; new recordings always use
  // the current ruleset regardless of an execution-only compatibility scope.
  replay.ruleset=ruleset;
  replay.commands=[{kind:"action",actionId:"start-game",payload,ruleset}];
  const command={kind:"action" as const,actionId:"next-month" as const,payload:{}};
  const final=executeReplayCommand(started,command,ruleset);
  replay.commands.push(command);
  const recording=captureReplayRecording(replay,final);
  const verified=await verifyReplayRecording(recording,{yieldControl:async()=>{}});
  expect(replayStateDigest(verified)).toBe(replayStateDigest(final));
 });
});
