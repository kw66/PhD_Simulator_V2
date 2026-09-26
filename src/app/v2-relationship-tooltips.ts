export function createRelationshipTooltips(root: HTMLElement) {
  const triggers = "[data-relationship-tooltip], [data-card-tooltip], .center-tab-btn[data-tooltip], .shop-tab-btn[data-tooltip], .panel-switch-btn[data-tooltip], .center-tab-badge[aria-label]";
  const tooltip = document.createElement("div");
  tooltip.id = "relationship-tooltip";
  tooltip.className = "relationship-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);
  let active: HTMLElement | null = null;
  let previousDescription: string | null = null;

  const hide = (): void => {
    if (active) {
      if (previousDescription === null) active.removeAttribute("aria-describedby");
      else active.setAttribute("aria-describedby", previousDescription);
    }
    active = null;
    tooltip.hidden = true;
  };

  const sync = (): void => {
    if (!active) return;
    if (!active.isConnected || active.getClientRects().length === 0) {
      hide();
      return;
    }
    tooltip.textContent = active.dataset.tooltip ?? active.getAttribute("aria-label") ?? "";
    const anchor = active.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const card = active.closest(".rel-card, .paper-card")?.getBoundingClientRect();
    const leftEdge = Math.max(12, card?.left ?? 12);
    const rightEdge = Math.min(viewportWidth - 12, card?.right ?? viewportWidth - 12);
    tooltip.style.maxWidth = `${Math.max(0, Math.min(card ? 440 : 240, rightEdge - leftEdge))}px`;
    const bounds = tooltip.getBoundingClientRect();
    if (anchor.bottom < 0 || anchor.top > viewportHeight || anchor.right < 0 || anchor.left > viewportWidth) {
      hide();
      return;
    }
    const alignRight = active.dataset.tooltipAlign === "right";
    const left = card ? alignRight ? rightEdge - bounds.width : leftEdge
      : Math.max(12, Math.min(anchor.left, viewportWidth - bounds.width - 12));
    const below = anchor.bottom + 6;
    const top = below + bounds.height <= viewportHeight - 12 ? below : Math.max(12, anchor.top - bounds.height - 6);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const show = (target: EventTarget | null): void => {
    const element = target instanceof Element ? target.closest<HTMLElement>(triggers) : null;
    if (!element || !root.contains(element)) {
      hide();
      return;
    }
    if (active !== element) {
      hide();
      active = element;
      previousDescription = element.getAttribute("aria-describedby");
      element.setAttribute("aria-describedby", [previousDescription, tooltip.id].filter(Boolean).join(" "));
    }
    tooltip.hidden = false;
    sync();
  };

  root.addEventListener("mouseover", (event) => show(event.target));
  root.addEventListener("focusin", (event) => show(event.target));
  root.addEventListener("mouseout", (event) => {
    if (active && !(event.relatedTarget instanceof Node && active.contains(event.relatedTarget))
      && document.activeElement !== active) hide();
  });
  root.addEventListener("focusout", () => hide());
  document.addEventListener("pointerdown", (event) => {
    if (active && !(event.target instanceof Node && active.contains(event.target))) hide();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
  window.addEventListener("scroll", sync, true);
  window.addEventListener("resize", hide);
  return { sync };
}
