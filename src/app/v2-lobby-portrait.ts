import "../styles/lobby-portrait.css";

const boundRoots = new WeakSet<HTMLElement>();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

export function renderLobbyPortrait(src: string, roleName: string): string {
  return `
    <div class="lobby-profile-art">
      <button
        type="button"
        class="lobby-portrait-card"
        aria-label="${escapeHtml(`${roleName}立绘卡牌，点击触发微光`)}"
      >
        <img
          class="lobby-profile-portrait"
          src="${escapeHtml(src)}"
          width="432"
          height="774"
          loading="eager"
          decoding="async"
          fetchpriority="high"
          draggable="false"
          alt="${escapeHtml(`${roleName}立绘`)}"
        />
      </button>
    </div>
  `;
}

/** Bind to the persistent app root so role changes need no listener rebinding. */
export function bindLobbyPortrait(root: HTMLElement): void {
  if (boundRoots.has(root)) return;
  boundRoots.add(root);

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest<HTMLButtonElement>(".lobby-portrait-card");
    if (!card || !root.contains(card)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Alternate animation names to replay the sheen without forcing a layout read.
    const useFirst = !card.classList.contains("is-shimmer-a");
    card.classList.toggle("is-shimmer-a", useFirst);
    card.classList.toggle("is-shimmer-b", !useFirst);
  });

  root.addEventListener("animationend", (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.animationName.startsWith("lobby-portrait-sheen-")) return;
    event.target.closest(".lobby-portrait-card")?.classList.remove("is-shimmer-a", "is-shimmer-b");
  });
}
