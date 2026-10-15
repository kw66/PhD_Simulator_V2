/** Keep chart labels legible on phones without hiding short histories offscreen. */
export function createResponsiveScoreCharts(root: HTMLElement) {
  const originals = new WeakMap<SVGSVGElement, {
    width: number;
    height: number;
    attributes: { element: Element; name: string; value: string }[];
  }>();

  const sync = (): void => {
    root.querySelectorAll<SVGSVGElement>("svg[data-score-chart-min-width]").forEach(svg => {
      const container = svg.parentElement;
      if (!container || container.clientWidth === 0) return;
      let original = originals.get(svg);
      if (!original) {
        const [, , width = 0, height = 0] = svg.getAttribute("viewBox")!.split(" ").map(Number);
        original = { width, height, attributes: [] };
        svg.querySelectorAll("path, circle, line, text").forEach(element => {
          for (const name of ["x", "x1", "x2", "cx", "d"]) {
            const value = element.getAttribute(name);
            if (value !== null) original!.attributes.push({ element, name, value });
          }
        });
        originals.set(svg, original);
      }
      const width = window.matchMedia("(max-width: 820px)").matches
        ? Math.max(container.clientWidth, Number(svg.dataset.scoreChartMinWidth))
        : original.width;
      if (svg.getAttribute("width") === String(width)) return;
      const left = Number(svg.dataset.scoreChartLeft);
      const right = Number(svg.dataset.scoreChartRight);
      const scale = (width - left - right) / (original.width - left - right);
      const x = (value: string): string => {
        const coordinate = Number(value);
        return (coordinate < left ? coordinate : left + (coordinate - left) * scale).toFixed(2);
      };
      original.attributes.forEach(({ element, name, value }) => {
        element.setAttribute(name, name === "d"
          ? value.replace(/([ML])(-?[\d.]+)\s+(-?[\d.]+)/g, (_, command, horizontal, vertical) => `${command}${x(horizontal)} ${vertical}`)
          : x(value));
      });
      svg.setAttribute("width", String(width));
      svg.setAttribute("viewBox", `0 0 ${width} ${original.height}`);
    });
  };
  const observer = new ResizeObserver(sync);
  observer.observe(root);
  return { sync, destroy: () => observer.disconnect() };
}
