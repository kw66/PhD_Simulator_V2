import { AI_SLOT_IDS, getAiModelForTotalMonths } from "./v2-ai-shop";
import { getAvailableCoffeeMachineUpgrades } from "./v2-coffee-system";
import { getShopActionBasePrice, type ShopPurchaseAction } from "./v2-lover-gift";
import { canBuyShopItem, getAvailableShopUpgrades } from "./v2-shop-items-ownership";
import type { DispatchPayload, EventChoice, GameState } from "./v2-types";
import type { LabReimbursementReservation } from "./v2-types-relationship";

type ReimbursementKind = LabReimbursementReservation["kind"];
type LabFundingRequest = NonNullable<EventChoice["effects"]["labReimbursementReservation"]>;

function getUncoveredEquipmentPrice(state: GameState, action: ShopPurchaseAction, payload: DispatchPayload): number {
  return getShopActionBasePrice({
    ...state,
    shopState: {
      ...state.shopState,
      entitlements: { gpuTransaction: 0, workstationTransaction: 0 },
    },
  }, action, payload) ?? 0;
}

export function getLabReimbursementReserveAmount(state: GameState, kind: ReimbursementKind): number {
  if (kind === "ai") {
    return AI_SLOT_IDS.reduce((total, slot) => total + getAiModelForTotalMonths(state.totalMonths + 1, slot).price, 0);
  }
  if (kind === "gpu") {
    return canBuyShopItem(state, "gpu_buy")
      ? getUncoveredEquipmentPrice(state, "buy-shop-item", { shopItemId: "gpu_buy" }) : 0;
  }
  const prices = [0];
  for (const shopItemId of ["keyboard", "monitor", "chair"] as const) {
    if (canBuyShopItem(state, shopItemId)) {
      prices.push(getUncoveredEquipmentPrice(state, "buy-shop-item", { shopItemId }));
    }
  }
  for (const upgrade of getAvailableShopUpgrades(state, "chair")) {
    prices.push(getUncoveredEquipmentPrice(state, "upgrade-shop-item", { shopUpgradeId: upgrade.id }));
  }
  if (!state.coffeeState.machineOwned) {
    prices.push(getUncoveredEquipmentPrice(state, "buy-coffee-machine", {}));
  }
  for (const upgrade of getAvailableCoffeeMachineUpgrades(state.coffeeState)) {
    prices.push(getUncoveredEquipmentPrice(state, "upgrade-coffee-machine", { shopUpgradeId: upgrade.id }));
  }
  return Math.max(...prices);
}

export function reserveLabReimbursement(state: GameState, kind: LabFundingRequest): GameState {
  if (typeof kind === "object") return state;
  const reservations = state.advisorProgressState.labReimbursements ?? [];
  const coveredTotalMonths = kind === "ai" ? state.totalMonths + 1 : null;
  if (kind === "ai" && reservations.some((reservation) => reservation.kind === "ai"
    && reservation.coveredTotalMonths === coveredTotalMonths)) return state;
  const { amount, affordable } = getLabReimbursementQuote(state, kind);
  if (!affordable) return state;
  return {
    ...state,
    advisorProgressState: {
      ...state.advisorProgressState,
      funding: state.advisorProgressState.funding - amount,
      labReimbursements: [...reservations, { kind, amount, coveredTotalMonths }],
    },
  };
}

export function getLabReimbursementQuote(state: GameState, kind: LabFundingRequest) {
  const alreadyReserved = kind === "ai" && state.advisorProgressState.labReimbursements?.some((reservation) =>
    reservation.kind === "ai" && reservation.coveredTotalMonths === state.totalMonths + 1);
  const amount = typeof kind === "object" ? kind.amount : alreadyReserved ? 0 : getLabReimbursementReserveAmount(state, kind);
  const affordable = state.advisorProgressState.funding >= amount;
  return {
    amount,
    affordable,
    disabledReason: affordable ? undefined : `实验室经费不足，${typeof kind === "object" ? "劳务费需支出" : "报销需预留"} ${amount} 金币，当前可用 ${state.advisorProgressState.funding} 金币。`,
  };
}

export function getLabReimbursementPurchaseQuote(state: GameState, action: ShopPurchaseAction, payload: DispatchPayload) {
  const kind = action === "buy-shop-item" && payload.shopItemId === "gpu_buy" ? "gpu"
    : (action === "buy-shop-item" && ["keyboard", "monitor", "chair"].includes(payload.shopItemId ?? ""))
      || action === "upgrade-shop-item" || action === "buy-coffee-machine" || action === "upgrade-coffee-machine"
      ? "workstation" : null;
  if (!kind || state.shopState.entitlements[kind === "gpu" ? "gpuTransaction" : "workstationTransaction"] <= 0) return null;
  const reservations = state.advisorProgressState.labReimbursements ?? [];
  const index = reservations.findIndex((reservation) => reservation.kind === kind);
  if (index < 0) return null;
  const reservation = reservations[index]!;
  const actualCost = getUncoveredEquipmentPrice(state, action, payload);
  const additionalFunding = Math.max(0, actualCost - reservation.amount);
  const refund = Math.max(0, reservation.amount - actualCost);
  return {
    index,
    additionalFunding,
    refund,
    disabledReason: additionalFunding > state.advisorProgressState.funding
      ? `实验室经费不足，报销预留 ${reservation.amount} 金币，本次需 ${actualCost} 金币，差额 ${additionalFunding} 金币超过可用经费 ${state.advisorProgressState.funding} 金币。`
      : undefined,
  };
}

export function settleLabReimbursementPurchase(state: GameState, action: ShopPurchaseAction, payload: DispatchPayload): GameState {
  const quote = getLabReimbursementPurchaseQuote(state, action, payload);
  if (!quote || quote.disabledReason) return state;
  const reservations = state.advisorProgressState.labReimbursements ?? [];
  return {
    ...state,
    advisorProgressState: {
      ...state.advisorProgressState,
      funding: state.advisorProgressState.funding + quote.refund - quote.additionalFunding,
      labReimbursements: reservations.filter((_, reservationIndex) => reservationIndex !== quote.index),
    },
  };
}

export function reconcileLabAiReimbursements(state: GameState, completedTotalMonths: number): GameState {
  const reservations = state.advisorProgressState.labReimbursements ?? [];
  const completed = reservations.filter((reservation) => reservation.kind === "ai"
    && reservation.coveredTotalMonths !== null && reservation.coveredTotalMonths <= completedTotalMonths);
  if (completed.length === 0) return state;
  let funding = state.advisorProgressState.funding;
  for (const reservation of completed) {
    const coveredMonth = reservation.coveredTotalMonths!;
    const actualCost = AI_SLOT_IDS.reduce((total, slot) => {
      const subscription = state.aiShopState.subscriptions[slot];
      return total + (subscription.active && subscription.lastRenewalTotalMonths === coveredMonth
        ? getAiModelForTotalMonths(coveredMonth, slot).price : 0);
    }, 0);
    funding = Math.max(0, funding + reservation.amount - actualCost);
  }
  return {
    ...state,
    advisorProgressState: {
      ...state.advisorProgressState,
      funding,
      labReimbursements: reservations.filter((reservation) => !completed.includes(reservation)),
    },
  };
}
