import {
  COFFEE_MACHINE_UPGRADE_DEFINITIONS,
  COFFEE_MACHINE_PRICE,
  getAvailableCoffeeMachineUpgrades,
  getCoffeeBuyPrice,
  getCoffeeMachineSellPrice,
} from "../core/v2-coffee-system";
import { getAiModelForTotalMonths } from "../core/v2-ai-shop";
import { isPreEnrollmentState } from "../core/v2-progression";
import { SHOW_ALL_MODULES_DURING_DEVELOPMENT } from "../core/v2-development-flags";
import anthropicIcon from "../assets/ai/anthropic.svg?raw";
import deepseekIcon from "../assets/ai/deepseek.svg?raw";
import doubaoAvatarUrl from "../assets/ai/doubao-avatar.jpeg";
import geminiIcon from "../assets/ai/gemini.svg?raw";
import kimiIcon from "../assets/ai/kimi.svg?raw";
import openAiIcon from "../assets/ai/openai.svg?raw";
import {
  canSellShopItem,
  getGpuTierDefinition,
  getNextGpuTierDefinition,
  getShopItemDefinition,
  getShopItemSellPrice,
  getShopUpgradeDefinition,
  GPU_TIER_DEFINITIONS,
  isShopItemOwned,
} from "../core/v2-shop-items";
import { getBikeTierDefinition, getNextBikeTierDefinition } from "../core/v2-bike-system";
import { getSupportItemDefinition, getSupportItemSellPrice, isSupportItemOwned } from "../core/v2-support-items";
import { getShopActionPrice } from "../core/v2-shop-transactions";
import type {
  AiSlotId,
  CoffeeMachineUpgradeId,
  GameState,
  ShopItemId,
  ShopUpgradeId,
  SupportItemId,
} from "../core/v2-types";

export type ShopTabId = "ai" | "rest" | "coffee" | "gear";

type ShopTabDefinition = {
  id: ShopTabId;
  icon: string;
  label: string;
};

type ActionButtonConfig = {
  label: string;
  title?: string;
  price?: number | "?";
  priceDirection?: "cost" | "gain";
  variant?: "primary" | "secondary" | "current";
  action?: string;
  itemId?: ShopItemId;
  upgradeId?: ShopUpgradeId | Exclude<CoffeeMachineUpgradeId, null>;
  aiSlotId?: AiSlotId;
  supportItemId?: SupportItemId;
  disabled?: boolean;
  disabledReason?: string;
};

type RowConfig = {
  icon: string;
  iconHtml?: string;
  className?: string;
  upgradeOptionId?: string;
  kind?: string;
  name: string;
  status?: string;
  statusTone?: "neutral" | "owned" | "locked";
  description: string;
  effectText?: string;
  dim?: boolean;
  selected?: boolean;
  selectionSlot?: boolean;
  meta?: Array<{
    label: string;
    value: string;
    tone?: "neutral" | "active" | "warning";
  }>;
  actions?: string[];
  rowAction?: {
    action: "upgrade-shop-item";
    upgradeId: ShopUpgradeId;
    ariaLabel: string;
    disabled?: boolean;
    disabledReason?: string;
  };
  rowSelection?: {
    scope: "chair" | "bike" | "coffee";
    upgradeId: ShopUpgradeId | Exclude<CoffeeMachineUpgradeId, null>;
    ariaLabel: string;
    selected: boolean;
    disabled?: boolean;
    disabledReason?: string;
  };
};

type UpgradeRouteOption = {
  id: string;
  name: string;
  description: string;
  status: string;
  statusTone: "neutral" | "owned" | "locked";
  current: boolean;
  unavailable: boolean;
  price: number;
  action: "upgrade-shop-item" | "upgrade-coffee-machine";
  upgradeId: ShopUpgradeId | Exclude<CoffeeMachineUpgradeId, null>;
  disabledReason?: string;
};

const SHOP_TABS: ShopTabDefinition[] = [
  { id: "ai", icon: "🤖", label: "AI" },
  { id: "coffee", icon: "☕", label: "咖啡" },
  { id: "gear", icon: "🎒", label: "装备" },
  { id: "rest", icon: "🪑", label: "休息" },
];

const AI_ICON_SVGS: Partial<Record<AiSlotId, string>> = {
  gpt: openAiIcon,
  claude: anthropicIcon,
  gemini: geminiIcon,
  deepseek: deepseekIcon,
  kimi: kimiIcon,
};

const AI_ICON_COLORS: Record<AiSlotId, string> = {
  gpt: "#10a37f",
  claude: "#cc785c",
  gemini: "#4285f4",
  deepseek: "#4d6bfe",
  doubao: "#4e6fff",
  kimi: "#18181b",
};

const CHAIR_UPGRADE_IDS = [
  "chair-advanced",
  "chair-massage",
  "chair-torture",
  "chair-spike",
  "chair-hammock",
] as const;

const CHAIR_UPGRADE_ICONS: Record<typeof CHAIR_UPGRADE_IDS[number], string> = {
  "chair-advanced": "💺",
  "chair-massage": "🛋️",
  "chair-torture": "🛋️",
  "chair-spike": "📍",
  "chair-hammock": "🛏️",
};

