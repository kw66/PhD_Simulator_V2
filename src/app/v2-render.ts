import { createDefaultAccountProfile } from "../core/v2-lobby";
import type { AccountProfile, GameState } from "../core/v2-types";
import { renderPlayScreen } from "./v2-render-play";
import { renderSetupScreen } from "./v2-render-setup-screen";
import type { PlayRenderUiState } from "./v2-render-types";

export type {
  LobbyInfoSectionId,
  LobbyViewId,
  PlayRenderUiState,
  PlayTabId,
  ResearchAuthorshipFilter,
  ResearchSortMode,
  TalentPanelTabId,
} from "./v2-render-types";
export function renderApp(
  state: GameState,
  accountProfile: AccountProfile = createDefaultAccountProfile(),
  playUiState: PlayRenderUiState = {},
): string {
  return state.phase === "setup"
    ? renderSetupScreen(state, accountProfile, playUiState.activeLobbyView, playUiState.activeLobbyInfoSection)
    : renderPlayScreen(state, {
      ...playUiState,
      dateDisplayMode: playUiState.dateDisplayMode ?? accountProfile.dateDisplayMode,
    });
}
