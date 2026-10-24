import { describe, expect, it, vi } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getPlayerAttributeCap, previewPlayerAttributeChange } from "../src/core/v2-player-attributes";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { getDesignedTalentNodes, getTalentPointBalance, getTalentUpgradeReason, sanitizeRoleTalentAllocation } from "../src/core/v2-role-talent-definitions";
import { FANTASY_CURSE_TARGETS, initializeRoleTalents, settleRoleTalentMonthStart, settleRoleTalentYearEnd } from "../src/core/v2-role-talent-lifecycle";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState } from "../src/core/v2-types";

function playing(levels: Record<string, number> = {}): GameState {
  const state = createStartedGameState("chosen-reversed");
  return { ...state, sanCap: 20, roleTalents: { levels }, player: { research: 3, social: 3, favor: 3, san: 10, money: 10 } };
}
const at = (state: GameState, totalMonths: number): GameState => ({ ...state, totalMonths, ...getCalendarForTotalMonths(totalMonths, state.degree) });
const caps = (state: GameState) => [state.sanCap, ...(["research", "social", "favor"] as const).map(stat=>getPlayerAttributeCap(state,stat))];

describe("r50 fantasy curse and annual talent", () => {
  it("deducts one of seven targets in order without directly spending SAN or coins", () => {
    let state = playing();
    const getRoll = vi.fn(() => { throw new Error("curse is deterministic"); });
    expect(FANTASY_CURSE_TARGETS).toEqual(["sanCap","research","social","favor","researchCap","socialCap","favorCap"]);
    const first = settleRoleTalentMonthStart(at(state,1), getRoll);
    expect(first.player).toEqual(state.player);
    expect(caps(first)).toEqual([20,20,20,20]);
    for (let month=2;month<=15;month++) {
      const old = structuredClone(state);
      const target = FANTASY_CURSE_TARGETS[(month-2)%7]!;
      state = settleRoleTalentMonthStart(at(state,month),getRoll);
      const expectedPlayer = { ...old.player };
      const expectedCaps = caps(old);
      if (target === "sanCap") expectedCaps[0]! -= 1;
      else if (target === "researchCap") expectedCaps[1]! -= 1;
      else if (target === "socialCap") expectedCaps[2]! -= 1;
      else if (target === "favorCap") expectedCaps[3]! -= 1;
      else expectedPlayer[target] -= 1;
      expect(state.player).toEqual(expectedPlayer);
      expect(caps(state)).toEqual(expectedCaps);
      expect(settleRoleTalentMonthStart(state,getRoll)).toBe(state);
    }
    expect(getRoll).not.toHaveBeenCalled();
  });

  it.each([0,3])("resists current attribute loss but not cap loss at reverse-meter rank %i", rank => {
    const state = playing({"reverse-meter-alpha":rank,"reverse-meter-beta":rank,"reverse-meter-gamma":rank});
    state.player = { ...state.player,research:6,social:6,favor:6 };
    for (const [month,stat] of [[3,"research"],[4,"social"],[5,"favor"]] as const) {
      const next = settleRoleTalentMonthStart(at(state,month));
      expect(next.player[stat]).toBeCloseTo(rank ? 5.5 : 5.2);
    }
    for (const [month,stat] of [[6,"research"],[7,"social"],[8,"favor"]] as const) {
      const next=settleRoleTalentMonthStart(at(state,month));
      expect(getPlayerAttributeCap(next,stat)).toBe(19);
      expect(next.player).toEqual(state.player);
    }
  });

  it.each([2,6,7,8])("floors the cap at zero without clearing current overflow in month %i", month => {
    const state = playing({"swap-breaks-cap":1});
    state.sanCap=0;
    state.researchCapacityState={...state.researchCapacityState,otherCapBonus:-20};
    state.roleTalents={...state.roleTalents!,capBonuses:{social:-20,favor:-20}};
    state.player={research:50,social:50,favor:50,san:50,money:50};
    const next=settleRoleTalentMonthStart(at(state,month));
    expect(caps(next)).toEqual([0,0,0,0]);
    expect(next.player).toEqual(state.player);
  });

  it("leaves prior swap overflow intact when a positive cap decreases", () => {
    const state=playing({"swap-breaks-cap":1});
    state.player={research:50,social:50,favor:50,san:50,money:50};
    for (const month of [2,6,7,8]) {
      const next=settleRoleTalentMonthStart(at(state,month));
      expect(next.player).toEqual(state.player);
      expect(caps(next).filter(cap=>cap===19)).toHaveLength(1);
    }
  });

  it.each([1,2,3])("grows only the highest attribute by rank %i at each completed academic year", rank => {
    for (const degree of ["master","phd"] as const) {
      const state={...playing({"annual-highest-growth":rank}),degree};
      state.player={...state.player,research:1,social:3,favor:2};
      expect(initializeRoleTalents(at(state,1)).player).toEqual(state.player);
      expect(settleRoleTalentYearEnd(at(state,1))).toEqual(at(state,1));
      expect(settleRoleTalentYearEnd(at(state,11))).toEqual(at(state,11));
      const first=settleRoleTalentYearEnd(at(state,12));
      expect(caps(first)).toEqual(caps(state));
      expect(first.player).toEqual({...state.player,social:state.player.social+previewPlayerAttributeChange(state,"social",rank).effectiveChange});
      expect(settleRoleTalentYearEnd(first)).toBe(first);
      const second=settleRoleTalentYearEnd(at(first,24));
      expect(caps(second)).toEqual(caps(state));
      expect(second.player).toEqual({...first.player,social:first.player.social+previewPlayerAttributeChange(first,"social",rank).effectiveChange});
    }
  });

  it("uses the initial maximum for ties and applies ordinary resistance and caps", () => {
    const state=playing({"annual-highest-growth":2,"reverse-meter-alpha":3});
    state.player={...state.player,research:6,social:4,favor:6};
    const result=settleRoleTalentYearEnd(at(state,12));
    expect(result.player.research).toBeCloseTo(8);
    expect(result.player.social).toBe(4);
    expect(result.player.favor).toBeCloseTo(7.6);
    expect(caps(result)).toEqual(caps(state));
    state.player.research=20;
    const capped=settleRoleTalentYearEnd(at(state,12));
    expect(capped.player).toEqual(state.player);
    const empty=playing();
    expect(settleRoleTalentYearEnd(at(empty,12)).player).toEqual(empty.player);
  });

  it("only unlocks annual highest growth after gamma and charges the stated prices", () => {
    const allocation={"reverse-meter-alpha":1,"reverse-meter-beta":1,"reverse-meter-gamma":1,"annual-highest-growth":3};
    expect(sanitizeRoleTalentAllocation("chosen-reversed",0,allocation)).toEqual(allocation);
    expect(getTalentPointBalance("chosen-reversed",0,allocation)).toBe(4);
    expect(getTalentUpgradeReason("chosen-reversed",0,{},"annual-highest-growth")).not.toBeNull();
    expect(getTalentUpgradeReason("chosen-reversed",0,{"reverse-meter-alpha":1,"reverse-meter-beta":1},"annual-highest-growth")).not.toBeNull();
    const nodes=getDesignedTalentNodes("chosen-reversed")!;
    expect(nodes.find(node=>node.id==="annual-highest-growth")).toMatchObject({name:"渐入佳境",cost:1,maxLevel:3,row:"3",column:"4",prerequisiteIds:["reverse-meter-gamma"]});
    expect(nodes.find(node=>node.id==="swap-breaks-cap")?.cost).toBe(2);
    expect(new Set(nodes.map(node=>node.row+":"+node.column)).size).toBe(nodes.length);
    expect(sanitizeRoleTalentAllocation("chosen-reversed",0,{...allocation,"annual-highest-growth":4})["annual-highest-growth"]).toBe(3);
  });

  it("preserves r49 prices, five-target curse and absence of the new annual reward", () => {
    withGameplayRuleset("20261024-r49",()=>{
      const state=playing({"annual-highest-growth":3});
      expect(settleRoleTalentMonthStart(at(state,2)).player.san).toBe(9);
      expect(settleRoleTalentMonthStart(at(state,3)).player.money).toBe(9);
      expect(caps(settleRoleTalentMonthStart(at(state,2)))).toEqual([20,20,20,20]);
      expect(caps(settleRoleTalentYearEnd(at(state,12)))).toEqual([20,20,20,20]);
      expect(settleRoleTalentYearEnd(at(state,12)).player).toEqual(state.player);
      const nodes=getDesignedTalentNodes("chosen-reversed")!;
      expect(nodes).toHaveLength(10);
      expect(nodes.find(node=>node.id==="swap-breaks-cap")?.cost).toBe(4);
      expect(nodes.find(node=>node.id==="annual-highest-growth")).toBeUndefined();
    });
  });
});