function renderAiIcon(slot: AiSlotId): string {
  if (slot === "doubao") {
    return `<img class="shop-item-icon-image is-avatar" src="${escapeHtml(doubaoAvatarUrl)}" alt="">`;
  }

  return AI_ICON_SVGS[slot]!
    .replaceAll("currentColor", AI_ICON_COLORS[slot])
    .replace("<svg ", '<svg class="shop-item-icon-image" aria-hidden="true" ');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeShopDescription(value: string): string {
  return value.trim().replace(/[。.]+$/u, "");
}

export function normalizeShopTab(value: string | undefined | null): ShopTabId {
  if (value === "display" || value === "outdoor") return "gear";
  return SHOP_TABS.some((tab) => tab.id === value) ? (value as ShopTabId) : "ai";
}

function renderActionButton(config: ActionButtonConfig): string {
  const variant = config.variant ?? "primary";
  const priceText = config.price !== undefined
    ? `，${config.price} 金币`
    : "";
  const attrs = [
    `class="shop-item-btn is-${variant}${config.price === 0 ? " has-free-price" : ""}"`,
    'type="button"',
    `aria-label="${escapeHtml(`${config.label}${priceText}`)}"`,
  ];
  if (config.action) {
    attrs.push(`data-action="${escapeHtml(config.action)}"`);
    if (config.itemId) attrs.push(`data-shop-item-id="${escapeHtml(config.itemId)}"`);
    if (config.upgradeId) attrs.push(`data-shop-upgrade-id="${escapeHtml(config.upgradeId)}"`);
    if (config.aiSlotId) attrs.push(`data-ai-slot-id="${escapeHtml(config.aiSlotId)}"`);
    if (config.supportItemId) attrs.push(`data-support-item-id="${escapeHtml(config.supportItemId)}"`);
  }
  const title = config.title ?? config.disabledReason;
  if (title) {
    attrs.push(`title="${escapeHtml(title)}"`);
  }
  if (config.disabled) {
    attrs.push('disabled', 'aria-disabled="true"');
  }

  return `
    <button ${attrs.join(" ")}>
      <span class="shop-item-btn-label">${escapeHtml(config.label)}</span>
      ${config.price !== undefined ? `
        <span class="shop-item-btn-price is-${config.priceDirection ?? "cost"}">
          <span aria-hidden="true">💰</span>
          <span>${config.price}</span>
        </span>
      ` : ""}
    </button>
  `;
}

function renderShopEffectHtml(effectText: string): string {
  const renderMetricTextHtml = (value: string): string => value
    .split(/((?:SAN\s*)?(?:[+\-×=]\s*)?\d+(?:\.\d+)?%?(?:\s*(?:分|次|点|金币|杯|月))?)/giu)
    .filter(Boolean)
    .map((part, index) => index % 2 === 1 ? `<strong>${escapeHtml(part)}</strong>` : escapeHtml(part))
    .join("");

  return effectText.split("\n").map((rawLine) => {
    const line = normalizeShopDescription(rawLine);
    const separatorIndex = line.indexOf("：");
    if (separatorIndex < 0) {
      return `<span class="shop-effect-line is-value">${renderMetricTextHtml(line)}</span>`;
    }
    const label = line.slice(0, separatorIndex + 1);
    const value = line.slice(separatorIndex + 1).trim();
    return `
      <span class="shop-effect-line${value ? "" : " is-label-only"}">
        <span>${escapeHtml(label)}</span>
        ${value ? `<strong>${escapeHtml(value)}</strong>` : ""}
      </span>
    `;
  }).join("\n");
}

function renderAiSubscriptionToggle(slot: AiSlotId, enabled: boolean, paused: boolean): string {
  const nextAction = enabled ? "关闭" : "开启";
  return `
    <button
      class="shop-subscription-toggle${enabled ? " is-on" : ""}${paused ? " is-paused" : ""}"
      type="button"
      role="switch"
      aria-checked="${enabled ? "true" : "false"}"
      aria-label="${nextAction}自动续费"
      title="${paused ? "金币不足，本月暂停" : `${nextAction}自动续费`}"
      data-action="toggle-ai-subscription"
      data-ai-slot-id="${slot}"
    >
      <span class="shop-subscription-label">自动续费</span>
      <span class="shop-subscription-track" aria-hidden="true"><span></span></span>
    </button>
  `;
}

function renderCoffeeSubscriptionToggle(enabled: boolean, paused: boolean, disabled = false): string {
  const nextAction = enabled ? "关闭" : "开启";
  return `
    <button
      class="shop-subscription-toggle${enabled ? " is-on" : ""}${paused ? " is-paused" : ""}"
      type="button"
      role="switch"
      aria-checked="${enabled ? "true" : "false"}"
      aria-label="${nextAction}冰美式自动续费"
      title="${disabled ? "需先购买咖啡机" : paused ? "金币不足，本月暂停" : `${nextAction}自动续费`}"
      data-action="toggle-coffee-subscription"
      ${disabled ? "disabled" : ""}
    >
      <span class="shop-subscription-label">自动续费</span>
      <span class="shop-subscription-track" aria-hidden="true"><span></span></span>
    </button>
  `;
}

function getChairUpgradeIcon(upgradeId: ShopUpgradeId): string {
  return CHAIR_UPGRADE_ICONS[upgradeId as typeof CHAIR_UPGRADE_IDS[number]] ?? "🪑";
}

function renderShopRow(config: RowConfig): string {
  const actions = config.actions?.filter(Boolean) ?? [];
  const statusTone = config.statusTone ?? "neutral";
  const rowTag = config.rowAction || config.rowSelection ? "button" : "article";
  const rowAttributes = [
    `class="shop-item-row${config.dim ? " is-dim" : ""}${config.rowAction || config.rowSelection ? " is-selectable" : ""}${config.selected ? " is-selected" : ""}${config.className ? ` ${escapeHtml(config.className)}` : ""}"`,
    config.upgradeOptionId ? `data-shop-upgrade-option-id="${escapeHtml(config.upgradeOptionId)}"` : "",
  ];
  if (config.rowAction) {
    rowAttributes.push(
      'type="button"',
      `data-action="${config.rowAction.action}"`,
      `data-shop-upgrade-id="${escapeHtml(config.rowAction.upgradeId)}"`,
      `aria-label="${escapeHtml(config.rowAction.ariaLabel)}"`,
    );
    if (config.rowAction.disabledReason) {
      rowAttributes.push(`title="${escapeHtml(config.rowAction.disabledReason)}"`);
    }
    if (config.rowAction.disabled) {
      rowAttributes.push("disabled", 'aria-disabled="true"');
    }
  }
  if (config.rowSelection) {
    const selectionAttribute = config.rowSelection.scope === "chair"
      ? "data-ui-select-chair-upgrade"
      : config.rowSelection.scope === "bike"
        ? "data-ui-select-bike-upgrade"
        : "data-ui-select-coffee-upgrade";
    rowAttributes.push(
      'type="button"',
      `${selectionAttribute}="${escapeHtml(config.rowSelection.upgradeId)}"`,
      `aria-label="${escapeHtml(config.rowSelection.ariaLabel)}"`,
      `aria-pressed="${config.rowSelection.selected ? "true" : "false"}"`,
    );
    if (config.rowSelection.disabledReason) {
      rowAttributes.push(`title="${escapeHtml(config.rowSelection.disabledReason)}"`);
    }
    if (config.rowSelection.disabled) {
      rowAttributes.push("disabled", 'aria-disabled="true"');
    }
  }
  return `
    <${rowTag} ${rowAttributes.filter(Boolean).join(" ")}>
      <div class="shop-item-card-head">
        <span class="shop-item-icon" aria-hidden="true">${config.iconHtml ?? escapeHtml(config.icon)}</span>
        <div class="shop-item-heading">
          ${config.kind ? `<span class="shop-item-kind">${escapeHtml(config.kind)}</span>` : ""}
          <strong class="shop-item-name">${escapeHtml(config.name)}</strong>
        </div>
        ${config.selectionSlot
          ? `<span class="shop-upgrade-check${config.selected ? " is-selected" : ""}" aria-label="${config.selected ? "已选中" : "未选中"}">${config.selected ? '<i data-lucide="check" aria-hidden="true"></i>' : ""}</span>`
          : config.status ? `<span class="shop-item-status is-${statusTone}">${escapeHtml(config.status)}</span>` : ""}
      </div>
      <div class="shop-item-info">
        ${config.description ? `<p class="shop-item-desc">${escapeHtml(normalizeShopDescription(config.description))}</p>` : ""}
        ${config.effectText ? `<div class="shop-item-effects">${renderShopEffectHtml(config.effectText)}</div>` : ""}
        ${config.meta?.length ? `
          <div class="shop-item-meta-row">
            ${config.meta.map((item) => `
              <span class="shop-item-meta is-${item.tone ?? "neutral"}">
                ${item.label ? `<span>${escapeHtml(item.label)}</span>` : ""}
                <strong>${escapeHtml(item.value)}</strong>
              </span>
            `).join("")}
          </div>
        ` : ""}
      </div>
      ${actions.length > 0 ? `<div class="shop-item-btns">${actions.join("")}</div>` : ""}
    </${rowTag}>
  `;
}

function renderSelectableUpgradeOption(
  option: UpgradeRouteOption,
  selectedUpgradeId: UpgradeRouteOption["upgradeId"] | null,
  scope: "chair" | "bike" | "coffee",
): string {
  const selected = option.current || option.upgradeId === selectedUpgradeId;
  const selectionDisabled = option.current || option.unavailable;
  return renderShopRow({
    icon: "",
    iconHtml: '<i class="shop-device-icon shop-upgrade-route-icon" data-lucide="settings" aria-hidden="true"></i>',
    className: `is-upgrade-option${option.current ? " is-current" : ""}`,
    upgradeOptionId: option.id,
    kind: "升级路线",
    name: option.name,
    status: "",
    statusTone: "neutral",
    description: "",
    effectText: option.description,
    selected,
    selectionSlot: true,
    meta: [{ label: "升级费用", value: `💰 ${option.price}`, tone: "warning" }],
    rowSelection: selectionDisabled
      ? undefined
        : {
          scope,
          upgradeId: option.upgradeId,
          ariaLabel: `${selected ? "取消选择" : "选择"}${option.name}`,
          selected,
        },
    dim: option.unavailable && !option.current,
  });
}

function renderChairUpgradeRoute(state: GameState, icon: string, selectedChairUpgradeId?: ShopUpgradeId | null): string {
  const item = getShopItemDefinition("chair");
  const owned = state.shopState.chairOwned;
  const currentUpgrade = state.shopState.chairUpgrade;
  const currentDefinition = currentUpgrade
    ? getShopUpgradeDefinition(`chair-${currentUpgrade}` as ShopUpgradeId)
    : null;
  const currentIcon = currentUpgrade
    ? getChairUpgradeIcon(`chair-${currentUpgrade}` as ShopUpgradeId)
    : icon;
  const currentName = currentDefinition?.name ?? item.name;
  const currentEffect = [
    currentDefinition?.description ?? `${item.description}，升级路线5选一`,
    ...(owned ? [`累计 +${Math.max(0, state.shopState.chairSanRecovered)} SAN`] : []),
  ].join("\n");
  const purchasePrice = getShopActionPrice(state, "buy-shop-item", { shopItemId: "chair" }) ?? item.price;
  const options = CHAIR_UPGRADE_IDS.map((upgradeId): UpgradeRouteOption => {
    const definition = getShopUpgradeDefinition(upgradeId);
    const optionPrice = getShopActionPrice(state, "upgrade-shop-item", { shopUpgradeId: upgradeId }) ?? definition.price;
    const isCurrent = currentUpgrade === upgradeId.slice("chair-".length);
    const unavailable = !owned || (!isCurrent && currentUpgrade !== null);
    return {
      id: upgradeId,
      name: definition.name,
      status: "",
      statusTone: isCurrent ? "owned" : "neutral",
      description: definition.description,
      current: isCurrent,
      unavailable,
      price: optionPrice,
      action: "upgrade-shop-item",
      upgradeId,
      disabledReason: !owned ? "需先购买办公椅" : currentUpgrade !== null && !isCurrent ? "已选择其他升级路线" : undefined,
    };
  });
  const selectedOption = currentUpgrade === null
    ? options.find((option) => option.upgradeId === selectedChairUpgradeId) ?? null
    : null;
  const selectedPrice = selectedOption?.price;
  const currentCard = renderShopRow({
    icon: currentIcon,
    name: currentName,
    status: currentUpgrade ? "已升级" : "可升级",
    statusTone: owned ? "owned" : "neutral",
    description: "",
    effectText: currentEffect,
    actions: owned
      ? [
          renderActionButton({
            label: "出售",
            price: getShopItemSellPrice({ shopState: state.shopState, eventSupport: state.eventSupport }, "chair"),
            priceDirection: "gain",
            variant: "secondary",
            action: "sell-shop-item",
            itemId: "chair",
          }),
          currentUpgrade
            ? renderActionButton({ label: "已升级", variant: "current", disabled: true })
            : renderActionButton({
                label: "升级",
                price: selectedPrice ?? "?",
                action: selectedOption ? "upgrade-shop-item" : undefined,
                upgradeId: selectedOption?.upgradeId,
                disabled: selectedOption === null || state.player.money < (selectedPrice ?? 0),
                disabledReason: selectedOption === null
                  ? "请先选择升级路线"
                  : state.player.money < (selectedPrice ?? 0) ? "金币不足" : undefined,
              }),
        ]
      : [renderActionButton({
          label: "购买",
          price: purchasePrice,
          action: "buy-shop-item",
          itemId: "chair",
          disabled: state.player.money < purchasePrice,
          disabledReason: state.player.money < purchasePrice ? "金币不足" : undefined,
        })],
  });
  return [currentCard, ...options.map((option) => renderSelectableUpgradeOption(option, selectedChairUpgradeId ?? null, "chair"))].join("");
}

function renderShopTabButtons(activeTab: ShopTabId, upgradeNoticeTabs: readonly ShopTabId[] = []): string {
  const noticeTabSet = new Set(upgradeNoticeTabs);
  return SHOP_TABS.map((tab) => {
    const activeClass = tab.id === activeTab ? " active" : "";
    const upgradeBadge = noticeTabSet.has(tab.id)
      ? `<span class="center-tab-badge is-available shop-upgrade-badge" aria-label="${escapeHtml(`${tab.label}有提升`)}">↑</span>`
      : "";
    return `
      <button
        class="shop-tab-btn${activeClass}"
        type="button"
        data-ui-shop-tab="${tab.id}"
        aria-pressed="${tab.id === activeTab ? "true" : "false"}"
      >
        <span class="shop-tab-icon" aria-hidden="true">${tab.icon}</span>
        <span>${tab.label}</span>
        ${upgradeBadge}
      </button>
    `;
  }).join("");
}

function renderGpuRow(state: GameState): string {
  const shopView = {
    shopState: state.shopState,
    eventSupport: state.eventSupport,
  };
  const currentLevel = state.shopState.gpuLevel;
  const currentTier = getGpuTierDefinition(currentLevel);
  const nextTier = getNextGpuTierDefinition(currentLevel);
  const firstTier = GPU_TIER_DEFINITIONS[0]!;
  const canSell = canSellShopItem(shopView, "gpu_buy");
  const nextPrice = getShopActionPrice(state, "buy-shop-item", { shopItemId: "gpu_buy" });
  const experimentText = currentTier
    ? `做实验：+${currentLevel}次，+${currentLevel}分`
    : "做实验：+1次，+1分";

  return renderShopRow({
    icon: "",
    iconHtml: '<i class="shop-device-icon" data-lucide="microchip" aria-hidden="true"></i>',
    name: currentTier?.name ?? firstTier.name,
    status: nextTier ? "可升级" : "已满级",
    statusTone: currentTier ? "owned" : "neutral",
    description: "",
    effectText: experimentText,
    actions: [
      canSell
        ? renderActionButton({
          label: "出售",
          price: getShopItemSellPrice(shopView, "gpu_buy"),
          priceDirection: "gain",
          variant: "secondary",
          action: "sell-shop-item",
          itemId: "gpu_buy",
        })
        : "",
      renderActionButton({
        label: nextTier ? currentTier ? "升级" : "购买" : "已满级",
        price: nextTier && nextPrice !== null ? nextPrice : undefined,
        variant: nextTier ? "primary" : "current",
        action: "buy-shop-item",
        itemId: "gpu_buy",
        disabled: nextTier === null || (nextPrice !== null && state.player.money < nextPrice),
        disabledReason: nextTier === null ? "已是最高型号" : nextPrice !== null && state.player.money < nextPrice ? "金币不足" : undefined,
      }),
    ],
  });
}

function renderShopItemRow(
  state: GameState,
  itemId: ShopItemId,
  icon: string,
): string {
  const shopView = {
    shopState: state.shopState,
    eventSupport: state.eventSupport,
  };
  const item = getShopItemDefinition(itemId);
  const purchasePrice = getShopActionPrice(state, "buy-shop-item", { shopItemId: itemId }) ?? item.price;
  const canSell = canSellShopItem(shopView, itemId);
  const owned = isShopItemOwned(shopView, itemId);

  return renderShopRow({
    icon,
    name: item.name,
    status: "",
    statusTone: owned ? "owned" : "neutral",
    description: "",
    effectText: item.description,
    actions: owned
      ? [
          canSell
            ? renderActionButton({
                label: "出售",
                price: getShopItemSellPrice(shopView, itemId),
                priceDirection: "gain",
                variant: "secondary",
                action: "sell-shop-item",
                itemId,
              })
            : "",
          renderActionButton({ label: "已购买", variant: "current", disabled: true }),
        ]
      : [renderActionButton({
          label: "购买",
          price: purchasePrice,
          action: "buy-shop-item",
          itemId,
          disabled: state.player.money < purchasePrice,
          disabledReason: state.player.money < purchasePrice ? "金币不足" : undefined,
        })],
  });
}

function renderBikeRow(state: GameState): string {
  const tier = getBikeTierDefinition(state.shopState.bikeLevel);
  const nextTier = getNextBikeTierDefinition(state.shopState.bikeLevel);
  const displayedTier = tier ?? nextTier;
  const owned = state.shopState.bikeOwned;
  const capLimit = tier?.sanCapLimit ?? 0;
  const capReached = Boolean(tier && state.shopState.bikeSanCapGains >= capLimit);
  const currentDescription = displayedTier
    ? capReached
      ? `当前车型已无法继续提高 SAN 上限，暂不再消耗 SAN`
      : `每月 SAN -${displayedTier.monthlySanCost}；每 -6 SAN，上限 +1（最多 +${displayedTier.sanCapLimit}）`
    : "已达到最高等级";
  const detail = tier
    ? `累计消耗 ${state.shopState.bikeSanSpent} SAN｜当前上限 +${state.shopState.bikeSanCapGains}/${capLimit}`
    : "";
  const nextPrice = getShopActionPrice(state, "buy-shop-item", { shopItemId: "bike" });
  return renderShopRow({
    icon: "🚲",
    className: "is-bike",
    name: tier?.name ?? nextTier?.name ?? "自行车",
    status: nextTier ? "可升级" : "已满级",
    statusTone: owned ? "owned" : "neutral",
    description: "",
    effectText: [currentDescription, detail].filter(Boolean).join("\n"),
    actions: [
      owned
        ? renderActionButton({ label: "出售", price: getShopItemSellPrice({ shopState: state.shopState, eventSupport: state.eventSupport }, "bike"), priceDirection: "gain", variant: "secondary", action: "sell-shop-item", itemId: "bike" })
        : "",
      nextTier
        ? renderActionButton({
            label: owned ? "升级" : "购买",
            title: owned ? `升级为${nextTier.name}` : `购买${nextTier.name}`,
            price: nextPrice ?? nextTier.price,
            action: "buy-shop-item",
            itemId: "bike",
            disabled: state.player.money < (nextPrice ?? nextTier.price),
            disabledReason: state.player.money < (nextPrice ?? nextTier.price) ? "金币不足" : undefined,
          })
        : renderActionButton({ label: "已满级", variant: "current", disabled: true }),
    ],
  });
}

function renderCoffeeRows(
  state: GameState,
  selectedCoffeeUpgradeId?: Exclude<CoffeeMachineUpgradeId, null> | null,
): string {
  const coffeePrice = getCoffeeBuyPrice(state.coffeeState);
  const coffeeDescription = "基础 SAN +3";
  const coffeeMachineSellPrice = getCoffeeMachineSellPrice(state.coffeeState);
  const coffeeMachinePurchasePrice = getShopActionPrice(state, "buy-coffee-machine", {}) ?? COFFEE_MACHINE_PRICE;
  const machineUpgrades = getAvailableCoffeeMachineUpgrades(state.coffeeState);
  const currentUpgrade = state.coffeeState.machineUpgrade;
  const currentDefinition = currentUpgrade
    ? COFFEE_MACHINE_UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === currentUpgrade) ?? null
    : null;
  const machineDescription = !state.coffeeState.machineOwned
    ? "购入后可生产冰美式并选择一条升级路线"
    : currentDefinition?.description ?? "可生产冰美式，每月 1 杯";

  const availableUpgradeIds = new Set(machineUpgrades.map((upgrade) => upgrade.id));
  const upgradeOptions = COFFEE_MACHINE_UPGRADE_DEFINITIONS.map((upgrade): UpgradeRouteOption => {
    const isCurrent = currentUpgrade === upgrade.id;
    const isAvailable = availableUpgradeIds.has(upgrade.id);
    const lockedByBase = !state.coffeeState.machineOwned;
    const purchasePrice = getShopActionPrice(state, "upgrade-coffee-machine", { shopUpgradeId: upgrade.id }) ?? upgrade.price;
    const unavailable = lockedByBase || (!isCurrent && !isAvailable);
    return {
      id: upgrade.id,
      name: upgrade.name,
      status: "",
      statusTone: isCurrent ? "owned" : "neutral",
      description: upgrade.id === "advanced" && state.coffeeState.machineTrackedCoffeeCount > 0 && !isCurrent
        ? `${upgrade.description}｜已保留累计 ${state.coffeeState.machineTrackedCoffeeCount} 杯`
        : upgrade.description,
      current: isCurrent,
      unavailable,
      price: purchasePrice,
      action: "upgrade-coffee-machine",
      upgradeId: upgrade.id,
      disabledReason: lockedByBase
        ? "需先购入咖啡机"
        : !isAvailable && !isCurrent ? "已选择其他升级路线" : undefined,
    };
  });
  const selectedOption = currentUpgrade === null
    ? upgradeOptions.find((option) => option.upgradeId === selectedCoffeeUpgradeId) ?? null
    : null;
  const selectedPrice = selectedOption?.price;

  const rows = [
    renderShopRow({
      icon: "☕",
      className: "has-subscription",
      name: "冰美式",
      status: "",
      description: "",
      effectText: coffeeDescription,
      actions: [
        renderCoffeeSubscriptionToggle(
          state.coffeeState.subscriptionEnabled,
          state.coffeeState.subscriptionPaused,
          !state.coffeeState.machineOwned,
        ),
        state.coffeeState.machineUpgrade !== "unlimited" && state.coffeeState.coffeePurchaseCountThisMonth >= 1
          ? renderActionButton({ label: "本月已购", variant: "current", disabled: true })
          : renderActionButton({
              label: "购买本月",
              price: coffeePrice,
              action: "buy-coffee",
              disabled: !state.coffeeState.machineOwned || state.player.money < coffeePrice,
              disabledReason: !state.coffeeState.machineOwned ? "需先购买咖啡机" : state.player.money < coffeePrice ? "金币不足" : undefined,
            }),
      ],
    }),
    renderShopRow({
      icon: "☕",
      name: currentDefinition?.name ?? "咖啡机",
      status: currentUpgrade ? "已升级" : "可升级",
      statusTone: state.coffeeState.machineOwned ? "owned" : "neutral",
      description: "",
      effectText: machineDescription,
      actions: state.coffeeState.machineOwned
        ? [
            renderActionButton({
              label: "出售",
              price: coffeeMachineSellPrice,
              priceDirection: "gain",
              variant: "secondary",
              action: "sell-coffee-machine",
            }),
            currentUpgrade
              ? renderActionButton({ label: "已升级", variant: "current", disabled: true })
              : renderActionButton({
                  label: "升级",
                  price: selectedPrice ?? "?",
                  action: selectedOption ? "upgrade-coffee-machine" : undefined,
                  upgradeId: selectedOption?.upgradeId,
                  disabled: selectedOption === null || state.player.money < (selectedPrice ?? 0),
                  disabledReason: selectedOption === null
                    ? "请先选择升级路线"
                    : state.player.money < (selectedPrice ?? 0) ? "金币不足" : undefined,
                }),
          ]
        : [renderActionButton({
            label: "购买",
            price: coffeeMachinePurchasePrice,
            action: "buy-coffee-machine",
            disabled: state.player.money < coffeeMachinePurchasePrice,
            disabledReason: state.player.money < coffeeMachinePurchasePrice ? "金币不足" : undefined,
          })],
    }),
  ];
  rows.push(...upgradeOptions.map((option) => renderSelectableUpgradeOption(
    option,
    selectedCoffeeUpgradeId ?? null,
    "coffee",
  )));

  return rows.join("");
}

