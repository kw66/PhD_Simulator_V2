import { applyAdvisorProgressDeltas } from "./v2-advisor-progress";
import {
  cloneAdvisorProgressState,
  cloneConferenceCareerState,
  cloneConferenceEncounterState,
  cloneFellowProgressState,
  cloneInternshipState,
  cloneJointTrainingState,
  cloneLoverProgressState,
  cloneLoverState,
  cloneRelationshipState,
  cloneResearchCapacityState,
} from "./v2-engine-helpers";
import { applyRelationshipAdditions } from "./v2-engine-event-resolution-relationships";
import {
  applyResearchCapacityDeltas,
  clampResearchToCap,
} from "./v2-research-cap-system";
import { addMentorshipStacks } from "./v2-relationship-rules";
import type { EventChoice, GameState } from "./v2-types";

export interface SocialSystemResolution {
  nextPlayer: GameState["player"];
  relationshipState: GameState["relationshipState"];
  conferenceEncounterState: GameState["conferenceEncounterState"];
  conferenceCareerState: GameState["conferenceCareerState"];
  internshipState: GameState["internshipState"];
  loverState: GameState["loverState"];
  loverProgressState: GameState["loverProgressState"];
  fellowProgressState: GameState["fellowProgressState"];
  researchCapacityState: GameState["researchCapacityState"];
  advisorProgressState: GameState["advisorProgressState"];
  jointTrainingState: GameState["jointTrainingState"];
}

export function applySocialSystemChoiceEffects(
  state: GameState,
  choice: EventChoice,
  nextPlayer: GameState["player"],
  nextSanCap: number,
): SocialSystemResolution {
  let relationshipState = cloneRelationshipState(state);
  const conferenceEncounterState = cloneConferenceEncounterState(state);
  const conferenceCareerState = cloneConferenceCareerState(state);
  const internshipState = cloneInternshipState(state);
  const loverState = cloneLoverState(state);
  let loverProgressState = cloneLoverProgressState(state);
  let fellowProgressState = cloneFellowProgressState(state);
  let researchCapacityState = cloneResearchCapacityState(state);
  let advisorProgressState = cloneAdvisorProgressState(state);
  const jointTrainingState = cloneJointTrainingState(state);

  relationshipState = addMentorshipStacks(relationshipState, choice.effects.mentorshipStacks ?? 0);
  if (choice.effects.conferenceEncounterUpdates) {
    Object.assign(conferenceEncounterState, choice.effects.conferenceEncounterUpdates);
  }
  if (choice.effects.conferenceCareerUpdates) {
    Object.assign(conferenceCareerState, choice.effects.conferenceCareerUpdates);
  }
  if (choice.effects.internshipStateUpdates) {
    Object.assign(internshipState, choice.effects.internshipStateUpdates);
  }
  if (choice.effects.loverStateUpdates) {
    Object.assign(loverState, choice.effects.loverStateUpdates);
  }
  if (choice.effects.loverProgressStateUpdates) {
    Object.assign(loverProgressState, choice.effects.loverProgressStateUpdates);
  }

  researchCapacityState = applyResearchCapacityDeltas(
    researchCapacityState,
    choice.effects.researchCapacityStateDeltas,
  );
  advisorProgressState = applyAdvisorProgressDeltas(
    advisorProgressState,
    choice.effects.advisorProgressStateDeltas,
  );
  if (choice.effects.jointTrainingStateUpdates) {
    Object.assign(jointTrainingState, choice.effects.jointTrainingStateUpdates);
  }

  nextPlayer.research = clampResearchToCap(nextPlayer.research, researchCapacityState);
  if (choice.effects.restoreSanToCap === true) {
    nextPlayer.san = nextSanCap;
  }

  const relationshipUpdates = applyRelationshipAdditions(
    state,
    choice,
    relationshipState,
    fellowProgressState,
    loverProgressState,
    nextPlayer,
  );
  relationshipState = relationshipUpdates.relationshipState;
  fellowProgressState = relationshipUpdates.fellowProgressState;
  loverProgressState = relationshipUpdates.loverProgressState;

  return {
    nextPlayer,
    relationshipState,
    conferenceEncounterState,
    conferenceCareerState,
    internshipState,
    loverState,
    loverProgressState,
    fellowProgressState,
    researchCapacityState,
    advisorProgressState,
    jointTrainingState,
  };
}
