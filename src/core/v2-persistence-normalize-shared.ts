export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function countPublishedPapers(value: Record<string, unknown>): number {
  if (!Array.isArray(value.papers)) return 0;
  return value.papers.filter((paper) => isObject(paper) && paper.status === "published").length;
}