function renderSupportItemRow(
  state: GameState,
  itemId: SupportItemId,
  icon: string,
): string {
  const item = getSupportItemDefinition(itemId);
  const owned = isSupportItemOwned(state.eventSupport, itemId);
  const sellPrice = getSupportItemSellPrice(itemId);

  return renderShopRow({
    icon,
    name: item.name,
    status: "",
    statusTone: owned ? "owned" : "neutral",
    description: "",
    effectText: item.description,
    actions: owned
      ? [
          renderActionButton({
            label: "出售",
            price: sellPrice,
            priceDirection: "gain",
            variant: "secondary",
            action: "sell-support-item",
            supportItemId: itemId,
          }),
          renderActionButton({ label: "已购买", variant: "current", disabled: true }),
        ]
      : [renderActionButton({
          label: "购买",
          price: item.price,
          action: "buy-support-item",
          supportItemId: itemId,
          disabled: state.player.money < item.price,
          disabledReason: state.player.money < item.price ? "金币不足" : undefined,
        })],
  });
}

const AI_RESEARCH_ACTION_LABELS: Record<"idea" | "experiment" | "writing", string> = {
  idea: "想idea",
  experiment: "做实验",
  writing: "写论文",
};

const AI_SCORE_LABELS: Record<"idea" | "experiment" | "writing", string> = {
  idea: "idea",
  experiment: "实验",
  writing: "写作",
};

