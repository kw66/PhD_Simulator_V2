import { pushNoOpLog } from "./v2-engine-helpers";
import { createStartedGameState } from "./v2-engine-state-factory";
import { createBeforeGradSchoolAct1Event } from "./v2-fixed-events-before-grad-school";
import { enqueueEventQueueItem } from "./v2-event-queue";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import { initializeAcademicRun } from "./v2-rewinder-academic";
import type {
  DispatchPayload,
  GameActionId,
  GameState,
} from "./v2-types";

type CreateInitialState = () => GameState;

export function dispatchSetupAction(
  state: GameState,
  actionId: GameActionId,
  payload: DispatchPayload,
  createInitialState: CreateInitialState,
): GameState | null {
  switch (actionId) {
    case "select-role":
      return state.phase === "setup" && payload.roleId
        ? {
            ...state,
            selectedRoleId: payload.roleId,
            setupSelectedRoleId: payload.roleId,
          }
        : state;
    case "start-game": {
      if (state.phase !== "setup") return state;
      const roleId = payload.roleId ?? state.setupSelectedRoleId;
      if (!roleId) {
        return pushNoOpLog(state, "请先选择角色。");
      }
      let startedState = {
        ...createStartedGameState(roleId, payload.talentAllocation, payload.bonusTalentPoints, payload.curseDifficulty, payload.captainTagLevels, payload.rewinderArchive, payload.rewinderCycleNumber),
        blockLinearEvents: state.blockLinearEvents,
        debugEventReplayEnabled: state.debugEventReplayEnabled,
      };
      if (roleId === "rewinder" && usesGameplayRulesFrom("20261018-r9")) {
        const academic = initializeAcademicRun(startedState, payload.rewinderAcademicArchive, payload.rewinderStartYear ?? 1);
        if (!academic) return state;
        startedState = { ...academic, blockLinearEvents: state.blockLinearEvents, debugEventReplayEnabled: state.debugEventReplayEnabled };
        if ((payload.rewinderStartYear ?? 1) > 1) return startedState;
      }
      return enqueueEventQueueItem(
        startedState,
        createBeforeGradSchoolAct1Event(startedState),
      );
    }
    case "reset-game":
      return {
        ...createInitialState(),
        blockLinearEvents: state.blockLinearEvents,
        debugEventReplayEnabled: state.debugEventReplayEnabled,
      };
    default:
      return null;
  }
}
