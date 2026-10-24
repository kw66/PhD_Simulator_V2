import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { createInitialState } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { CAPTAIN_PREREQUISITE_ROLE_IDS, reconcileAccountRoleUnlocks } from "../src/core/v2-account-role-unlocks";
import { getTalentPointBalance, getTalentUpgradeReason, sanitizeRoleTalentAllocation } from "../src/core/v2-role-talent-definitions";
import { getRoleChibiPortraitUrl } from "../src/app/v2-role-portrait-assets";

function captainAccount() {
  const account = createDefaultAccountProfile();
  account.selectedLobbyRoleId = "research-captain";
  CAPTAIN_PREREQUISITE_ROLE_IDS.forEach((roleId, index) => {
    account.roleProgress[roleId] = { ...account.roleProgress[roleId], level: index * 2, unlocked: true };
  });
  account.roleProgress["research-captain"].level = 7;
  return reconcileAccountRoleUnlocks(account);
}

describe("统御者 passive label display", () => {
  it.each(["setup", "playing"] as const)("uses the six source-role levels in %s, without upgrade/reset controls", phase => {
    const account = captainAccount();
    const levels = Object.fromEntries(CAPTAIN_PREREQUISITE_ROLE_IDS.map((roleId, index) => [roleId, index * 2]));
    const state = phase === "setup" ? createInitialState() : createStartedGameState("research-captain", {}, 0, 1, levels);
    if (phase === "playing") {
      // A running team uses the level snapshot recorded at its opening.
      CAPTAIN_PREREQUISITE_ROLE_IDS.forEach(roleId => { account.roleProgress[roleId].level = 10; });
    }
    if (phase === "playing") { state.totalMonths = 1; state.month = 1; }
    state.roleTalents = { levels: { normal: 10, rich: 10 } };
    const html = renderApp(state, account, { activePlayTab: "talent", activeTalentTab: "character", talentTreeSelectedNodeByPage: [4] });
    expect(html.match(/data-tag-role-id=/g)).toHaveLength(6);
    CAPTAIN_PREREQUISITE_ROLE_IDS.forEach((roleId, index) => {
      expect(html).toContain(`data-tag-role-id="${roleId}" data-current-level="${index * 2}"`);
      expect(html).toContain(`<img class="special-role-avatar" src="${getRoleChibiPortraitUrl(roleId)}" alt="" aria-hidden="true">`);
    });
    expect(html.match(/class="lobby-talent-tree-node-ring special-role-avatar-ring"/g)).toHaveLength(6);
    expect(html).toContain('data-detail-index="4">');
    expect(html).toContain("导师子女 Lv8");
    expect(html).not.toContain('data-ui-talent-reset=');
    expect(html).not.toContain('data-talent-id=');
    expect(html).not.toContain("每级+2天赋点");
    expect(html).not.toContain('class="lobby-talent-points-hint"');
    expect(html).toContain("自身行动点为0");
    expect(html).toContain("三个人际事件无视触发条件，且每学年第1个月必定触发");
    expect(html).not.toContain("末条效果按人际栏对应标签人数叠加");
    expect(html).toContain('data-captain-special="true"');
    expect(html).toContain('class="lobby-normal-tree-node-level">8/10');
    expect(html).not.toContain("个体效果");
    expect(html).not.toContain("团队效果");
  });

  it("does not derive points or allow allocations, even from a forged stored allocation", () => {
    expect(getTalentPointBalance("research-captain", 10, {}, 100)).toBe(0);
    expect(getTalentUpgradeReason("research-captain", 10, {}, "normal", 100)).toContain("不可加点");
    expect(sanitizeRoleTalentAllocation("research-captain", 10, { normal: 10 }, 100)).toEqual({});
  });
});