function renderAiEffectText(model: ReturnType<typeof getAiModelForTotalMonths>): string {
  if (model.slot === "kimi") {
    const reading = model.readingEffect;
    return [
      reading?.sanDelta ? `看论文：SAN ${reading.sanDelta}` : "",
      reading?.manualExtraReads ? `手动看论文：+${reading.manualExtraReads}次` : "",
      reading?.automaticReads ? `自动看论文：+${reading.automaticReads}次` : "",
    ].filter(Boolean).join("\n") || "暂无效果";
  }
  if (model.slot === "claude") {
    const polishGroups: Array<{ labels: string[]; bonus: number }> = [];
    for (const action of ["idea", "experiment", "writing"] as const) {
      const bonus = model.researchEffects[action]?.bonus ?? 0;
      if (bonus <= 0) continue;
      const existing = polishGroups.find((group) => group.bonus === bonus);
      if (existing) {
        existing.labels.push(AI_SCORE_LABELS[action]);
      } else {
        polishGroups.push({ labels: [AI_SCORE_LABELS[action]], bonus });
      }
    }
    const polishText = polishGroups
      .map((group) => `${group.labels.join("、")} ${group.bonus > 0 ? "+" : ""}${group.bonus}分`)
      .join("；");
    return polishText ? `订购或续费时，自动提升可修改论文的分数：\n${polishText}` : "暂无效果";
  }

  const groupedEffects: Array<{
    labels: string[];
    effect: { bonus?: number; extraActions?: number; sanDelta?: number };
  }> = [];

  for (const action of ["idea", "experiment", "writing"] as const) {
    const effect = model.researchEffects[action];
    if (!effect) continue;
    const signature = [effect.bonus ?? 0, effect.extraActions ?? 0, effect.sanDelta ?? 0].join("|");
    const existing = groupedEffects.find((group) => (
      [group.effect.bonus ?? 0, group.effect.extraActions ?? 0, group.effect.sanDelta ?? 0].join("|") === signature
    ));
    if (existing) {
      existing.labels.push(AI_RESEARCH_ACTION_LABELS[action]);
    } else {
      groupedEffects.push({ labels: [AI_RESEARCH_ACTION_LABELS[action]], effect });
    }
  }

  const formatSigned = (value: number): string => value > 0 ? `+${value}` : String(value);
  const formatEffect = (effect: { bonus?: number; extraActions?: number; sanDelta?: number }): string => [
    effect.bonus ? `${formatSigned(effect.bonus)}分` : "",
    effect.extraActions ? `${formatSigned(effect.extraActions)}次` : "",
    effect.sanDelta ? `SAN ${formatSigned(effect.sanDelta)}` : "",
  ].filter(Boolean).join("，");

  const researchText = groupedEffects
    .map((group) => `${group.labels.join("、")}：${formatEffect(group.effect)}`)
    .join("\n");
  const hasRelationshipDiscount = Boolean(model.relationshipOperationSanDelta);
  const extraText = hasRelationshipDiscount
    ? [`人际操作消耗修正（暂未开放）：SAN -${Math.abs(model.relationshipOperationSanDelta ?? 0)}`]
    : [];

  return [...(researchText ? [researchText] : []), ...extraText].join("\n") || "暂无效果";
}

