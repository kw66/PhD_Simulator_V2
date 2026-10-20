import type { Page } from "playwright";

/** Explicitly accept an unallocated run when a test needs to enter the game. */
export async function startGameFromLobby(page: Page, touch = false): Promise<void> {
  const start = page.locator('[data-action="start-game"]');
  if (touch) await start.tap();
  else await start.click();
  const continueButton = page.locator('[data-ui-start-without-talents]');
  if (await continueButton.count()) {
    if (touch) await continueButton.tap();
    else await continueButton.click();
  }
}
