function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
}

export function animationNumberAttributes(key: string, value: number): string {
  return `data-animate-key="${escapeAttribute(key)}" data-animate-number="${value}"`;
}

export function animationBarAttribute(key: string): string {
  return `data-animate-bar="${escapeAttribute(key)}"`;
}

export function renderAnimatedNumber(key: string, value: number, display = String(value)): string {
  return `<span class="animated-number" ${animationNumberAttributes(key, value)}>${escapeAttribute(display)}</span>`;
}

export function renderAnimatedTemplate(key: string, template: string, values: Record<string, number>, displays: Record<string, string> = {}): string {
  return template.split(/(\{[\w-]+\})/g).map((part) => {
    const metric = part.slice(1, -1);
    return part.startsWith("{") && Object.hasOwn(values, metric)
      ? renderAnimatedNumber(`${key}:${metric}`, values[metric]!, displays[metric])
      : escapeAttribute(part);
  }).join("");
}
