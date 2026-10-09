import type { DispatchPayload, GameActionId, GameState, ShopEntitlementState } from "./v2-types";

export type LabReimbursementKind = keyof ShopEntitlementState;

export function getLabReimbursementCount(state: Pick<GameState, "shopState" | "totalMonths">, kind: LabReimbursementKind): number {
  const reimbursement = state.shopState.labReimbursements;
  return reimbursement.totalMonths === state.totalMonths ? reimbursement[kind] : 0;
}

export function getLabReimbursementKind(actionId: GameActionId, payload: DispatchPayload): LabReimbursementKind | null {
  if (actionId === "buy-shop-item") {
    if (payload.shopItemId === "gpu_buy") return "gpuTransaction";
    if (["keyboard", "monitor", "chair"].includes(payload.shopItemId ?? "")) return "workstationTransaction";
  }
  if (actionId === "upgrade-shop-item" || actionId === "buy-coffee-machine" || actionId === "upgrade-coffee-machine") {
    return "workstationTransaction";
  }
  return null;
}
