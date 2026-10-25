import { getAchievementAudience, getAchievementScopeLabels, getAchievementUnlockRoleIds, isAchievementAvailableToRole } from "../src/core/v2-achievement-scope";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_CATALOG } from "../src/core/v2-achievement-catalog";
import { buildLobbySelectedRoleViewModel, createDefaultAccountProfile, getAchievementDisplayPages, getRoleAchievementPageCount, ROLE_ACHIEVEMENT_PAGE_SIZE, selectLobbyRole } from "../src/core/v2-lobby";
import { getAllAchievementDefinitions, getRoleAchievementDefinitions, getRoleLobbyAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import { getCollectorAchievementKey } from "../src/core/v2-achievement-collections";
import { getRoleOptions } from "../src/core/v2-progression";
import { getAchievementGlobalPercentage, renderAchievementCard } from "../src/app/v2-render-achievement-progress";
import { renderRoleRail } from "../src/app/v2-render-setup-screen";

describe("achievement catalog and presentation", () => {
  it("returns to the prioritized first page when changing characters", () => {
    const account = createDefaultAccountProfile();
    account.lobbyRoleAchievementPage = 9;
    expect(selectLobbyRole(account, "rich").lobbyRoleAchievementPage).toBe(0);
    expect(selectLobbyRole(account, "normal").lobbyRoleAchievementPage).toBe(9);
  });
  it("keeps one scoped definition for each confirmed achievement and independent graduation records", () => {
    expect(new Set(ACHIEVEMENT_CATALOG.map(item => item.id)).size).toBe(ACHIEVEMENT_CATALOG.length);
    for (const title of ["突破极限Ⅰ", "突破极限Ⅱ", "六边形战士Ⅰ", "六边形战士Ⅱ", "顶级显卡Ⅰ", "顶级显卡Ⅱ", "完美工位", "羽球高手"]) {
      expect(ACHIEVEMENT_CATALOG.filter(item => item.title === title)).toHaveLength(1);
    }
    for (const role of getRoleOptions()) {
      const definitions = getRoleAchievementDefinitions(role.id);
      expect(definitions.every(item => isAchievementAvailableToRole(item.scope, role.id))).toBe(true);
      expect(definitions.find(item => item.id === `${role.id}:ending-master`)?.scope).toEqual(["upright", "reversed"].includes(getAchievementAudience(role.id)) ? { roleIds: [role.id] } : undefined);
      expect(definitions.find(item => item.id === `${role.id}:ending-phd`)?.scope).toEqual(["upright", "reversed"].includes(getAchievementAudience(role.id)) ? { roleIds: [role.id] } : undefined);
      const ordinary = ["upright", "reversed"].includes(getAchievementAudience(role.id));
      expect(definitions.some(item => item.id === "global:air-dried")).toBe(ordinary);
      expect(definitions.some(item => item.id === "global:ending-quit")).toBe(ordinary);
    }
    expect(ACHIEVEMENT_CATALOG.find(item => item.title === "智慧之神Ⅰ")?.description).toBe("科研达15");
    expect(ACHIEVEMENT_CATALOG.find(item => item.title === "铁杆师生Ⅰ")?.description).toBe("导师好感达15");
    expect(ACHIEVEMENT_CATALOG.find(item => item.title === "吾爱吾师")?.description).toBe("教师节连续赠送3次邮票");
    expect(ACHIEVEMENT_CATALOG.find(item => item.title === "爱惜生命")?.description).toBe("去医院3次");
  });

  it("distinguishes regular upright, reversed, special, cursed and explicit multiple-role audiences", () => {
    for (const [role, audience] of [["normal", "upright"], ["chosen-reversed", "reversed"],
      ["rewinder", "special"], ["special-finite-life", "cursed"]] as const) {
      expect(isAchievementAvailableToRole({ audiences: [audience] }, role)).toBe(true);
    }
    expect(isAchievementAvailableToRole({ audiences: ["upright"] }, "rewinder")).toBe(false);
    expect(isAchievementAvailableToRole({ audiences: ["upright"] }, "normal-reversed")).toBe(false);
    const multiple = { roleIds: ["normal", "chosen"] as ("normal" | "chosen")[] };
    expect(getAchievementScopeLabels(multiple)).toEqual(["大多数", "天选之人"]);
    expect(isAchievementAvailableToRole(multiple, "chosen")).toBe(true);
    expect(isAchievementAvailableToRole(multiple, "rich")).toBe(false);
    expect(getRoleAchievementDefinitions("normal-reversed").some(item => item.id === "global:never-give-up")).toBe(true);
    expect(getRoleAchievementDefinitions("normal").some(item => item.id === "global:never-give-up")).toBe(true);
  });

  it("keeps the revised thresholds, role restrictions and related achievements together", () => {
    const byTitle = (title: string) => ACHIEVEMENT_CATALOG.find(item => item.title === title)!;
    for (const title of ["笨鸟先飞", "主动破冰", "初获赏识"]) {
      expect(byTitle(title).scope).toEqual({ roleIds: ["normal"] });
    }
    expect(byTitle("自立自强")).toMatchObject({ description: "硕士期间科研、社交、导师好感均达6",
      rewardText: "经验+5", scope: { roleIds: ["normal"] } });
    expect(byTitle("真·大多数")).toMatchObject({ rewardText: "经验倍率+1，解锁全部诅咒角色", scope: { roleIds: ["normal"] } });
    expect(byTitle("突破极限Ⅰ").scope).toEqual({ audiences: ["upright"] });
    expect(byTitle("突破极限Ⅱ").scope).toEqual({ audiences: ["all"] });
    expect(byTitle("突破极限Ⅱ").description).toBe("科研|社交|好感任一项达30");
    for (const [title, roleId] of [["绝地求生·怠惰", "normal-reversed"], ["绝地求生·贪求", "rich-reversed"], ["绝地求生·愚钝", "genius-reversed"],
      ["绝地求生·嫉妒", "social-reversed"], ["绝地求生·玩世", "teacher-child-reversed"], ["绝地求生·空想", "chosen-reversed"]]) {
      expect(byTitle(title)).toMatchObject({ id: `${roleId}:zero-talent-master`, description: "使用0天赋点硕士毕业", rewardText: "经验倍率+1", scope: { roleIds: [roleId] } });
    }
    expect(byTitle("医学奇迹").description).toBe("累计提升40点生命上限");
    expect(byTitle("医学奇迹").scope).toEqual({ audiences: ["upright", "reversed"] });
    expect(byTitle("命悬一线").description).toBe("生命上限不超过6");
    expect(byTitle("命悬一线").scope).toEqual({ audiences: ["upright", "reversed"] });
    expect(byTitle("我有多动症Ⅰ").description).toBe("单月行动≥3次（含AI）");
    expect(byTitle("我有多动症Ⅱ").description).toBe("单月行动≥4次（含AI）");
    expect(byTitle("打工狂人").description).toBe("累计打工15次");
    expect(byTitle("六边形战士Ⅱ").description).toBe("科研|社交|好感|金币均达20");
    expect(byTitle("顶级显卡Ⅰ").description).toBe("拥有A6000及以上的显卡");
    expect(byTitle("顶级显卡Ⅱ").description).toBe("拥有B300显卡");
    expect(ACHIEVEMENT_CATALOG.some(item => ["高级显卡", "二次行动"].includes(item.title))).toBe(false);
    for (const role of getRoleOptions()) {
      const titles = getRoleAchievementDefinitions(role.id).map(item => item.title);
      const ordinary = ["upright", "reversed"].includes(getAchievementAudience(role.id));
      expect(titles.includes("命悬一线")).toBe(ordinary);
      expect(titles.includes("医学奇迹")).toBe(ordinary);
      if (isAchievementAvailableToRole({ audiences: ["upright"] }, role.id)) {
        const start = titles.indexOf("突破极限Ⅰ");
        expect(titles.slice(start, start + 2)).toEqual(["突破极限Ⅰ", "突破极限Ⅱ"]);
      }
      const survival = getRoleAchievementDefinitions(role.id).find(item => item.id === `${role.id}:zero-talent-master`);
      if (isAchievementAvailableToRole({ audiences: ["reversed"] }, role.id)) {
        expect(survival?.description).toBe("使用0天赋点硕士毕业");
        const account = createDefaultAccountProfile();
        account.lobbyRoleAchievementPage = getAchievementDisplayPages(role.id).findIndex(page => page.achievements.some(item => item.id === survival!.id));
        const html = renderRoleRail(account, role.id, "achievements");
        expect(html).toContain("绝地求生");
      } else expect(survival).toBeUndefined();
      for (const group of [["智慧之神Ⅰ", "智慧之神Ⅱ"], ["交际花Ⅰ", "交际花Ⅱ"], ["铁杆师生Ⅰ", "铁杆师生Ⅱ"], ["家财万贯Ⅰ", "家财万贯Ⅱ"], ["超厚血条Ⅰ", "超厚血条Ⅱ"], ["六边形战士Ⅰ", "六边形战士Ⅱ"],
        ["顶级显卡Ⅰ", "顶级显卡Ⅱ"], ["我有多动症Ⅰ", "我有多动症Ⅱ"]]) {
        const start = titles.indexOf(group[0]);
        if (start < 0) continue;
        expect(titles.slice(start, start + group.length)).toEqual(group);
      }
    }
  });

  it("prioritizes unlocks, personal multipliers, shared talent points, then narrower applicable scopes", () => {
    const definitions = getAllAchievementDefinitions();
    const completeIds = definitions.map(item => item.id);
    const roles = getRoleOptions();
    const sharedTalentRewards = definitions.filter(item => item.scope?.audiences?.includes("all") && item.rewardText === "天赋点+1");
    for (const role of getRoleOptions()) {
      const pages = getAchievementDisplayPages(role.id);
      const items = pages.flatMap((page) => page.achievements);
      expect(items.map((item) => item.id).sort()).toEqual([...completeIds].sort());
      const unlocks = definitions.filter(item => getAchievementUnlockRoleIds(item).includes(role.id));
      const multipliers = definitions.filter(item => item.scope?.roleIds?.length === 1
        && item.scope.roleIds[0] === role.id && item.rewardText?.includes("经验倍率+1"));
      const prefix = [...unlocks, ...multipliers, ...sharedTalentRewards];
      expect(items.slice(0, prefix.length).map(item => item.id)).toEqual(prefix.map(item => item.id));
      const remaining = items.slice(prefix.length);
      const firstOther = remaining.findIndex(item => !isAchievementAvailableToRole(item.scope, role.id));
      const applicable = remaining.slice(0, firstOther);
      expect(firstOther).toBeGreaterThanOrEqual(0);
      expect(applicable.every(item => isAchievementAvailableToRole(item.scope, role.id))).toBe(true);
      expect(remaining.slice(firstOther).every(item => !isAchievementAvailableToRole(item.scope, role.id))).toBe(true);
      const scopeSizes = applicable.map(item => roles.filter(candidate => isAchievementAvailableToRole(item.scope, candidate.id)).length);
      expect(scopeSizes).toEqual([...scopeSizes].sort((a, b) => a - b));
      for (const size of new Set(scopeSizes)) {
        const inScope = (item: typeof items[number]) => isAchievementAvailableToRole(item.scope, role.id)
          && roles.filter(candidate => isAchievementAvailableToRole(item.scope, candidate.id)).length === size
          && !prefix.some(first => first.id === item.id);
        expect(applicable.filter(inScope).map(item => item.id)).toEqual(definitions.filter(inScope).map(item => item.id));
      }
      expect(items.slice(0, 11).some(item => item.id === `${role.id}:ending-master`)).toBe(["upright", "reversed"].includes(getAchievementAudience(role.id)));
      expect(items.slice(0, 11).some(item => item.id === `${role.id}:ending-phd`)).toBe(["upright", "reversed"].includes(getAchievementAudience(role.id)));
      expect(pages.slice(0, -1).every((page) => page.achievements.length === ROLE_ACHIEVEMENT_PAGE_SIZE)).toBe(true);
      expect(pages.at(-1)!.achievements.length).toBeGreaterThan(0);
      expect(pages.at(-1)!.achievements.length).toBeLessThanOrEqual(ROLE_ACHIEVEMENT_PAGE_SIZE);
      expect(pages.length).toBe(getRoleAchievementPageCount(role.id));
      const account = createDefaultAccountProfile();
      for (let index = 0; index < pages.length; index += 1) {
        account.lobbyRoleAchievementPage = index;
        const html = renderRoleRail(account, role.id, "achievements");
        for (const item of pages[index].achievements) expect(html).toContain(`data-achievement-id="${item.id}"`);
        expect(html).not.toContain("achievement-category-select");
        expect(html).not.toContain("通用成就");
      }
      expect(items.some(item => item.id === `${role.id}:ending-master`)).toBe(["upright", "reversed"].includes(getAchievementAudience(role.id)));
      expect(items.some(item => item.id === `${role.id}:ending-phd`)).toBe(["upright", "reversed"].includes(getAchievementAudience(role.id)));
      expect(items.some(item => item.id === "normal:self-reliance")).toBe(true);
      expect(items.some(item => item.id === "genius-reversed:zero-talent-master")).toBe(true);
    }
  });

  it("puts a role's incoming unlock first even when another character earns it", () => {
    const ids = (roleId: "rich" | "genius-reversed" | "normal") => getAchievementDisplayPages(roleId)
      .flatMap(page => page.achievements.map(item => item.id));
    expect(ids("rich").slice(0, 4)).toEqual([
      "normal:first-pot", "rich:ending-master", "rich:ending-phd", "unlock:rich-reversed",
    ]);
    expect(ids("genius-reversed").slice(0, 5)).toEqual([
      "unlock:genius-reversed", "genius-reversed:ending-master", "genius-reversed:ending-phd",
      "genius-reversed:zero-talent-master", "genius-reversed:break-research-curse",
    ]);
    expect(ids("normal").slice(0, 3)).toEqual([
      "normal:ending-master", "normal:ending-phd", "normal:truly-ordinary",
    ]);
    expect(ids("rich").indexOf("upright:breakthrough-i")).toBeLessThan(ids("rich").indexOf("global:breakthrough-ii"));
    expect(ids("rich").indexOf("global:breakthrough-ii")).toBeLessThan(ids("rich").indexOf("normal:research-start"));
  });

  it("shows five upright graduation challenges on source roles and target unlock mirrors", () => {
    const conditions = {
      "genius-reversed": "硕士或博士毕业时，科研能力低于导师好感和社交能力",
      "teacher-child-reversed": "硕士或博士毕业时，导师好感低于科研和社交能力",
      "social-reversed": "硕士或博士毕业时，社交能力低于科研和导师好感",
      "rich-reversed": "硕士或博士毕业时，商店单笔消费均不超过10金币",
      "chosen-reversed": "硕士或博士毕业时，三项属性最高与最低相差≥6",
    } as const;
    for (const roleId of Object.keys(conditions) as (keyof typeof conditions)[]) {
      const mirror = getRoleLobbyAchievementDefinitions(roleId)[0];
      expect(mirror).toMatchObject({ id: `unlock:${roleId}`, unlocksRoleId: roleId,
        description: conditions[roleId], scope: { roleIds: [roleId.replace("-reversed", "")] } });
      expect(mirror.rewardText).toMatch(/^经验倍率\+1，解锁.+角色$/);
      for (const role of getRoleOptions()) {
        expect(getRoleAchievementDefinitions(role.id).some(item => item.id === mirror.id))
          .toBe(isAchievementAvailableToRole(mirror.scope, role.id));
      }
    }
    expect(ACHIEVEMENT_CATALOG.find(item => item.id === "rich:money-power")).toBeUndefined();
  });

  it("uses the updated tiered milestones and includes the new research and mentor challenges", () => {
    const find = (title: string) => ACHIEVEMENT_CATALOG.find(item => item.title === title)!;
    for (const [name, attribute] of [["智慧之神", "科研"], ["交际花", "社交"], ["铁杆师生", "导师好感"]]) {
      expect(find(`${name}Ⅰ`)).toMatchObject({ description: `${attribute}达15`, scope: { audiences: ["upright"] } });
      expect(find(`${name}Ⅱ`)).toMatchObject({ description: `${attribute}达20`, scope: { audiences: ["upright", "reversed"] } });
    }
    for (const [name, attribute, first, second] of [["家财万贯", "金币", 60, 200], ["超厚血条", "SAN上限", 36, 60]] as const) {
      expect(find(`${name}Ⅰ`)).toMatchObject({ description: `${attribute}达到${first}`, scope: { audiences: ["upright"] } });
      expect(find(`${name}Ⅱ`)).toMatchObject({ description: `${attribute}达到${second}`, scope: { audiences: ["upright", "reversed"] } });
    }
    for (const [name, description] of [
      ["优秀硕士论文", "硕士论文盲审获3A"], ["优秀博士论文", "博士论文盲审获5A"],
      ["横向之王", "完成10次横向项目"], ["纵向之王", "完成10次纵向项目"],
      ["鞭策导师Ⅰ", "导师评上三级教授"], ["鞭策导师Ⅱ", "导师评上院士"],
      ["最佳之作", "一作发表A类Best Paper"], ["自然之子", "一作发表NMI"], ["自然之巅", "一作发表Nature"],
      ["万引大佬", "总引用达到10000"], ["高分论文Ⅰ", "论文非协作分达100"], ["高分论文Ⅱ", "论文非协作分达150"],
    ]) expect(find(name)).toMatchObject({ description, rewardText: "经验+5", scope: { audiences:
      ["自然之巅", "未来院士", "诺奖之始", "万引大佬"].includes(name)
        ? ["all"] : ["upright", "reversed"] } });
    expect(find("百折不挠").scope).toEqual({ audiences: ["upright", "reversed"] });
  });

  it("covers the newly catalogued system routes, event choices and career endings", () => {
    const find = (title: string) => ACHIEVEMENT_CATALOG.find(item => item.title === title)!;
    for (const [title, description] of [
      ["三A在手", "硕士期间一作发表≥3篇A类论文"],
      ["协作共赢", "合作发表≥10篇论文"],
      ["协作先行", "先发合作论文，再发一作"],
      ["学会拒绝", "导师项目|审稿|毕设各拒绝1次"],
      ["我爱茶歇", "开会选择茶歇≥3次"],
      ["公费旅游", "开会选择旅游≥3次"],
      ["顺便展出", "在VALSE做Poster展示"],
      ["Buff之神", "同一时刻拥有≥10种Buff"],
      ["博闻强记", "阅读全部小提示"],
      ["事件爆发", "某个月同时出现≥6个事件"],
      ["失之交臂", "被举报导致错失国奖"],
      ["命悬一线", "生命上限不超过6"],
      ["群英荟萃", "单篇论文作者≥6人"],
      ["全网开花", "单篇一作完成全部宣传"],
      ["整装待发", "集齐小电驴|遮阳伞|羽绒服"],
      ["AI协作", "同时订阅3路AI，含GPT/Claude"],
      ["一夜暴富", "某个月收入达到100金币"],
      ["初入职场", "取得任意offer"],
      ["大厂上岸", "取得大厂算法岗及以上offer"],
      ["央企有我", "取得央企总部业务主管及以上offer"],
      ["金榜题名", "取得省直二级主任科员及以上offer"],
      ["站上讲台", "取得211讲师及以上offer"],
    ]) expect(find(title)).toMatchObject({ description, rewardText: "经验+5", scope: { audiences: ["upright", "reversed"] } });
    expect(find("拨云见日")).toMatchObject({ description: "游戏内破除学术失语诅咒", rewardText: "经验倍率+1", scope: { roleIds: ["genius-reversed"] } });
    expect(find("登峰造极·大厂").description).toContain("首席科学家");
    expect(ACHIEVEMENT_CATALOG.filter(item => item.title.startsWith("登峰造极"))).toHaveLength(4);
    expect(ACHIEVEMENT_CATALOG.filter(item => item.id.startsWith("global:career-") && item.id !== "global:career-rejections-six").every(item =>
      item.description.startsWith("取得") && !/毕业|保留/.test(item.description))).toBe(true);
    expect(find("学术之星").description).toBe("毕业时发表≥5篇A类论文");
    expect(find("未来院士").description).toBe("发表≥2篇Nature");
    expect(find("诺奖之始").description).toBe("论文总分达1000");
    for (const [title, description] of [["别样心动", "分手后交往另一类型恋人"],
      ["另开眼界", "参加联培"], ["职场熟客", "完成3段实习"]]) {
      expect(find(title)).toMatchObject({ description, scope: { audiences: ["upright", "reversed"] }, rewardText: "经验+5" });
    }
  });

  it("shares common and category completion across eligible roles while keeping graduation independent", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.unlockedAchievementIds = ["global:air-dried", "upright:breakthrough-i", "normal:self-reliance-i", "normal:ending-master"];
    for (const roleId of ["rich", "normal-reversed", "rewinder"] as const) {
      const pages = getAchievementDisplayPages(roleId);
      account.lobbyRoleAchievementPage = pages.findIndex(page => page.achievements.some(item => item.id === "global:air-dried"));
      expect(renderRoleRail(account, roleId, "achievements")).toContain(
        'class="lobby-profile-achievement is-unlocked" data-achievement-id="global:air-dried"');
    }
    const rich = buildLobbySelectedRoleViewModel(account, "rich").roleAchievements;
    expect(rich.find(item => item.definition.id === "upright:breakthrough-i")?.unlocked).toBe(true);
    expect(rich.some(item => item.definition.id === "normal:self-reliance-i")).toBe(false);
    expect(rich.find(item => item.definition.id === "rich:ending-master")?.unlocked).toBe(false);
    account.roleProgress.rich.unlockedAchievementIds = ["normal-reversed:zero-talent-master"];
    expect(buildLobbySelectedRoleViewModel(account, "normal-reversed").roleAchievements
      .find(item => item.definition.id === "normal-reversed:zero-talent-master")?.unlocked).toBe(false);
  });

  it("puts audience labels after the global rate in the right metadata column and removes role requirements from descriptions", () => {
    for (const role of getRoleOptions()) {
      for (const item of getRoleLobbyAchievementDefinitions(role.id)) {
        expect(item.description).not.toMatch(/用大多数|用富可敌国|使用.+角色/);
        const html = renderAchievementCard(item, false);
        for (const label of getAchievementScopeLabels(item.scope)) expect(html).toContain(`class="achievement-scope-tag">${label}</span>`);
        expect(html.indexOf("achievement-scope-tags")).toBeGreaterThan(html.indexOf("lobby-profile-achievement-icon"));
        expect(html.indexOf("achievement-scope-tags")).toBeGreaterThan(html.indexOf("achievement-global-rate"));
        expect(html).toContain('class="achievement-card-meta"');
      }
    }
  });

  it("preserves unlock rewards, assigns default experience, and gives graduation its own multiplier reward", () => {
    const original = getRoleAchievementDefinitions("normal").slice(0, 6);
    expect(original).toHaveLength(6);
    for (const item of original) {
      expect(item.rewardText).toMatch(/^经验\+5，解锁.+角色$/);
      expect(renderAchievementCard(item, false)).toContain(item.rewardText!);
    }
    for (const item of ACHIEVEMENT_CATALOG) {
      if (item.id === "unlock:research-captain") expect(item.rewardText).toBe("解锁统御者角色");
        else if (item.id === "unlock:rewinder") expect(item.rewardText).toBe("解锁轮回者角色");
      else if (item.id.endsWith(":curse-hell-phd")) {
        expect(item.rewardText).toBe("全角色天赋点+1");
        expect(item.rewardScope).toEqual({ audiences: ["all"] });
        expect(item.scope.roleIds).toHaveLength(1);
      }
      else if (getAchievementUnlockRoleIds(item).length) expect(item.rewardText).toMatch(/^(经验\+5|经验倍率\+1)，解锁.+角色$/);
      else if (getCollectorAchievementKey(item.id)) expect(item.rewardText).toBe("经验倍率+0.2");
      else expect(["经验+5", "经验倍率+1"]).toContain(item.rewardText);
      expect(renderAchievementCard(item, false)).toContain(`class="lobby-profile-achievement-reward">${item.rewardText}</p>`);
    }
    for (const role of getRoleOptions()) {
      if (["special", "cursed"].includes(getAchievementAudience(role.id))) continue;
      for (const ending of ["master", "phd"]) {
        expect(getRoleAchievementDefinitions(role.id).find(item => item.id === `${role.id}:ending-${ending}`))
          .toMatchObject({ rewardText: "经验倍率+1", scope: { roleIds: [role.id] } });
      }
    }
  });

  it("grants fractional shared experience multipliers for the five cross-run collections", () => {
    const collectorIds = ["global:buff-collector", "global:product-collector", "global:conference-collector", "global:travel-collector", "global:direction-collector"];
    const collectorRewards = ACHIEVEMENT_CATALOG.filter(item => getCollectorAchievementKey(item.id));
    expect(collectorRewards.map(item => item.id)).toEqual(collectorIds);
    for (const item of collectorRewards) expect(item).toMatchObject({ rewardText: "经验倍率+0.2", scope: { audiences: ["all"] } });
    expect(ACHIEVEMENT_CATALOG.find(item => item.id === "global:conference-three-years"))
      .toMatchObject({ title: "年年赴约", description: "连续3年发表同一个会议", rewardText: "经验+5", scope: { audiences: ["upright", "reversed"] } });
  });

  it("distinguishes missing statistics from measured zero and never invents a rate", () => {
    expect(getAchievementGlobalPercentage()).toBeNull();
    expect(getAchievementGlobalPercentage({ achievedPlayers: 0, eligiblePlayers: 0 })).toBeNull();
    expect(getAchievementGlobalPercentage({ achievedPlayers: 0, eligiblePlayers: 20 })).toBe(0);
    expect(getAchievementGlobalPercentage({ achievedPlayers: 5, eligiblePlayers: 20 })).toBe(25);
    expect(getAchievementGlobalPercentage({ achievedPlayers: 21, eligiblePlayers: 20 })).toBeNull();
    const item = ACHIEVEMENT_CATALOG[0];
    const html = renderAchievementCard(item, false, "", { achievedPlayers: 5, eligiblePlayers: 20 });
    expect(html).toContain('style="width:25%"');
    expect(html).toContain('aria-label="全球达成率 25%（5/20 位已开局玩家，按浏览器去重）"');
    expect(html.indexOf("achievement-completion-fill")).toBeLessThan(html.indexOf("lobby-profile-achievement-copy"));
    expect(renderAchievementCard(item, false)).toContain(">—%</span>");
    const zeroHtml = renderAchievementCard(item, false, "", { achievedPlayers: 0, eligiblePlayers: 20 });
    expect(zeroHtml).toContain(">0%</span>");
    expect(zeroHtml).not.toContain("is-pending");
    const almostAll = renderAchievementCard(item, false, "", { achievedPlayers: 9999, eligiblePlayers: 10000 });
    expect(almostAll).toContain(">99.9%</span>");
    expect(almostAll).not.toContain(">100%</span>");
    const everyone = renderAchievementCard(item, false, "", { achievedPlayers: 1, eligiblePlayers: 1 });
    expect(everyone).toContain(">100%</span>");
    expect(everyone).not.toContain("is-unlocked");
    expect(everyone).toContain("1/1 位已开局玩家");
  });
});
