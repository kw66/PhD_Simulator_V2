import { createIcons, FlaskConical, X } from "lucide";

/** Keep confirmation in the same paper dialog as feedback and other game prompts.
 * Confirm runs synchronously in the click handler so opening the tools retains
 * browser user activation. Merely showing or dismissing this dialog changes no save.
 */
export function showTestModeDialog(root: HTMLElement, options: {
  onConfirm?: () => void;
  blocked?: boolean;
  alreadyDebugged?: boolean;
}): void {
  if (document.querySelector("[data-test-mode-dialog]")) return;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const wasInert = root.inert;
  const overlay = document.createElement("div");
  overlay.className = "game-confirm-overlay";
  overlay.dataset.testModeDialog = "";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "test-mode-dialog-title");
  overlay.setAttribute("aria-describedby", "test-mode-dialog-description");
  overlay.innerHTML = `
    <button class="game-confirm-backdrop" type="button" data-test-mode-cancel tabindex="-1" aria-label="关闭提示"></button>
    <section class="game-confirm-dialog">
      <header class="game-confirm-heading">
        <h2 id="test-mode-dialog-title"><i data-lucide="flask-conical" aria-hidden="true"></i>${options.blocked ? "测试窗口未打开" : "开启测试模式"}</h2>
        <button class="game-confirm-close" type="button" data-test-mode-cancel aria-label="关闭"><i data-lucide="x" aria-hidden="true"></i></button>
      </header>
      <div class="game-confirm-copy" id="test-mode-dialog-description">
        ${options.blocked
          ? `<p>测试窗口被浏览器拦截，${options.alreadyDebugged ? "本局仍为测试进度" : "当前存档未因此失效"}。</p><p>请允许本站弹出窗口后重试。</p>`
          : `<p>开启测试模式后，<strong>当前存档将失去正常结算资格</strong>，不再计入经验、成就和后续统计。关闭测试窗口也不会恢复资格。</p><p>你仍可继续游玩和保存测试进度，或读取开启测试模式前的正常月度存档。</p><p>确定开启测试模式吗？</p>`}
      </div>
      <div class="game-confirm-actions">
        <button class="game-confirm-button" type="button" data-test-mode-cancel data-test-mode-initial-focus>${options.blocked ? "知道了" : "取消"}</button>
        ${options.blocked ? "" : '<button class="game-confirm-button is-quit" type="button" data-test-mode-confirm>确认开启</button>'}
      </div>
    </section>`;
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    window.removeEventListener("keydown", keydown, true);
    overlay.remove();
    root.inert = wasInert;
    const focus = previousFocus?.isConnected ? previousFocus : root.querySelector<HTMLElement>("[data-ui-open-debug-window]");
    focus?.focus({ preventScroll: true });
  }
  function keydown(event: KeyboardEvent): void {
    // Other game overlays must not also process this modal's keyboard events.
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const buttons = [...overlay.querySelectorAll<HTMLButtonElement>('button:not([tabindex="-1"]):not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    }
  }
  overlay.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (closed) return;
    if (target?.closest("[data-test-mode-cancel]")) close();
    else if (target?.closest("[data-test-mode-confirm]")) { close(); options.onConfirm?.(); }
  });
  document.body.append(overlay);
  root.inert = true;
  createIcons({ icons: { FlaskConical, X }, root: overlay });
  window.addEventListener("keydown", keydown, true);
  overlay.querySelector<HTMLElement>("[data-test-mode-initial-focus]")?.focus({ preventScroll: true });
}
