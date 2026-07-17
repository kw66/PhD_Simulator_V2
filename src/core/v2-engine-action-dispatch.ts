import {
  buyCoffeeAction,
  buyCoffeeMachineAction,
  buyShopItemAction,
  buySupportItemAction,
  sellCoffeeMachineAction,
  sellShopItemAction,
  sellSupportItemAction,
  upgradeCoffeeMachineAction,
  upgradeShopItemAction,
} from "./v2-engine-economy-actions";
import {
  applyPaperAction as runPaperAction,
  createPaperAction as runCreatePaperAction,
  readPaperAction as runReadPaperAction,
  submitPaperAction as runSubmitPaperAction,
} from "./v2-engine-paper-actions";
import {
  advanceAdvisorTaskAction as runAdvisorTaskAction,
  advanceFellowTaskAction as runFellowTaskAction,
  advanceLoverTaskAction as runLoverTaskAction,
} from "./v2-engine-relationship-actions";
import { pushLog } from "./v2-engine-helpers";
import { createStartedGameState } from "./v2-engine-state-factory";
import { createBeforeGradSchoolAct1Event } from "./v2-fixed-events-before-grad-school";
import { enqueueEventQueueItem } from "./v2-event-queue";
import type {
  DispatchPayload,
  GameActionId,
  GameState,
  Paper,
  PlayerStats,
} from "./v2-types";

type SpendAction = (
  state: GameState,
  text: string,
  updater: (player: PlayerStats) => PlayerStats,
  papers?: Paper[],
) => GameState;

type GetActionBlockedState = (state: GameState) => GameState | null;
type ApplyStateProgression = (state: GameState) => GameState;
type CreateInitialState = () => GameState;

export function dispatchSetupAction(
  state: GameState,
  actionId: GameActionId,
  payload: DispatchPayload,
  createInitialState: CreateInitialState,
): GameState | null {
  switch (actionId) {
    case "select-role":
      return payload.roleId
        ? {
            ...state,
            selectedRoleId: payload.roleId,
            setupSelectedRoleId: payload.roleId,
          }
        : state;
    case "select-advisor":
      return payload.advisorId ? { ...state, selectedAdvisorId: payload.advisorId } : state;
    case "start-game": {
      const roleId = payload.roleId ?? state.setupSelectedRoleId ?? (state.phase === "setup" ? null : state.selectedRoleId);
      const advisorId = payload.advisorId ?? state.selectedAdvisorId;
      if (!roleId) {
        return pushLog(state, "请先选择角色。");
      }
      const startedState = createStartedGameState(roleId, advisorId);
      if (advisorId) {
        return startedState;
      }
      return pushLog(
        enqueueEventQueueItem(startedState, createBeforeGradSchoolAct1Event(startedState)) as GameState,
        "触发事件：读研之前",
      );
    }
    case "reset-game":
      return createInitialState();
    default:
      return null;
  }
}

export function dispatchEconomyAction(
  state: GameState,
  actionId: GameActionId,
  payload: DispatchPayload,
): GameState | null {
  switch (actionId) {
    case "buy-coffee":
      return buyCoffeeAction(state);
    case "buy-coffee-machine":
      return buyCoffeeMachineAction(state);
    case "upgrade-coffee-machine":
      return upgradeCoffeeMachineAction(state, payload.eventId);
    case "sell-coffee-machine":
      return sellCoffeeMachineAction(state);
    case "buy-shop-item":
      return buyShopItemAction(state, payload.shopItemId);
    case "upgrade-shop-item":
      return upgradeShopItemAction(state, payload.shopUpgradeId);
    case "sell-shop-item":
      return sellShopItemAction(state, payload.shopItemId);
    case "buy-support-item":
      return buySupportItemAction(state, payload.supportItemId);
    case "sell-support-item":
      return sellSupportItemAction(state, payload.supportItemId);
    default:
      return null;
  }
}

export function dispatchRelationshipAction(
  state: GameState,
  actionId: GameActionId,
  payload: DispatchPayload,
  applyStateProgression: ApplyStateProgression,
): GameState | null {
  switch (actionId) {
    case "advance-advisor-task":
      return runAdvisorTaskAction(state, false, applyStateProgression);
    case "interact-advisor":
      return runAdvisorTaskAction(state, true, applyStateProgression);
    case "advance-lover-task":
      return runLoverTaskAction(state, false, applyStateProgression);
    case "interact-lover":
      return runLoverTaskAction(state, true, applyStateProgression);
    case "advance-fellow-task":
      return runFellowTaskAction(state, payload.relationshipId, false, applyStateProgression);
    case "interact-fellow":
      return runFellowTaskAction(state, payload.relationshipId, true, applyStateProgression);
    default:
      return null;
  }
}

export function dispatchPaperProgressAction(
  state: GameState,
  actionId: GameActionId,
  payload: DispatchPayload,
  getActionBlockedState: GetActionBlockedState,
  spendAction: SpendAction,
): GameState | null {
  switch (actionId) {
    case "select-paper":
      return payload.paperId ? { ...state, selectedPaperId: payload.paperId } : state;
    case "create-paper":
      return runCreatePaperAction(state, spendAction);
    case "read":
      return runReadPaperAction(state, getActionBlockedState, spendAction);
    case "idea":
      return runPaperAction(state, "idea", getActionBlockedState, spendAction, payload.paperId);
    case "experiment":
      return runPaperAction(state, "experiment", getActionBlockedState, spendAction, payload.paperId);
    case "write":
      return runPaperAction(state, "writing", getActionBlockedState, spendAction, payload.paperId);
    default:
      return null;
  }
}

export function dispatchPaperSubmissionAction(
  state: GameState,
  actionId: GameActionId,
  payload: DispatchPayload,
  spendAction: SpendAction,
): GameState | null {
  switch (actionId) {
    case "submit-c":
      return runSubmitPaperAction(state, "C", spendAction, payload.paperId);
    case "submit-b":
      return runSubmitPaperAction(state, "B", spendAction, payload.paperId);
    case "submit-a":
      return runSubmitPaperAction(state, "A", spendAction, payload.paperId);
    default:
      return null;
  }
}
