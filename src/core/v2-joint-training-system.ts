export function getJointTrainingCitationCapBonus(totalCitations: number, level: 0 | 1 | 2 = 1): number {
  return Math.min(level + Math.floor(Math.max(0, totalCitations) / 200), 6);
}
