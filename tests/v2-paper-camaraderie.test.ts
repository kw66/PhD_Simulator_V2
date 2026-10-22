import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { projectFellowCoauthoredPapers, settleFellowCoauthoredPapers } from "../src/core/v2-lab-talent";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { FellowTypeId, GameState } from "../src/core/v2-types";

function fixture(type: FellowTypeId, fellowLed: boolean, extraJunior: boolean): GameState {
  const state = createStartedGameState("social", {
    "natural-charisma": 3, "junior-delegation": 1, "junior-bond": 1, "paper-camaraderie": 2,
  });
  expect(state.roleTalents?.levels["paper-camaraderie"]).toBe(2);
  const collaborator = { ...createCustomFellowProgressProfile({
    type, gender: "male", startTotalMonths: 1, research: 8, affinity: 1, name: "合作者",
  }), id: "collaborator", name: "合作者" };
  const unrelated = { ...createCustomFellowProgressProfile({
    type: extraJunior ? "junior" : "peer", gender: "female", startTotalMonths: 1, research: 8, affinity: 1, name: "旁观者",
  }), id: "unrelated" };
  const paper = { ...createDraftPaper(1, 0, () => 0), id: "coauthored", status: "published" as const,
    ...(fellowLed ? { leadAuthorId: collaborator.id, nonFirstAuthor: true,
      collaborators: [{ id: "player", name: "你" }] }
      : { collaborators: [{ id: collaborator.id, name: collaborator.name }] }),
  };
  return { ...state, totalMonths: 13, year: 2, month: 1, eventQueue: [],
    fellowProgressState: [collaborator, unrelated],
    papers: fellowLed ? [] : [paper], externalPublications: fellowLed ? [paper] : [],
  };
}

describe("social paper camaraderie", () => {
  for (const type of ["senior", "peer", "junior"] as const) {
    for (const fellowLed of [false, true]) {
      it.each([false, true])(`rewards only the real ${type} coauthor, fellow-led=${fellowLed}, unrelated junior=%s`, extraJunior => {
        const state = fixture(type, fellowLed, extraJunior);
        const before = structuredClone(state);
        const projected = projectFellowCoauthoredPapers(state);
        const settled = settleFellowCoauthoredPapers(state);
        expect(settled.fellowProgressState[0]).toMatchObject({ affinity: 4, affinityRewardedPaperIds: ["coauthored"] });
        expect(settled.fellowProgressState[1]).toEqual(state.fellowProgressState[1]);
        expect(projected.fellowProgressState).toEqual(settled.fellowProgressState);
        expect(state).toEqual(before);
        expect(settleFellowCoauthoredPapers(settled)).toBe(settled);
        const restored = JSON.parse(JSON.stringify(settled)) as GameState;
        expect(settleFellowCoauthoredPapers(restored)).toBe(restored);
      });
    }
  }

  it.each(["normal", "social-reversed"] as const)("does not grant the social-only bonus to %s", roleId => {
    const state = { ...fixture("peer", false, true), selectedRoleId: roleId };
    // Even a stray persisted talent key must not activate another character's talent.
    expect(settleFellowCoauthoredPapers(state).fellowProgressState.map(profile => profile.affinity)).toEqual([2, 1]);
  });

  it.each([false, true])("retains the old junior prerequisite under r16, unrelated junior=%s", extraJunior => {
    const state = fixture("peer", false, extraJunior);
    const previous = withGameplayRuleset("20261022-r16", () => settleFellowCoauthoredPapers(state));
    expect(previous.fellowProgressState.map(profile => profile.affinity)).toEqual([extraJunior ? 4 : 2, 1]);
    // A paper already rewarded under an old recording is never rewarded again on upgrade.
    expect(settleFellowCoauthoredPapers(previous)).toBe(previous);
  });

  it("still applies each collaborator's resistance and affinity cap", () => {
    const state = fixture("senior", false, false);
    state.fellowProgressState[0]!.affinity = 5;
    expect(settleFellowCoauthoredPapers(state).fellowProgressState[0]!.affinity).toBeCloseTo(7.6, 10);
    state.fellowProgressState[0]!.affinity = 19.9;
    expect(settleFellowCoauthoredPapers(state).fellowProgressState[0]!.affinity).toBe(20);
  });
});
