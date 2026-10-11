export function createRelationshipTooltips(root: HTMLElement) {
  const triggers = "[data-relationship-tooltip], [data-card-tooltip], [data-event-risk-tooltip], .center-tab-btn[data-tooltip], .shop-tab-btn[data-tooltip], .panel-switch-btn[data-tooltip], .center-tab-badge[aria-label], [title]:not(.play-tooltip):not([data-tooltip])";
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
    const region = card ?? active.closest("#workstation-section, .relationship-panel")?.getBoundingClientRect();
    const leftEdge = 8;
    const rightEdge = viewportWidth - 8;
    if (anchor.bottom < 0 || anchor.top > viewportHeight || anchor.right < 0 || anchor.left > viewportWidth) {
      hide();
      return;
    }
    const regionLeft = Math.max(leftEdge, region?.left ?? leftEdge);
    const regionRight = Math.min(rightEdge, region?.right ?? rightEdge);
    const alignRight = active.dataset.tooltipAlign === "right"
      || (active.dataset.tooltipAlign !== "left" && anchor.left + anchor.width / 2 > (regionLeft + regionRight) / 2);
    tooltip.style.maxWidth = `${Math.max(0, Math.min(card ? 440 : active.hasAttribute("data-event-risk-tooltip") ? 360 : 240, rightEdge - leftEdge))}px`;
    tooltip.style.maxHeight = `${Math.max(0, viewportHeight - 16)}px`;
    const bounds = tooltip.getBoundingClientRect();
    const left = Math.max(leftEdge, Math.min(alignRight ? anchor.right - bounds.width : anchor.left, rightEdge - bounds.width));
    const below = anchor.bottom + 2;
    const top = below + bounds.height <= viewportHeight - 8 ? below : Math.max(8, anchor.top - bounds.height - 2);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const show = (target: EventTarget | null): void => {
    const element = target instanceof Element ? target.closest<HTMLElement>(triggers) : null;
    if (!element || !root.contains(element)) {
      hide();
      return;
    }
    if (element.hasAttribute("title")) {
      element.dataset.tooltip ??= element.getAttribute("title") ?? "";
      element.setAttribute("data-card-tooltip", "");
      element.removeAttribute("title");
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