function renderAiRows(state: GameState): string {
  const slots: readonly AiSlotId[] = ["gpt", "claude", "gemini", "deepseek", "doubao", "kimi"];
  const rows = slots.map((slot) => {
    const model = getAiModelForTotalMonths(state.totalMonths, slot);
    const subscription = state.aiShopState.subscriptions[slot];
    const reimbursed = state.eventSupport.aiCostsCoveredUntilTotalMonths === state.totalMonths;
    const price = reimbursed ? 0 : model.price;
    const purchasedThisMonth = subscription.active;
    const effectText = renderAiEffectText(model);
    return renderShopRow({
      icon: "",
      iconHtml: renderAiIcon(slot),
      className: "is-ai",
      name: model.name,
      description: "",
      effectText,
      actions: [
        renderAiSubscriptionToggle(slot, subscription.enabled, subscription.paused),
        renderActionButton({
          label: purchasedThisMonth
            ? "本月已订购"
            : reimbursed ? "导师报销" : "订购本月",
          price: purchasedThisMonth ? undefined : price,
          variant: purchasedThisMonth ? "current" : "primary",
          action: "buy-ai-month",
          aiSlotId: slot,
          disabled: purchasedThisMonth || state.player.money < price,
          disabledReason: purchasedThisMonth ? "本月已订购" : state.player.money < price ? "金币不足" : undefined,
        }),
      ],
    });
  });
  return rows.join("");
}

