import {
  COFFEE_MACHINE_PRICE,
  canBuyCoffee,
  canBuyCoffeeMachine,
  canSellCoffeeMachine,
  getAvailableCoffeeMachineUpgrades,
  getCoffeeBuyPrice,
  getCoffeeMachineOwnedText,
  getCoffeeMachineSellPrice,
  getCurrentCoffeeBonus,
} from "../core/v2-coffee-system";
import { hasBlockingQueueEvent } from "../core/v2-event-queue";
import { isPreEnrollmentState } from "../core/v2-progression";
import {
  canBuyShopItem,
  canSellShopItem,
  getAvailableShopUpgrades,
  getShopItemDefinition,
  getShopItemOwnedText,
  getShopItemSellPrice,
  getShopUpgradeDefinition,
} from "../core/v2-shop-items";
import { getSupportItemDefinition, getSupportItemSellPrice, isSupportItemOwned } from "../core/v2-support-items";
import type {
  CoffeeMachineUpgradeId,
  GameState,
  ShopItemId,
  ShopUpgradeId,
  SupportItemId,
} from "../core/v2-types";

export type ShopTabId = "ai" | "rest" | "coffee" | "display" | "outdoor" | "misc";

type ShopTabDefinition = {
  id: ShopTabId;
  label: string;
};

type ActionButtonConfig = {
  action?: string;
  className?: string;
  label: string;
  disabled?: boolean;
  title?: string;
  eventId?: string;
  shopItemId?: ShopItemId;
  shopUpgradeId?: ShopUpgradeId;
  supportItemId?: SupportItemId;
};

type RowConfig = {
  icon: string;
  name: string;
  status?: string;
  description: string;
  dim?: boolean;
  actions?: string[];
};

