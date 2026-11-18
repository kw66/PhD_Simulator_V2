import { formatMoney, roundMoney } from "../core/v2-money";
import { getRoleTalentInvestmentDuration, getRoleTalentInvestmentLevel } from "../core/v2-role-talent-investments";
import type { GameState } from "../core/v2-types";

/** A compact amount picker; opening or selecting a preset never spends money. */
export function showInvestmentDialog(root: HTMLElement, getState: () => GameState, invest: (amount: number) => void): void {
  if (document.querySelector("[data-investment-dialog]")) return;
  const state = getState();
  if (state.phase !== "playing" || !getRoleTalentInvestmentLevel(state) || state.player.money < 5) return;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const anchor = root.querySelector("[data-ui-investment-batch]")?.getBoundingClientRect();
  const wasInert = root.inert;
  const overlay = document.createElement("div");
  overlay.className = "investment-overlay";
  overlay.dataset.investmentDialog = "";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "investment-title");
  overlay.innerHTML = `<button type="button" class="investment-backdrop" data-investment-close tabindex="-1" aria-label="关闭批量投资"></button>
    <section class="investment-panel">
      <header><h2 id="investment-title">批量投资</h2><button type="button" data-investment-close aria-label="关闭">×</button></header>
      <div class="investment-presets"><button type="button" data-investment-preset="50">50金</button><button type="button" data-investment-preset="500">500金</button><button type="button" data-investment-preset="max">最大</button></div>
      <label for="investment-amount">投资金额</label>
      <input id="investment-amount" type="number" min="5" step="5" inputmode="numeric" aria-describedby="investment-summary">
      <p id="investment-summary" aria-live="polite"></p>
      <button type="button" class="investment-confirm" data-investment-confirm></button>
    </section>`;
  const panel = overlay.querySelector<HTMLElement>(".investment-panel")!;
  if (anchor) {
    panel.style.left = `${Math.max(8, Math.min(anchor.right - 300, window.innerWidth - 308))}px`;
    panel.style.top = `${Math.max(8, Math.min(anchor.bottom + 8, window.innerHeight - 300))}px`;
  }
  const input = overlay.querySelector<HTMLInputElement>("input")!;
  const confirm = overlay.querySelector<HTMLButtonElement>("[data-investment-confirm]")!;
  const maxAmount = () => Math.floor(Math.min(getState().player.money, 1e12) / 5) * 5;
  input.value = String(Math.min(50, maxAmount()));
  function update(): void {
    const current = getState(), amount = input.valueAsNumber, max = maxAmount();
    const valid = current.phase === "playing" && getRoleTalentInvestmentLevel(current) > 0
      && Number.isSafeInteger(amount) && amount >= 5 && amount % 5 === 0 && amount <= max;
    input.max = String(max);
    confirm.disabled = !valid;
    confirm.textContent = valid ? `投资${formatMoney(amount)}金币` : "确认投资";
    overlay.querySelector<HTMLElement>("#investment-summary")!.textContent = valid
      ? `投入后剩余${formatMoney(roundMoney(current.player.money - amount))}金币；${getRoleTalentInvestmentDuration(current)}个月后收回本金，利息${formatMoney(amount / 5 * getRoleTalentInvestmentLevel(current))}金币。`
      : amount > max ? "可用金币不足。" : "请输入5的正整数倍。";
    overlay.querySelectorAll<HTMLButtonElement>("[data-investment-preset]").forEach(button => {
      button.disabled = button.dataset.investmentPreset !== "max" && Number(button.dataset.investmentPreset) > max;
    });
  }
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true; overlay.remove(); root.inert = wasInert;
    window.removeEventListener("keydown", keydown, true);
    (previousFocus?.isConnected ? previousFocus : root.querySelector<HTMLElement>("[data-ui-investment-batch]"))?.focus({ preventScroll: true });
  }
  function keydown(event: KeyboardEvent): void {
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Enter" && event.target === input) { event.preventDefault(); confirm.click(); }
    if (event.key === "Tab") {
      const controls = [...overlay.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
  input.addEventListener("input", update);
  overlay.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-investment-close]")) close();
    const preset = target?.closest<HTMLButtonElement>("[data-investment-preset]");
    if (preset && !preset.disabled) { input.value = String(preset.dataset.investmentPreset === "max" ? maxAmount() : Number(preset.dataset.investmentPreset)); update(); }
    if (target?.closest("[data-investment-confirm]")) {
      update();
      if (!confirm.disabled) { const amount = input.valueAsNumber; close(); invest(amount); }
    }
  });
  document.body.append(overlay); root.inert = true;
  window.addEventListener("keydown", keydown, true);
  update(); input.focus(); input.select();
}