function renderTabContent(
  state: GameState,
  activeTab: ShopTabId,
  selectedChairUpgradeId?: ShopUpgradeId | null,
  selectedCoffeeUpgradeId?: Exclude<CoffeeMachineUpgradeId, null> | null,
): string {
  switch (activeTab) {
    case "ai":
      return renderAiRows(state);
    case "rest":
      return [
        renderChairUpgradeRoute(state, "🪑", selectedChairUpgradeId),
      ].join("");
    case "coffee":
      return renderCoffeeRows(state, selectedCoffeeUpgradeId);
    case "gear":
      return [
        renderGpuRow(state),
        renderShopItemRow(state, "keyboard", "⌨️"),
        renderShopItemRow(state, "monitor", "🖥️"),
        renderBikeRow(state),
        renderShopItemRow(state, "ebike", "🛵"),
        renderShopItemRow(state, "down_jacket", "🧥"),
        renderSupportItemRow(state, "parasol", "🌂"),
        renderSupportItemRow(state, "badminton_racket", "🏸"),
      ].join("");
    default:
      return "";
  }
}

function getShopTabNote(activeTab: ShopTabId): string | null {
  switch (activeTab) {
    case "ai":
      return "订购仅在当月生效；游戏内 AI 模型按学年更新，效果和价格随之变化，更新后你需要重新开启自动续费";
    case "coffee":
      return "手动购买冰美式和月初自动续费均需咖啡机；自动续费在金币不足或 SAN 已满时跳过";
    case "gear":
      return "显卡和自行车可以逐档升级，提升效果；夏季（公历 6–8 月）主动操作的 SAN 消耗 +1，遮阳伞可免除；冬季（公历 12–2 月）每月 SAN -1，羽绒服可免除";
    case "rest":
      return "办公椅的升级路线选定后不能直接更换；出售并重新购买后可重新选择";
    default:
      return null;
  }
}

