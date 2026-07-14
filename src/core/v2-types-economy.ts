import type {
  BikeUpgradeId,
  ChairUpgradeId,
  CoffeeMachineUpgradeId,
  MonitorUpgradeId,
} from "./v2-types";

export interface ShopState {
  gpuServersBought: number;
  chairOwned: boolean;
  chairUpgrade: ChairUpgradeId;
  keyboardOwned: boolean;
  monitorOwned: boolean;
  monitorUpgrade: MonitorUpgradeId;
  bikeOwned: boolean;
  bikeUpgrade: BikeUpgradeId;
  bikeSanSpent: number;
  bikeSanCapGains: number;
}

export interface ReadingState {
  readCount: number;
  smartMonitorReadCount: number;
  dualMonitorIdeaBonus: number;
}

export interface CoffeeState {
  machineOwned: boolean;
  machineUpgrade: CoffeeMachineUpgradeId;
  manualCoffeeBoughtThisMonth: number;
  totalCoffeeBought: number;
  machineTrackedCoffeeCount: number;
}
