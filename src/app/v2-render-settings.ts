import { getCurseDebtPayoffAmount } from "../core/v2-curse-system";
import { ENABLE_LOCAL_PLAYGROUND } from "../core/v2-development-flags";
import { formatMoney, roundMoney } from "../core/v2-money";
import type { GameState } from "../core/v2-types";
import { renderRunSaves } from "./v2-render-run-saves";
import type { PlayRenderUiState } from "./v2-render-types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderSettingsSection(state: GameState, uiState: PlayRenderUiState): string {
  const debt = state.curseState?.debt ?? 0;
  const debtLabel = debt > 0 && debt < 0.01 ? "&lt;0.01" : debt.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  // Repayment uses whole cents rounded up; the debt itself retains its interest precision.
  const payoff = getCurseDebtPayoffAmount(debt);
  const payoffHint = debt > 0 && (debt < 0.01 || payoff !== roundMoney(debt)) ? ` · 结清需${formatMoney(payoff)}金币` : "";
  return `
    <div class="settings-panel">
      <div class="settings-sections" id="settings-panel-content" role="group" aria-label="游戏设置">
        <button class="settings-primary-btn is-return" type="button" data-action="reset-game">
          <i data-lucide="house" aria-hidden="true"></i><span>返回开始页面</span>
        </button>
        <button class="settings-primary-btn is-load" type="button" data-ui-open-run-saves aria-expanded="${uiState.isRunSavePanelOpen === true}">
          <i data-lucide="history" aria-hidden="true"></i><span>读取存档</span>
        </button>
        <button class="settings-community-button is-feedback" type="button" data-ui-open-feedback>
          <i data-lucide="message-square" aria-hidden="true"></i><span>留言反馈</span>
        </button>
        <button class="settings-primary-btn is-quit" type="button" data-action="quit-game" title="进入退学结局后，可回溯或结算并返回"${state.totalMonths <= 0 || state.phase === "finished" ? ' disabled aria-disabled="true"' : ""}>
          <i data-lucide="log-out" aria-hidden="true"></i><span>主动退学</span>
        </button>
        ${ENABLE_LOCAL_PLAYGROUND ? `<button class="settings-primary-btn" type="button" data-ui-open-debug-window><i data-lucide="wrench" aria-hidden="true"></i><span>调试面板</span></button>` : ""}
      </div>
      ${state.selectedRoleId === "cursed-debt" && state.curseState ? `<section class="curse-debt-panel"><div><strong>待偿债务 ${debtLabel} 金币</strong><span>月利率2% · 毕业前需结清${payoffHint}</span></div><div class="curse-debt-actions"><button type="button" class="settings-primary-btn" data-action="repay-debt" data-delta="1"${state.phase !== "playing" || state.player.money < 1 || debt <= 0 ? " disabled" : ""}>偿还1金币</button><button type="button" class="settings-primary-btn" data-action="repay-debt"${state.phase !== "playing" || state.player.money <= 0 || debt <= 0 ? " disabled" : ""}>尽力还款</button></div></section>` : ""}
      ${renderRunSaves(state, uiState)}
      ${!uiState.isRunSavePanelOpen && uiState.saveStatus ? `<p class="run-saves-status" role="status">${escapeHtml(uiState.saveStatus)}</p>` : ""}
    </div>
  `;
}
