import {
  buyCoffee,
  buyCoffeeMachine,
  canBuyCoffee,
  canBuyCoffeeMachine,
  canSellCoffeeMachine,
  canUpgradeCoffeeMachine,
  COFFEE_MACHINE_PRICE,
  getCoffeeBuyPrice,
  getCoffeeMachineSellPrice,
  getCoffeeMachineUpgradeDefinition,
  sellCoffeeMachine,
  upgradeCoffeeMachine,
} from "./v2-coffee-system";
import { clampSan, pushLog } from "./v2-engine-helpers";
import { getEconomyActionBlockedState } from "./v2-engine-economy-actions-shared";
import type { DispatchPayload, GameState } from "./v2-types";

export function buyCoffeeAction(state: GameState): GameState {
  const blockedState = getEconomyActionBlockedState(state);
  if (blockedState) {
    return blockedState;
  }
  if (!canBuyCoffee(state.coffeeState)) {
    return pushLog(state, "当前不能再购买冰美式。");
  }

  const price = getCoffeeBuyPrice(state.coffeeState);
  if (state.player.money < price) {
    return pushLog(state, `冰美式需要 ${price} 金钱，当前不足。`);
  }

  const result = buyCoffee(state.coffeeState);
  return pushLog(
    {
      ...state,
      player: {
        ...state.player,
        money: state.player.money - result.price,
        san: clampSan(state.player.san + result.sanGain, state.sanCap),
      },
      coffeeState: result.coffeeState,
    },
    `喝了冰美式，金钱 -${result.price}，SAN +${result.sanGain}。`,
  );
}

export function buyCoffeeMachineAction(state: GameState): GameState {
  const blockedState = getEconomyActionBlockedState(state);
  if (blockedState) {
    return blockedState;
  }
  if (!canBuyCoffeeMachine(state.coffeeState)) {
    return pushLog(state, "咖啡机已拥有，无需重复购买。");
  }
  if (state.player.money < COFFEE_MACHINE_PRICE) {
    return pushLog(state, `咖啡机需要 ${COFFEE_MACHINE_PRICE} 金钱，当前不足。`);
  }

  return pushLog(
    {
      ...state,
      player: { ...state.player, money: state.player.money - COFFEE_MACHINE_PRICE },
      coffeeState: buyCoffeeMachine(state.coffeeState),
    },
    `购入咖啡机，金钱 -${COFFEE_MACHINE_PRICE}。`,
  );
}

export function upgradeCoffeeMachineAction(state: GameState, upgradeId?: DispatchPayload["eventId"]): GameState {
  if (upgradeId !== "automatic" && upgradeId !== "advanced" && upgradeId !== "unlimited") {
    return state;
  }

  const blockedState = getEconomyActionBlockedState(state);
  if (blockedState) {
    return blockedState;
  }
  if (!canUpgradeCoffeeMachine(state.coffeeState, upgradeId)) {
    return pushLog(state, "咖啡机当前无法升级。");
  }

  const upgrade = getCoffeeMachineUpgradeDefinition(upgradeId);
  if (state.player.money < upgrade.price) {
    return pushLog(state, `${upgrade.name} 需要 ${upgrade.price} 金钱，当前不足。`);
  }

  return pushLog(
    {
      ...state,
      player: { ...state.player, money: state.player.money - upgrade.price },
      coffeeState: upgradeCoffeeMachine(state.coffeeState, upgradeId),
    },
    `咖啡机升级为 ${upgrade.name}，金钱 -${upgrade.price}。`,
  );
}

export function sellCoffeeMachineAction(state: GameState): GameState {
  const blockedState = getEconomyActionBlockedState(state);
  if (blockedState) {
    return blockedState;
  }
  if (!canSellCoffeeMachine(state.coffeeState)) {
    return pushLog(state, "当前没有可卖出的咖啡机。");
  }

  const sellPrice = getCoffeeMachineSellPrice(state.coffeeState);
  return pushLog(
    {
      ...state,
      player: { ...state.player, money: state.player.money + sellPrice },
      coffeeState: sellCoffeeMachine(state.coffeeState),
    },
    `卖出咖啡机，金钱 +${sellPrice}。`,
  );
}
