export function getJointTrainingCitationCapBonus(totalCitations: number, supportLevel: 0 | 1 | 2 = 1): number {
  return Math.min(supportLevel + Math.floor(Math.max(0, totalCitations) / 200), 6);
}
