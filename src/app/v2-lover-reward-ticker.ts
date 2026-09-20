export function createLoverRewardTicker(root: HTMLElement): { render: () => void; step: (direction: number) => void } {
  let ticker: HTMLElement | null = null;
  let track: HTMLElement | null = null;
  let identity = "";
  let index = 0;
  let timer = 0;
  let wrapTimer = 0;

  const clearTimers = (): void => {
    window.clearTimeout(timer);
    window.clearTimeout(wrapTimer);
  };
  const canPlay = (): boolean => !!ticker?.isConnected && !document.hidden && !ticker.closest("[hidden]");
  const show = (position: number, animate: boolean): void => {
    if (!track) return;
    track.style.transition = animate ? "" : "none";
    const height = (track.firstElementChild as HTMLElement | null)?.offsetHeight ?? 16;
    track.style.transform = `translateY(-${position * height}px)`;
    if (ticker) ticker.dataset.rewardIndex = String(index);
  };
  const schedule = (): void => {
    window.clearTimeout(timer);
    if (canPlay() && !ticker?.matches(":hover")) timer = window.setTimeout(() => step(1), 6000);
  };
  const step = (direction: number): void => {
    if (!canPlay() || !track) return;
    clearTimers();
    show(index, false);
    void track.offsetHeight;
    const previous = index;
    index = (index + (direction < 0 ? 2 : 1)) % 3;
    show(previous === 2 && direction > 0 ? 3 : index, true);
    if (previous === 2 && direction > 0) wrapTimer = window.setTimeout(() => show(index, false), 300);
    schedule();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimers();
    else schedule();
  });
  return {
    step,
    render: () => {
      clearTimers();
      ticker = root.querySelector<HTMLElement>(".rel-lover-reward-ticker");
      track = ticker?.querySelector<HTMLElement>(".rel-lover-reward-track") ?? null;
      const nextIdentity = ticker?.dataset.loverRewardIdentity ?? "";
      if (identity !== nextIdentity) index = 0;
      identity = nextIdentity;
      show(index, false);
      if (ticker) {
        ticker.onmouseenter = () => window.clearTimeout(timer);
        ticker.onmouseleave = schedule;
      }
      schedule();
    },
  };
}