export function renderShopSection(
  state: GameState,
  requestedTab?: ShopTabId,
  selectedChairUpgradeId?: ShopUpgradeId | null,
  selectedCoffeeUpgradeId?: Exclude<CoffeeMachineUpgradeId, null> | null,
  upgradeNoticeTabs: readonly ShopTabId[] = [],
): string {
  const activeTab = normalizeShopTab(requestedTab);
  const preEnrollment = isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT;
  const content = preEnrollment
    ? ""
    : renderTabContent(
      state,
      activeTab,
      selectedChairUpgradeId,
      selectedCoffeeUpgradeId,
    );

  const html = `
    <div class="shop-panel" id="shop-panel-col2" data-shop-tab="${activeTab}">
      ${preEnrollment ? "" : `
        <nav class="shop-tab-btns" aria-label="商店分类">
          ${renderShopTabButtons(activeTab, upgradeNoticeTabs)}
        </nav>
        ${getShopTabNote(activeTab)
          ? `<p class="${activeTab === "ai" ? "shop-ai-note" : "shop-tab-note"} panel-tip-note">💡 小提示：${escapeHtml(getShopTabNote(activeTab)!)}</p>`
          : ""}
      `}
      ${preEnrollment
        ? '<div class="section-empty play-module-lock-state">入学后开放</div>'
      : `<div class="shop-items-list" id="shop-items-list">
          ${content || '<div class="shop-empty">暂无物品</div>'}
        </div>`}
    </div>
  `;
  if (!isPreEnrollmentState(state) || !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return html;
  return html
    .replaceAll(" disabled", "")
    .replaceAll(' aria-disabled="true"', "");
}
