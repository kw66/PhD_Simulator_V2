import type { AccountProfile, CoffeeMachineUpgradeId, ShopUpgradeId } from "../core/v2-types";
import type { ShopTabId } from "./v2-render-shop-panel";

export type PlayTabId = "events" | "workstation" | "relationship" | "shop" | "research" | "talent" | "settings";
export type LobbyViewId = "roles" | "info" | "messages";
export type LobbyInfoSectionId = "overview" | "mechanics" | "values" | "guide" | "events" | "systems" | "endings" | "updates";
export type TalentPanelTabId = "character" | "relation" | "equip" | "growth";
export interface PlayRenderUiState {
  activeLobbyView?: LobbyViewId;
  activeLobbyInfoSection?: LobbyInfoSectionId;
  isFeedbackOpen?: boolean;
  dateDisplayMode?: AccountProfile["dateDisplayMode"];
  activePlayTab?: PlayTabId;
  isEventContentOpen?: boolean;
  activeEventId?: string | null;
  activeEventHistoryId?: string | null;
  activeEventHistoryIndex?: number | null;
  activeLogPage?: number | null;
  activePendingPage?: number | null;
  activeRelationshipIndex?: number | null;
  activeShopTab?: ShopTabId;
  selectedChairUpgradeId?: ShopUpgradeId | null;
  selectedCoffeeUpgradeId?: Exclude<CoffeeMachineUpgradeId, null> | null;
  activeTalentTab?: TalentPanelTabId;
  currentResearchPaperIndex?: number | null;
}
