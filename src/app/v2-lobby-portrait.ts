import "../styles/lobby-portrait.css";
import { isCursedRole } from "../core/v2-curse-system";
import { getRoleDefinition } from "../core/v2-progression";
import type { RoleId } from "../core/v2-types";

const boundRoots = new WeakSet<HTMLElement>();
type PortraitTone = "upright" | "reversed" | "special" | "cursed";

function getPortraitTone(roleId: RoleId): PortraitTone {
  if (isCursedRole(roleId)) return "cursed";
  if (roleId === "rewinder" || roleId === "research-captain") return "special";
  return getRoleDefinition(roleId).mode;
}

const cornerOrnaments: Record<PortraitTone, string> = {
  upright: `<path d="M5 47V15Q5 5 15 5H47M14 39V20Q14 14 20 14H39"/>
    <path class="portrait-frame-fill" d="M19 35C10 30 11 22 13 20C22 23 24 29 19 35ZM26 26C18 23 18 16 20 14C27 16 30 21 26 26ZM35 19C29 24 23 22 20 13C22 11 30 10 35 19Z"/>
    <path d="M17 37L37 17M7 53L11 57L7 61L3 57ZM53 7L57 3L61 7L57 11Z"/>`,
  reversed: `<path d="M4 51V18L18 4H51M12 43V24L24 12H43M6 35L26 15M15 26L35 6"/>
    <path class="portrait-frame-fill" d="M15 15L34 10L25 25L10 34ZM6 44L12 50L6 58ZM44 6L58 6L50 12Z"/>
    <path d="M21 34L34 21M30 38L38 30"/>`,
  special: `<path d="M5 52V18Q5 5 18 5H52M13 43V24Q13 13 24 13H43M6 38A32 32 0 0 1 38 6M7 27A20 20 0 0 1 27 7"/>
    <circle cx="17" cy="17" r="4"/><circle class="portrait-frame-fill" cx="8" cy="43" r="3"/><circle class="portrait-frame-fill" cx="43" cy="8" r="3"/>
    <path d="M27 27L34 24L31 31L24 34ZM6 56H13M56 6V13"/>`,
  cursed: `<path d="M5 52V30L10 24L5 18V5H18L24 10L30 5H52M14 42V31L19 24L14 19V14H19L24 19L31 14H42"/>
    <path class="portrait-frame-fill" d="M7 33L19 43L9 39L5 49ZM33 7L43 19L39 9L49 5ZM17 17L30 20L23 24L20 30Z"/>
    <path d="M24 33L30 28L28 36M33 24L28 30L36 28M6 58L12 64M58 6L64 12"/>`,
};

const crestOrnaments: Record<PortraitTone, string> = {
  upright: `<path d="M-38 0H-14M14 0H38M0-11L4-4L11 0L4 4L0 11L-4 4L-11 0L-4-4Z"/><circle class="portrait-frame-fill" r="2.5"/>`,
  reversed: `<path d="M-38-3H-17L-10 4M38-3H17L10 4M0-10L10-1L0 13L-10-1ZM-7-1H7"/>`,
  special: `<circle r="10"/><ellipse rx="18" ry="5" transform="rotate(-25)"/><path d="M-40 0H-24M24 0H40M0-5L5 0L0 5L-5 0Z"/>`,
  cursed: `<path d="M-38 0H-26L-21-4L-16 2H-10M38 0H26L21 4L16-2H10M0-12L10 0L0 12L-10 0ZM0-10L-3-2L3 2L0 10"/>`,
};

function renderPortraitFrame(tone: PortraitTone): string {
  return `<svg class="lobby-portrait-frame" viewBox="0 0 432 774" fill="none" aria-hidden="true" focusable="false">
    <rect class="portrait-frame-outline" x="3" y="3" width="426" height="768" rx="10"/>
    <path class="portrait-frame-rail" d="M76 8H164M268 8H356M76 766H164M268 766H356M8 76V352M8 422V698M424 76V352M424 422V698"/>
    <path class="portrait-frame-inner" d="M72 17H156M276 17H360M72 757H156M276 757H360M17 72V340M17 434V702M415 72V340M415 434V702"/>
    ${["translate(9 9)", "translate(423 9) scale(-1 1)", "translate(9 765) scale(1 -1)", "translate(423 765) scale(-1 -1)"].map(transform => `<g class="portrait-frame-corner" transform="${transform}">${cornerOrnaments[tone]}</g>`).join("")}
    <g class="portrait-frame-crest" transform="translate(216 15)">${crestOrnaments[tone]}</g>
    <g class="portrait-frame-crest" transform="translate(216 759) rotate(180)">${crestOrnaments[tone]}</g>
    <g class="portrait-frame-side"><path d="M8 370L13 387L8 404L3 387ZM424 370L429 387L424 404L419 387Z"/></g>
  </svg>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

export function renderLobbyPortrait(src: string, roleName: string, roleId: RoleId = "normal"): string {
  const tone = getPortraitTone(roleId);
  return `
    <div class="lobby-profile-art">
      <button
        type="button"
        class="lobby-portrait-card"
        data-portrait-tone="${tone}"
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
        ${renderPortraitFrame(tone)}
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
