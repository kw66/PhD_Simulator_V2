export interface EventLayoutSample {
  key: string;
  html: string;
}

const narrativeSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("zh-CN", { granularity: "word" }) : null;

function keepNarrativeWordsTogether(root: ParentNode): void {
  if (!narrativeSegmenter) return;
  root.querySelectorAll<HTMLElement>(".event-description-story:not([data-words-ready])").forEach((paragraph) => {
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const nodes: Node[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      for (const { segment, isWordLike } of narrativeSegmenter.segment(node.textContent ?? "")) {
        if (isWordLike && segment.length > 1 && /\p{Script=Han}/u.test(segment)) {
          const word = document.createElement("span");
          word.className = "event-story-word";
          word.textContent = segment;
          fragment.append(word);
        } else {
          fragment.append(document.createTextNode(segment));
        }
      }
      node.parentNode?.replaceChild(fragment, node);
    }
    paragraph.dataset.wordsReady = "true";
  });
}

export function createEventLayout(root: HTMLElement) {
  const samples = new Map<string, string>();
  let lastBox: HTMLElement | null = null;
  let lastWidth = "";
  const heights = new Map<string, number[]>();

  const sync = (): void => {
    if (samples.size === 0) return;
    const box = root.querySelector<HTMLElement>("#event-content-box");
    if (!box || !box.offsetWidth || box.getClientRects().length === 0) return;
    const widthKey = `${box.offsetWidth}:${window.innerWidth}`;
    if (box === lastBox && widthKey === lastWidth) return;
    keepNarrativeWordsTogether(box);
    const dimensions = [...(heights.get(widthKey) ?? [0, 0, 0])];
    const selectors = [".event-content-header", ".event-content-body", ".event-content-buttons"];
    const measure = document.createElement("div");
    measure.className = "event-layout-measure";
    measure.setAttribute("aria-hidden", "true");
    measure.inert = true;
    measure.style.width = `${box.offsetWidth}px`;
    box.parentElement?.append(measure);
    try {
      for (const sample of samples.values()) {
        measure.innerHTML = sample;
        measure.querySelectorAll("*").forEach((element) => {
          for (const attribute of element.getAttributeNames()) {
            if (attribute === "id" || attribute === "data-action" || attribute.startsWith("data-ui-") || attribute.startsWith("data-animate")) {
              element.removeAttribute(attribute);
            }
          }
        });
        keepNarrativeWordsTogether(measure);
        selectors.forEach((selector, index) => {
          const section = measure.querySelector<HTMLElement>(selector);
          dimensions[index] = Math.max(dimensions[index] ?? 0, section?.offsetHeight ?? 0);
        });
      }
    } finally {
      measure.remove();
    }
    heights.set(widthKey, dimensions);
    ["header", "body", "buttons"].forEach((section, index) => {
      box.style.setProperty(`--event-${section}-height`, `${dimensions[index]}px`);
    });
    lastBox = box;
    lastWidth = widthKey;
  };

  void document.fonts?.ready.then(() => {
    lastBox = null;
    heights.clear();
    sync();
  });

  return {
    sync,
    update(nextSamples: readonly EventLayoutSample[]) {
      if (nextSamples.length === 0) return;
      for (const sample of nextSamples) samples.set(sample.key, sample.html);
      lastBox = null;
      sync();
    },
    reset() {
      samples.clear();
      heights.clear();
      lastBox = null;
      lastWidth = "";
    },
  };
}
