import {
  NATURE_ACCEPT_SUB_THRESHOLD,
  NATURE_ACCEPT_THRESHOLD,
  NATURE_SUBMISSION_SUB_THRESHOLD,
  NATURE_SUBMISSION_THRESHOLD,
} from "./v2-content";

export function canUpgradeSlotToJournal(slotIndex: number, slotPublishedA: boolean[], upgradedSlots: boolean[]): boolean {
  return slotPublishedA[slotIndex] === true && upgradedSlots[slotIndex] !== true;
}

export function upgradeSlotToJournal(slotIndex: number, upgradedSlots: boolean[]): boolean[] {
  const nextUpgradedSlots = [...upgradedSlots];
  nextUpgradedSlots[slotIndex] = true;
  return nextUpgradedSlots;
}

export function canSubmitNatureSub(score: number): boolean {
  return score >= NATURE_SUBMISSION_SUB_THRESHOLD;
}

export function canSubmitNature(score: number): boolean {
  return score >= NATURE_SUBMISSION_THRESHOLD;
}

export function meetsNatureSubAcceptThreshold(score: number): boolean {
  return score >= NATURE_ACCEPT_SUB_THRESHOLD;
}

export function meetsNatureAcceptThreshold(score: number): boolean {
  return score >= NATURE_ACCEPT_THRESHOLD;
}
