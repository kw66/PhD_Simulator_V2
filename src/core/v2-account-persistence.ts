import { createDefaultAccountProfile, normalizeAccountProfile } from "./v2-account";
import type { AccountProfile } from "./v2-types";

const ACCOUNT_PROFILE_KEY = "vibe2_v2_account_profile";

export function loadAccountProfile(): AccountProfile | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_PROFILE_KEY);
    if (!raw) return null;
    return normalizeAccountProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveAccountProfile(profile: AccountProfile): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(ACCOUNT_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // 忽略失败
  }
}

export function clearAccountProfile(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(ACCOUNT_PROFILE_KEY);
  } catch {
    // 忽略失败
  }
}

export function loadOrCreateAccountProfile(): AccountProfile {
  return loadAccountProfile() ?? createDefaultAccountProfile();
}