const SHOP_TABS: ShopTabDefinition[] = [
  { id: "ai", label: "AI" },
  { id: "rest", label: "休息" },
  { id: "coffee", label: "咖啡" },
  { id: "display", label: "显示" },
  { id: "outdoor", label: "出行" },
  { id: "misc", label: "杂项" },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeShopTab(value: string | undefined | null): ShopTabId {
  return SHOP_TABS.some((tab) => tab.id === value) ? (value as ShopTabId) : "ai";
}

function renderActionButton(config: ActionButtonConfig): string {
  const attrs = [
    `class="${escapeHtml(config.className ?? "shop-item-btn")}"`,
    'type="button"',
  ];

  if (config.action) attrs.push(`data-action="${escapeHtml(config.action)}"`);
  if (config.eventId) attrs.push(`data-event-id="${escapeHtml(config.eventId)}"`);
  if (config.shopItemId) attrs.push(`data-shop-item-id="${escapeHtml(config.shopItemId)}"`);
  if (config.shopUpgradeId) attrs.push(`data-shop-upgrade-id="${escapeHtml(config.shopUpgradeId)}"`);
  if (config.supportItemId) attrs.push(`data-support-item-id="${escapeHtml(config.supportItemId)}"`);
  if (config.title) attrs.push(`title="${escapeHtml(config.title)}"`);
  if (config.disabled) attrs.push("disabled");

  return `<button ${attrs.join(" ")}>${escapeHtml(config.label)}</button>`;
}

function renderShopRow(config: RowConfig): string {
  const actions = config.actions?.filter(Boolean) ?? [];
  return `
    <article class="shop-item-row${config.dim ? " is-dim" : ""}">
      <div class="shop-item-info">
        <div class="shop-item-name-line">
          <strong class="shop-item-name">${escapeHtml(`${config.icon} ${config.name}`)}</strong>
          ${config.status ? `<span class="shop-item-status">${escapeHtml(config.status)}</span>` : ""}
        </div>
        <p class="shop-item-desc">${escapeHtml(config.description)}</p>
      </div>
      ${actions.length > 0 ? `<div class="shop-item-btns">${actions.join("")}</div>` : ""}
    </article>
  `;
}

function renderShopTabButtons(activeTab: ShopTabId): string {
  return SHOP_TABS.map((tab) => {
    const activeClass = tab.id === activeTab ? " active" : "";
    return `
      <button
        class="shop-tab-btn${activeClass}"
        type="button"
        data-ui-shop-tab="${tab.id}"
        aria-pressed="${tab.id === activeTab ? "true" : "false"}"
      >${tab.label}</button>
    `;
  }).join("");
}

function getEconomyLockText(state: GameState): string {
  if (isPreEnrollmentState(state)) {
    return "入学后开放";
  }
  if (hasBlockingQueueEvent(state) || state.pendingDecision) {
    return "请先处理待办事件或关键抉择";
  }
  return "";
}

function buildDisabled(primaryDisabled: boolean, economyLocked: boolean): boolean {
  return primaryDisabled || economyLocked;
}

function renderGpuRow(state: GameState, economyLocked: boolean): string {
  const shopView = {
    shopState: state.shopState,
    eventSupport: state.eventSupport,
    totalMonths: state.totalMonths,
  };
  const item = getShopItemDefinition("gpu_buy");
  const limit = Math.max(1, state.totalMonths);
  const remaining = Math.max(0, limit - state.shopState.gpuServersBought);
  const canBuy = canBuyShopItem(shopView, "gpu_buy");
  const canSell = canSellShopItem(shopView, "gpu_buy");

  return renderShopRow({
    icon: "🖥️",
    name: item.name,
    status: `已购 ${state.shopState.gpuServersBought} / 上限 ${limit}`,
    description: `${item.description} 当前还可购入 ${remaining} 张。`,
    actions: [
      canSell
        ? renderActionButton({
          action: "sell-shop-item",
          shopItemId: "gpu_buy",
          className: "shop-item-btn is-secondary",
          label: `卖出 +${getShopItemSellPrice(shopView, "gpu_buy")}`,
          disabled: buildDisabled(false, economyLocked),
        })
        : "",
      renderActionButton({
        action: "buy-shop-item",
        shopItemId: "gpu_buy",
        className: "shop-item-btn",
        label: `买入 -${item.price}`,
        disabled: buildDisabled(state.player.money < item.price || !canBuy, economyLocked),
      }),
    ],
  });
}

function renderShopItemRow(
  state: GameState,
  itemId: ShopItemId,
  icon: string,
  economyLocked: boolean,
): string {
  const shopView = {
    shopState: state.shopState,
    eventSupport: state.eventSupport,
    totalMonths: state.totalMonths,
  };
  const item = getShopItemDefinition(itemId);
  const canBuy = canBuyShopItem(shopView, itemId);
  const canSell = canSellShopItem(shopView, itemId);

  return renderShopRow({
    icon,
    name: item.name,
    status: getShopItemOwnedText(shopView, itemId),
    description: item.description,
    actions: [
      canSell
        ? renderActionButton({
          action: "sell-shop-item",
          shopItemId: itemId,
          className: "shop-item-btn is-secondary",
          label: `卖出 +${getShopItemSellPrice(shopView, itemId)}`,
          disabled: buildDisabled(false, economyLocked),
        })
        : "",
      renderActionButton({
        action: "buy-shop-item",
        shopItemId: itemId,
        className: "shop-item-btn",
        label: `买入 -${item.price}`,
        disabled: buildDisabled(state.player.money < item.price || !canBuy, economyLocked),
      }),
    ],
  });
}

function renderShopUpgradeRows(
  state: GameState,
  itemId: Extract<ShopItemId, "chair" | "monitor" | "bike">,
  icon: string,
  economyLocked: boolean,
): string {
  const upgrades = getAvailableShopUpgrades({ shopState: state.shopState }, itemId);
  const allUpgrades = itemId === "chair"
    ? (["chair-advanced", "chair-massage", "chair-torture", "chair-spike", "chair-hammock"] as const)
    : itemId === "monitor"
      ? (["monitor-4k", "monitor-smart", "monitor-dual"] as const)
      : (["bike-road", "bike-ebike"] as const);

  return allUpgrades.map((upgradeId) => {
      const upgrade = upgrades.find((entry) => entry.id === upgradeId) ?? null;
      const currentUpgrade = itemId === "chair"
        ? state.shopState.chairUpgrade
        : itemId === "monitor"
          ? state.shopState.monitorUpgrade
          : state.shopState.bikeUpgrade;
      const targetUpgradeId = upgradeId.split("-")[1];
      const isCurrent = currentUpgrade === targetUpgradeId;
      const lockedByBase = itemId === "chair"
        ? !state.shopState.chairOwned
        : itemId === "monitor"
          ? !state.shopState.monitorOwned
          : !state.shopState.bikeOwned;
      const definition = getShopUpgradeDefinition(upgradeId);

      return renderShopRow({
        icon,
        name: `升级 · ${definition.name}`,
        status: isCurrent ? "已装备" : "",
        description: definition.description,
        dim: lockedByBase,
        actions: [
          renderActionButton({
            action: "upgrade-shop-item",
            shopUpgradeId: upgradeId,
            className: "shop-item-btn",
            label: isCurrent ? "已装备" : `升级 -${definition.price}`,
            disabled: buildDisabled(
              lockedByBase || isCurrent || upgrade === null || state.player.money < definition.price,
              economyLocked,
            ),
          }),
        ],
      });
    }).join("");
}

function renderCoffeeRows(state: GameState, economyLocked: boolean): string {
  const coffeePrice = getCoffeeBuyPrice(state.coffeeState);
  const coffeeBonus = getCurrentCoffeeBonus(state.coffeeState);
  const coffeeSanGain = 3 + coffeeBonus;
  const coffeeDescription = state.coffeeState.machineOwned
    ? `当前恢复 SAN +${coffeeSanGain}，本月已买 ${state.coffeeState.manualCoffeeBoughtThisMonth} 杯。`
    : `当前恢复 SAN +${coffeeSanGain}，未购入咖啡机时每月限买 1 杯。`;
  const coffeeMachineSellPrice = getCoffeeMachineSellPrice(state.coffeeState);
  const machineUpgrades = getAvailableCoffeeMachineUpgrades(state.coffeeState);
  const currentUpgrade = state.coffeeState.machineUpgrade;

  const rows = [
    renderShopRow({
      icon: "☕",
      name: "冰美式",
      status: state.coffeeState.manualCoffeeBoughtThisMonth > 0 ? `本月已买 ${state.coffeeState.manualCoffeeBoughtThisMonth} 杯` : "本月未购买",
      description: coffeeDescription,
      actions: [
        renderActionButton({
          action: "buy-coffee",
          className: "shop-item-btn",
          label: `买入 -${coffeePrice}`,
          disabled: buildDisabled(state.player.money < coffeePrice || !canBuyCoffee(state.coffeeState), economyLocked),
        }),
      ],
    }),
    renderShopRow({
      icon: "☕",
      name: "咖啡机",
      status: getCoffeeMachineOwnedText(state.coffeeState),
      description: state.coffeeState.machineOwned
        ? `累计记录 ${state.coffeeState.machineTrackedCoffeeCount} 杯，当前额外 SAN +${coffeeBonus}。`
        : "购入后可为冰美式提供长期增益与升级路线。",
      actions: [
        canSellCoffeeMachine(state.coffeeState)
          ? renderActionButton({
            action: "sell-coffee-machine",
            className: "shop-item-btn is-secondary",
            label: `卖出 +${coffeeMachineSellPrice}`,
            disabled: buildDisabled(false, economyLocked),
          })
          : "",
        renderActionButton({
          action: "buy-coffee-machine",
          className: "shop-item-btn",
          label: `买入 -${COFFEE_MACHINE_PRICE}`,
          disabled: buildDisabled(
            state.player.money < COFFEE_MACHINE_PRICE || !canBuyCoffeeMachine(state.coffeeState),
            economyLocked,
          ),
        }),
      ],
    }),
  ];

  const upgradeIds: Exclude<CoffeeMachineUpgradeId, null>[] = ["automatic", "advanced", "unlimited"];
  for (const upgradeId of upgradeIds) {
    const upgrade = machineUpgrades.find((entry) => entry.id === upgradeId) ?? null;
    const isCurrent = currentUpgrade === upgradeId;
    rows.push(renderShopRow({
      icon: "⚙️",
      name: `升级 · ${upgrade?.name ?? ""}`,
      status: isCurrent ? "已装备" : "",
      description: upgrade?.description ?? "",
      dim: !state.coffeeState.machineOwned,
      actions: [
        renderActionButton({
          action: "upgrade-coffee-machine",
          eventId: upgradeId,
          className: "shop-item-btn",
          label: isCurrent ? "已装备" : `升级 -${upgrade?.price ?? 0}`,
          disabled: buildDisabled(
            !state.coffeeState.machineOwned || isCurrent || upgrade === null || state.player.money < (upgrade?.price ?? 0),
            economyLocked,
          ),
        }),
      ],
    }));
  }

  return rows.join("");
}

function renderSupportItemRow(
  state: GameState,
  itemId: SupportItemId,
  icon: string,
  economyLocked: boolean,
): string {
  const item = getSupportItemDefinition(itemId);
  const owned = isSupportItemOwned(state.eventSupport, itemId);
  const sellPrice = getSupportItemSellPrice(itemId);

  return renderShopRow({
    icon,
    name: item.name,
    status: owned ? "已拥有" : "未拥有",
    description: item.description,
    actions: [
      owned
        ? renderActionButton({
          action: "sell-support-item",
          supportItemId: itemId,
          className: "shop-item-btn is-secondary",
          label: `卖出 +${sellPrice}`,
          disabled: buildDisabled(false, economyLocked),
        })
        : "",
      renderActionButton({
        action: "buy-support-item",
        supportItemId: itemId,
        className: "shop-item-btn",
        label: `买入 -${item.price}`,
        disabled: buildDisabled(owned || state.player.money < item.price, economyLocked),
      }),
    ],
  });
}

function renderTabContent(state: GameState, activeTab: ShopTabId, economyLocked: boolean): string {
  switch (activeTab) {
    case "ai":
      return renderGpuRow(state, economyLocked);
    case "rest":
      return [
        renderShopItemRow(state, "chair", "🪑", economyLocked),
        renderShopUpgradeRows(state, "chair", "⚙️", economyLocked),
      ].join("");
    case "coffee":
      return renderCoffeeRows(state, economyLocked);
    case "display":
      return [
        renderShopItemRow(state, "keyboard", "⌨️", economyLocked),
        renderShopItemRow(state, "monitor", "🖥️", economyLocked),
        renderShopUpgradeRows(state, "monitor", "⚙️", economyLocked),
      ].join("");
    case "outdoor":
      return [
        renderShopItemRow(state, "bike", "🚲", economyLocked),
        renderShopUpgradeRows(state, "bike", "⚙️", economyLocked),
        renderShopItemRow(state, "down_jacket", "🧥", economyLocked),
        renderSupportItemRow(state, "parasol", "🌂", economyLocked),
      ].join("");
    case "misc":
      return [
        renderSupportItemRow(state, "badminton_racket", "🏸", economyLocked),
        renderSupportItemRow(state, "game_controller", "🎮", economyLocked),
      ].join("");
    default:
      return "";
  }
}

export function renderShopSection(state: GameState, requestedTab?: ShopTabId): string {
  const activeTab = normalizeShopTab(requestedTab);
  const preEnrollment = isPreEnrollmentState(state);
  const lockText = getEconomyLockText(state);
  const economyLocked = !preEnrollment && lockText.length > 0;
  const content = preEnrollment
    ? '<div class="shop-empty">入学后开放</div>'
    : renderTabContent(state, activeTab, economyLocked);

  return `
    <div class="shop-panel" id="shop-panel-col2">
      <div class="shop-header-row">
        <span class="shop-title">商店</span>
        <div class="shop-tab-btns">
          ${renderShopTabButtons(activeTab)}
        </div>
      </div>
      ${!preEnrollment && lockText ? `<div class="shop-state-hint">${escapeHtml(lockText)}</div>` : ""}
      <div class="shop-items-list" id="shop-items-list">
        ${content || '<div class="shop-empty">暂无物品</div>'}
      </div>
    </div>
  `;
}
