export function createRelationshipTooltips(root: HTMLElement) {
  const triggers = "[data-relationship-tooltip], [data-card-tooltip], [data-event-risk-tooltip], .center-tab-btn[data-tooltip], .shop-tab-btn[data-tooltip], .panel-switch-btn[data-tooltip], .center-tab-badge[aria-label], [title]:not(.play-tooltip):not([data-tooltip])";
  const touchTriggers = `${triggers}, [data-tooltip]`;
  const actionControls = "button, a[href], input, textarea, select, [role='button'], [contenteditable='true']";
  const tapTravelLimit = 12;
  const tooltip = document.createElement("div");
  tooltip.id = "relationship-tooltip";
  tooltip.className = "relationship-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);
  let active: HTMLElement | null = null;
  let previousDescription: string | null = null;
  let hoverExitTimer: ReturnType<typeof setTimeout> | undefined;
  let touchPinned = false;
  let lastTouchTime = -Infinity;
  let touchGesture: { pointerId: number; element: HTMLElement; x: number; y: number; moved: boolean } | null = null;

  const findTrigger = (target: EventTarget | null, touch: boolean): HTMLElement | null => {
    let element = target instanceof Element ? target.closest<HTMLElement>(touch ? touchTriggers : triggers) : null;
    while (element && root.contains(element)) {
      // A decorative child can have an empty data-tooltip. Use its enclosing
      // note instead of opening an empty tooltip or ignoring the tap.
      if ((element.dataset.tooltip || element.getAttribute("title") || element.getAttribute("aria-label"))?.trim()) return element;
      element = element.parentElement?.closest<HTMLElement>(touch ? touchTriggers : triggers) ?? null;
    }
    return null;
  };

  const findTapTrigger = (target: EventTarget | null): HTMLElement | null => {
    const element = findTrigger(target, true);
    // Explanatory notes are tappable; ordinary actions still execute on the
    // first tap, even when the button or one of its children has a hint.
    return element && !(target instanceof Element && target.closest(actionControls)) && !element.closest(actionControls) ? element : null;
  };

  const hide = (): void => {
    clearTimeout(hoverExitTimer);
    if (active) {
      active.removeAttribute("data-shared-tooltip-open");
      if (previousDescription === null) active.removeAttribute("aria-describedby");
      else active.setAttribute("aria-describedby", previousDescription);
    }
    active = null;
    touchPinned = false;
    tooltip.classList.remove("is-touch-tooltip");
    tooltip.hidden = true;
  };

  const sync = (): void => {
    if (!active) return;
    if (!active.isConnected || active.getClientRects().length === 0) {
      hide();
      return;
    }
    tooltip.textContent = active.dataset.tooltip || active.getAttribute("aria-label") || "";
    const achievement = active.hasAttribute("data-achievement-id");
    tooltip.classList.toggle("is-achievement-tooltip", achievement);
    const anchor = active.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
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
    tooltip.style.maxWidth = `${Math.max(0, Math.min(card ? 440 : achievement ? 340 : active.hasAttribute("data-event-risk-tooltip") ? 360 : 240, rightEdge - leftEdge))}px`;
    tooltip.style.maxHeight = `${Math.max(0, viewportHeight - 16)}px`;
    const bounds = tooltip.getBoundingClientRect();
    const left = Math.max(leftEdge, Math.min(alignRight ? anchor.right - bounds.width : anchor.left, rightEdge - bounds.width));
    const below = anchor.bottom + 2;
    const top = below + bounds.height <= viewportHeight - 8 ? below : Math.max(8, anchor.top - bounds.height - 2);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const show = (target: EventTarget | null, touch = false): void => {
    clearTimeout(hoverExitTimer);
    const element = findTrigger(target, touch);
    if (!element) {
      if (active?.hasAttribute("data-achievement-id")) hoverExitTimer = setTimeout(hide, 120);
      else hide();
      return;
    }
    if (element.hasAttribute("title")) {
      if (!element.dataset.tooltip?.trim()) element.dataset.tooltip = element.getAttribute("title") ?? "";
      element.setAttribute("data-card-tooltip", "");
      element.removeAttribute("title");
    }
    if (active !== element) {
      hide();
      active = element;
      previousDescription = element.getAttribute("aria-describedby");
      element.setAttribute("aria-describedby", [previousDescription, tooltip.id].filter(Boolean).join(" "));
      element.setAttribute("data-shared-tooltip-open", "");
    }
    tooltip.hidden = false;
    sync();
  };

  const toggleTouchTooltip = (element: HTMLElement): void => {
    if (touchPinned && active === element) { hide(); return; }
    show(element, true);
    if (active !== element) return;
    touchPinned = true;
    tooltip.classList.add("is-touch-tooltip");
  };

  root.addEventListener("mouseover", (event) => {
    if (!touchPinned && Date.now() - lastTouchTime > 800) show(event.target);
  });
  root.addEventListener("focusin", (event) => {
    if (!touchPinned && Date.now() - lastTouchTime > 800) show(event.target);
  });
  root.addEventListener("mouseout", (event) => {
    if (touchPinned) return;
    if (active && !(event.relatedTarget instanceof Node && active.contains(event.relatedTarget))
      && !(active.hasAttribute("data-achievement-id") && event.relatedTarget instanceof Node && tooltip.contains(event.relatedTarget))
      && document.activeElement !== active) {
      if (active.hasAttribute("data-achievement-id")) hoverExitTimer = setTimeout(hide, 120);
      else hide();
    }
  });
  tooltip.addEventListener("mouseenter", () => clearTimeout(hoverExitTimer));
  tooltip.addEventListener("mouseleave", (event) => {
    if (active && !(event.relatedTarget instanceof Node && active.contains(event.relatedTarget))
      && document.activeElement !== active) hide();
  });
  root.addEventListener("focusout", (event) => {
    // A tap may open a new card before the previously focused tab loses focus.
    if (!touchPinned && active && event.target instanceof Node && active.contains(event.target)) hide();
  });
  document.addEventListener("pointerdown", (event) => {
    if (active && !(event.target instanceof Node && (active.contains(event.target) || tooltip.contains(event.target)))) hide();
    if (event.pointerType !== "touch") {
      if (event.pointerType === "mouse") root.classList.remove("uses-touch-tooltips");
      return;
    }
    lastTouchTime = Date.now();
    root.classList.add("uses-touch-tooltips");
    const element = event.isPrimary ? findTapTrigger(event.target) : null;
    touchGesture = element ? { pointerId: event.pointerId, element, x: event.clientX, y: event.clientY, moved: false } : null;
  });
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse") root.classList.remove("uses-touch-tooltips");
    if (!touchGesture || event.pointerId !== touchGesture.pointerId) return;
    if (Math.hypot(event.clientX - touchGesture.x, event.clientY - touchGesture.y) > tapTravelLimit) touchGesture.moved = true;
  });
  document.addEventListener("pointercancel", () => { touchGesture = null; });
  document.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") return;
    lastTouchTime = Date.now();
    const gesture = touchGesture;
    touchGesture = null;
    if (!gesture || event.pointerId !== gesture.pointerId || gesture.moved
      || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > tapTravelLimit
      || findTapTrigger(event.target) !== gesture.element) return;
    toggleTouchTooltip(gesture.element);
  });
  root.addEventListener("click", (event) => {
    // Modern touch browsers already handled pointerup. Keep click-only input
    // (including accessibility activation) usable without double toggling.
    if (Date.now() - lastTouchTime <= 800 || !window.matchMedia("(hover: none)").matches) return;
    const element = findTapTrigger(event.target);
    if (element) {
      root.classList.add("uses-touch-tooltips");
      toggleTouchTooltip(element);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
  window.addEventListener("scroll", (event) => {
    touchGesture = null;
    if (touchPinned) {
      if (!(event.target instanceof Node && tooltip.contains(event.target))) hide();
    } else sync();
  }, true);
  window.addEventListener("resize", hide);
  return { sync, showActionHint(element: HTMLElement): void {
    show(element, true);
    if (active !== element) return;
    touchPinned = true;
    root.classList.add("uses-touch-tooltips");
    tooltip.classList.add("is-touch-tooltip");
  } };
}
