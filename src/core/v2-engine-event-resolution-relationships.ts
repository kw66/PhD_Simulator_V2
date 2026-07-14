import {
  createFellowProgressProfile,
  isFellowType,
} from "./v2-fellow-progression";
import { activateLoverProgress } from "./v2-lover-progression";
import { tryAddRelationship } from "./v2-relationship-rules";
import type { EventChoice, GameState } from "./v2-types";

export function applyRelationshipAdditions(
  state: GameState,
  choice: EventChoice,
  relationshipState: GameState["relationshipState"],
  fellowProgressState: GameState["fellowProgressState"],
  loverProgressState: GameState["loverProgressState"],
  nextPlayer: GameState["player"],
): {
  relationshipState: GameState["relationshipState"];
  fellowProgressState: GameState["fellowProgressState"];
  loverProgressState: GameState["loverProgressState"];
} {
  let nextRelationshipState = relationshipState;
  let nextFellowProgressState = fellowProgressState;
  let nextLoverProgressState = loverProgressState;
  let loverRelationshipAdded = false;

  for (const relationshipKind of choice.effects.relationshipAdditions ?? []) {
    const relationshipResult = tryAddRelationship(nextRelationshipState, relationshipKind);
    nextRelationshipState = relationshipResult.nextState;
    if (!relationshipResult.added) {
      continue;
    }
    if (relationshipKind === "lover") {
      loverRelationshipAdded = true;
    }
    if (isFellowType(relationshipKind)) {
      nextFellowProgressState = [
        ...nextFellowProgressState,
        createFellowProgressProfile(relationshipKind, state.totalMonths),
      ];
    }
  }

  if (choice.effects.activateLoverProgress && loverRelationshipAdded) {
    nextLoverProgressState = activateLoverProgress(choice.effects.activateLoverProgress, nextPlayer.research);
  }

  return {
    relationshipState: nextRelationshipState,
    fellowProgressState: nextFellowProgressState,
    loverProgressState: nextLoverProgressState,
  };
}
