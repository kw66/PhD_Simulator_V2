export interface AnimatedValueSnapshot {
  value: number;
  visible: boolean;
}

export function getVisibleValueDelta(
  previous: AnimatedValueSnapshot | undefined,
  current: AnimatedValueSnapshot,
): number {
  if (!previous?.visible || !current.visible) return 0;
  if (!Number.isFinite(previous.value) || !Number.isFinite(current.value)) return 0;
  return Number((current.value - previous.value).toFixed(6));
}

function isVisible(element: HTMLElement): boolean {
  return !document.hidden && element.getClientRects().length > 0
    && getComputedStyle(element).visibility === "visible";
}

export function createValueAnimations(root: HTMLElement): (enabled: boolean) => void {
  let previous = new Map<string, AnimatedValueSnapshot>();
  let cleanups: (() => void)[] = [];
  const clearAnimations = (): void => {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    clearAnimations();
    previous.clear();
  });
  document.addEventListener("scroll", clearAnimations, { capture: true, passive: true });
  window.addEventListener("resize", clearAnimations);

  return (enabled) => {
    clearAnimations();
    const current = new Map<string, AnimatedValueSnapshot>();
    const changes: { element: HTMLElement; delta: number; before: number; dimension: "width" | "height" | null }[] = [];
    const motionAllowed = enabled && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    root.querySelectorAll<HTMLElement>("[data-animate-key], [data-animate-bar]").forEach((element) => {
      const bar = element.hasAttribute("data-animate-bar");
      const dimension = bar ? (element.style.width ? "width" : "height") : null;
      const key = `${bar ? "bar" : "number"}:${bar ? element.dataset.animateBar : element.dataset.animateKey}`;
      const snapshot = {
        value: dimension ? Number.parseFloat(element.style[dimension]) : Number(element.dataset.animateNumber),
        visible: isVisible(element),
      };
      current.set(key, snapshot);
      const before = previous.get(key);
      const delta = motionAllowed ? getVisibleValueDelta(before, snapshot) : 0;
      if (delta !== 0 && before) changes.push({ element, delta, before: before.value, dimension });
    });
    previous = current;

    changes.forEach(({ element, delta, before, dimension }) => {
      const direction = delta > 0 ? "increase" : "decrease";
      const className = dimension ? `is-stat-${direction}` : `is-value-${direction}`;
      element.classList.add(className);
      let animation: Animation | undefined;
      let floatingChange: HTMLElement | undefined;
      if (dimension) {
        animation = element.animate(
          [{ [dimension]: `${before}%` }, { [dimension]: element.style[dimension] }],
          { duration: 650, easing: "ease-out" },
        );
      } else {
        const bounds = element.getBoundingClientRect();
        floatingChange = document.createElement("span");
        floatingChange.className = `stat-floating-change panel-floating-change is-${direction}`;
        floatingChange.setAttribute("aria-hidden", "true");
        floatingChange.textContent = delta > 0 ? `+${delta}` : String(delta);
        floatingChange.style.right = `${Math.max(4, window.innerWidth - bounds.right)}px`;
        floatingChange.style.top = `${Math.max(18, bounds.top)}px`;
        document.body.appendChild(floatingChange);
      }
      const cleanup = (): void => {
        element.classList.remove(className);
        floatingChange?.remove();
        animation?.cancel();
      };
      const timeout = window.setTimeout(cleanup, 1000);
      cleanups.push(() => {
        window.clearTimeout(timeout);
        cleanup();
      });
    });
  };
}
