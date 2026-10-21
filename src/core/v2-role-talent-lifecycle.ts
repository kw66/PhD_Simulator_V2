import { gameRandom } from "./v2-game-random";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import { recordPersonalIncome } from "./v2-money";
import { recordAchievementSanCapGain } from "./v2-achievement-runtime-types";
import { addOrReplaceBuffs } from "./v2-buffs";
import { PAPER_SLOT_LIMIT, SCORE_BY_TARGET } from "./v2-content";
import { createGrantedPublishedPaper } from "./v2-publication-rules";
import { settleGreedReset } from "./v2-role-talent-greed";
import { recordLabFinance } from "./v2-lab-finance-ledger";
import { formatMoney, roundMoney } from "./v2-money";
import { describeTalentChange, recordTalentTrigger } from "./v2-talent-history";
import { applyPlayerAttributeChange, getPlayerAttributeCap } from "./v2-player-attributes";
import { getRoleKindReviewerBonus, getRoleTalentLevel, type PlayerAttribute } from "./v2-role-talent-state";
import { applyTierResist, createSlothSanBuff } from "./v2-sanity-rules";
import type { Buff, GameState, Paper } from "./v2-types";

const ATTRIBUTES = ["research", "social", "favor"] as const;
const level = getRoleTalentLevel;
const precise = (value: number) => Number(value.toFixed(10));
const STAT_NAMES = { research: "科研", social: "社交", favor: "导师好感", san: "SAN", money: "金币" } as const;

function isPlayerFirstAuthor(paper: Paper): boolean {
  return !paper.nonFirstAuthor && (!paper.leadAuthorId || paper.leadAuthorId === "player");
}

function logTalent(before: GameState, after: GameState, id: string, name: string, reason: string, extra: string[] = [], key = String(after.totalMonths)): GameState {
  const effects = (Object.keys(STAT_NAMES) as Array<keyof typeof STAT_NAMES>)
    .filter((stat) => before.player[stat] !== after.player[stat])
    .map((stat) => describeTalentChange(STAT_NAMES[stat], before.player[stat], after.player[stat]));
  if (before.sanCap !== after.sanCap) effects.push(describeTalentChange("SAN上限", before.sanCap, after.sanCap));
  for (const stat of ATTRIBUTES) {
    const oldCap = getPlayerAttributeCap(before, stat), newCap = getPlayerAttributeCap(after, stat);
    if (oldCap !== newCap) effects.push(describeTalentChange(`${STAT_NAMES[stat]}上限`, oldCap, newCap));
  }
  if (!effects.length && !extra.length) return after;
  return recordTalentTrigger(after, `role-${id}:${key}`, {
    name, recipient: after.playerName ? `你·${after.playerName}` : "你", reason, effects: [...effects, ...extra],
  });
}

function addAttributes(state: GameState, changes: Partial<Record<PlayerAttribute, number>>): GameState {
  for (const stat of ATTRIBUTES) {
    if (changes[stat]) state = applyPlayerAttributeChange(state, stat, changes[stat]!).state;
  }
  return state;
}

function recoverSan(state: GameState, amount: number): GameState {
  if (amount <= 0 || state.player.san >= state.sanCap) return state;
  const san = Math.min(state.sanCap, state.player.san + amount);
  return { ...state, player: { ...state.player, san: usesGameplayRulesFrom("20261021-r13") ? precise(san) : san } };
}

/** Apply only the selected run's allocation, never the mutable setup allocation. */
export function initializeRoleTalents(state: GameState): GameState {
  if (!state.roleTalents || state.roleTalents.initialized) return state;
  const before = state;
  state = { ...state, roleTalents: { ...state.roleTalents, initialized: true, regularActionBudget: 1, regularActionsSpent: 0 } };
  if (state.selectedRoleId === "teacher-child") state = logTalent(state, addAttributes(state, { favor: level(state, "near-the-source") }), "near-the-source", "近水楼台", "入学天赋生效");
  if (state.selectedRoleId === "social") state = logTalent(state, addAttributes(state, { social: level(state, "natural-charisma") }), "natural-charisma", "八面玲珑", "入学天赋生效");
  if (state.selectedRoleId === "normal-reversed") {
    const rank = level(state, "sloth-head-start");
    state = logTalent(state, addAttributes(state, { research: rank, social: rank, favor: rank }), "sloth-head-start", "天纵不羁", "入学天赋生效");
    const curse = createSlothSanBuff(state);
    if (curse) state = { ...state, buffs: addOrReplaceBuffs(state.buffs, [curse]) };
  }
  if (state.selectedRoleId === "genius-reversed") {
    const extra = Math.min(PAPER_SLOT_LIMIT - state.paperSlotsUnlocked, level(state, "paper-opening"));
    state = { ...state, paperSlotsUnlocked: state.paperSlotsUnlocked + extra };
    if (extra) state = logTalent(state, state, "paper-opening", "记忆残响", "入学天赋生效", [`论文卡片+${extra}`]);
  }
  if (state.selectedRoleId === "teacher-child-reversed") {
    const old = state;
    const current = getPlayerAttributeCap(state, "favor");
    const target = Math.max(6, current - level(state, "favor-reset-decrease"));
    state = { ...state, roleTalents: { ...state.roleTalents!, capBonuses: { ...state.roleTalents!.capBonuses, favor: (state.roleTalents!.capBonuses?.favor ?? 0) + target - current } } };
    state = logTalent(old, state, "favor-reset-decrease", "得寸进尺", "入学时调整导师好感上限");
  }
  if (state.selectedRoleId === "genius") {
    state = logTalent(state, addAttributes(state, { research: level(state, "innate-insight") }), "innate-insight", "生而知之", "入学前的积累");
    const buffs: Buff[] = [];
    for (const [id, name, action] of [
      ["idea-insight", "灵光乍现", "idea"],
      ["experiment-practice", "躬行求真", "experiment"],
      ["writing-mastery", "妙笔成章", "writing"],
    ] as const) {
      const rank = level(state, id);
      if (rank) {
        buffs.push({ id: `role-talent-${id}`, name, source: "角色天赋", timing: "permanent", remainingMonths: null, actionEffects: { [action]: { bonus: 2 * rank } } });
        state = logTalent(state, state, id, name, "入学天赋生效", [`${{ idea: "想idea", experiment: "做实验", writing: "写论文" }[action]}永久+${rank * 2}分`]);
      }
    }
    state = { ...state, buffs: addOrReplaceBuffs(state.buffs, buffs) };
  }
  if (state.selectedRoleId === "rich") {
    state = { ...state, player: { ...state.player, money: roundMoney(state.player.money + 2 * level(state, "heiress")) } };
    state = logTalent(before, state, "heiress", "千金小姐", "入学准备金");
  }
  if (state.selectedRoleId === "chosen") {
    const rank = level(state, "favored-by-fate");
    state = addAttributes(state, { research: rank, social: rank, favor: rank });
    state = { ...state, player: { ...state.player, money: roundMoney(state.player.money + rank) } };
    state = logTalent(before, state, "favored-by-fate", "天命所眷", "入学天赋生效");
  }
  return state;
}

export function applyRoleTalentAdvisorAssignment(state: GameState): GameState {
  if (!state.roleTalents || state.roleTalents.advisorFundingGranted || !state.selectedAdvisorName) return state;
  const amount = state.selectedRoleId === "rich" ? 15 * level(state, "bring-funding") : 0;
  state = { ...state, roleTalents: { ...state.roleTalents, advisorFundingGranted: true } };
  if (!amount) return state;
  state = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: roundMoney(state.advisorProgressState.funding + amount) } };
  state = recordLabFinance(state, "initial-funding", amount);
  return logTalent(state, state, "bring-funding", "带资进组", "加入导师实验室", [`导师科研经费+${amount}`]);
}

export function syncRoleTalentFellows(state: GameState): GameState {
  const rank = state.selectedRoleId === "genius" && state.degree === "phd" ? level(state, "rise-together") : 0;
  if (!rank) return state;
  const boosted = new Set(state.roleTalents?.boostedFellowIds ?? []);
  const effects: string[] = [];
  let changed = false;
  const fellowProgressState = state.fellowProgressState.map((fellow) => {
    if (boosted.has(fellow.id)) return fellow;
    boosted.add(fellow.id);
    changed = true;
    const growth = applyTierResist(rank, fellow.research, gameRandom, 20).effectiveChange;
    if (growth) effects.push(`${fellow.name ?? "同学"}科研+${formatMoney(growth)}`);
    return { ...fellow, research: precise(fellow.research + growth) };
  });
  if (!changed) return state;
  const next = { ...state, fellowProgressState, roleTalents: { ...state.roleTalents!, boostedFellowIds: [...boosted] } };
  return logTalent(state, next, "rise-together", "共攀高峰", "转博后每位同学仅获得一次提升", effects, [...boosted].join(","));
}

export function applyRoleTalentPhdTransfer(before: GameState, after: GameState): GameState {
  if (before.degree === "phd" || after.degree !== "phd" || !after.roleTalents || after.roleTalents.phdGranted) return after;
  let state: GameState = { ...after, roleTalents: { ...after.roleTalents, phdGranted: true } };
  const firstAuthor = [...new Map([...before.papers, ...before.externalPublications]
    .filter((paper) => paper.status === "published" && isPlayerFirstAuthor(paper))
    .map((paper) => [paper.id, paper])).values()];
  const aPapers = firstAuthor.filter((paper) => paper.target === "A").length;
  if (state.selectedRoleId === "normal") {
    const rank = level(state, "self-determination");
    const rewards = Object.fromEntries(ATTRIBUTES.map((stat) => {
      const raw = precise(before.player[stat] * rank / 10);
      return [stat, usesGameplayRulesFrom("20261021-r13") ? raw : Math.ceil(raw)];
    }));
    state = logTalent(state, addAttributes(state, rewards), "self-determination", "我命由我", "转博奖励");
  } else if (state.selectedRoleId === "rich") {
    const wealth = roundMoney(before.player.money * 0.25 * level(state, "wealth-growth"));
    const papers = firstAuthor.length * level(state, "knowledge-is-wealth");
    for (const [id, name, gain] of [["wealth-growth", "财富倍增", wealth], ["knowledge-is-wealth", "书中自有黄金屋", papers]] as const) {
      state = logTalent(state, recordPersonalIncome({ ...state, player: { ...state.player, money: roundMoney(state.player.money + gain) } }, gain), id, name, "转博奖励");
    }
  } else if (state.selectedRoleId === "genius") {
    // New capacity accommodates this batch; new resistance reductions apply afterward.
    const extraCap = aPapers * level(state, "boundless-study");
    state = logTalent(state, { ...state, researchCapacityState: { ...state.researchCapacityState, otherCapBonus: state.researchCapacityState.otherCapBonus + extraCap } }, "boundless-study", "学无止境", `转博时已有${aPapers}篇一作A类论文`);
    state = logTalent(state, addAttributes(state, { research: aPapers * level(state, "proven-by-papers") }), "proven-by-papers", "以文证道", `转博时已有${aPapers}篇一作A类论文`);
    if (level(state, "academic-confidence")) {
      const count = new Set([...before.papers, ...before.externalPublications]
        .filter((paper) => paper.status === "published" && paper.target === "A").map((paper) => paper.id)).size;
      const reduction = precise(Math.min(0.6, count * 0.1));
      state = { ...state, roleTalents: { ...state.roleTalents!, researchGrowthResistanceReduction: reduction } };
      if (reduction) state = logTalent(state, state, "academic-confidence", "学术底气", `转博时已有${count}篇A类论文`, [`科研增长抵抗降低${Math.round(reduction * 100)}个百分点`]);
    }
    state = syncRoleTalentFellows(state);
  } else if (state.selectedRoleId === "chosen" && level(state, "complete-potential")) {
    const snapshot = { ...before.player };
    const target = Math.max(...ATTRIBUTES.map((stat) => snapshot[stat]));
    const oldState = state;
    for (const stat of ATTRIBUTES) state = applyPlayerAttributeChange(state, stat, target - snapshot[stat], "equalize").state;
    state = logTalent(oldState, state, "complete-potential", "查缺补漏", "转博时补足短板，差额经过抵抗");
  } else if (state.selectedRoleId === "social") {
    const old = state;
    const gain = before.fellowProgressState.length * level(state, "circle-of-friends");
    state = { ...state, roleTalents: { ...state.roleTalents!, capBonuses: { ...state.roleTalents!.capBonuses, social: (state.roleTalents!.capBonuses?.social ?? 0) + gain } } };
    state = addAttributes(state, { social: gain });
    state = logTalent(old, state, "circle-of-friends", "高朋满座", `转博时有${before.fellowProgressState.length}位同学`);
    const kindReviewerBonus = getRoleKindReviewerBonus(state);
    if (kindReviewerBonus) state = logTalent(state, state, "kindly-reviewed", "人缘加持", "转博后随当前社交生效", [`心软审稿人概率+${formatMoney(kindReviewerBonus * 100)}个百分点`]);
  } else if (state.selectedRoleId === "teacher-child") {
    const count = Math.floor(Math.max(0, before.player.favor) / 6) * level(state, "family-patronage");
    for (let i = 0; i < count; i++) {
      const publication = createGrantedPublishedPaper(state.totalMonths, state.externalPublications.length,
        { target: "C", acceptedScore: 20, title: `长辈提携·合作研究${i + 1}`, nonFirstAuthor: false },
        [...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])]);
      state = { ...state, externalPublications: [...state.externalPublications, publication], totalResearchScore: state.totalResearchScore + SCORE_BY_TARGET.C };
    }
    if (count) state = logTalent(state, state, "family-patronage", "长辈提携", "转博赠稿", [`一作C类论文+${count}篇`, `科研分+${count * SCORE_BY_TARGET.C}`]);
    const gpu = level(state, "computing-support"), workstation = level(state, "workspace-renewal");
    state = { ...state, shopState: { ...state.shopState, entitlements: { ...state.shopState.entitlements, gpuTransaction: state.shopState.entitlements.gpuTransaction + gpu, workstationTransaction: state.shopState.entitlements.workstationTransaction + workstation } } };
    if (gpu) state = logTalent(state, state, "computing-support", "算力后盾", "转博支持", [`显卡报销+${gpu}次`]);
    if (workstation) state = logTalent(state, state, "workspace-renewal", "工位焕新", "转博支持", [`工位报销+${workstation}次`]);
  } else if (state.selectedRoleId === "normal-reversed") {
    const rank = level(state, "post-phd-growth");
    state = logTalent(state, addAttributes(state, Object.fromEntries(ATTRIBUTES.map((stat) => [stat, precise(before.player[stat] * 0.5 * rank)]))), "post-phd-growth", "天生我材", "转博奖励");
    const curse = createSlothSanBuff(state);
    if (curse) state = { ...state, buffs: addOrReplaceBuffs(state.buffs, [curse]) };
  } else if (state.selectedRoleId === "genius-reversed") {
    state = logTalent(state, addAttributes(state, { research: firstAuthor.length * level(state, "papers-to-insight") }), "papers-to-insight", "积稿成学", `转博时已有${firstAuthor.length}篇已发表一作论文`);
  }
  return state;
}

export function settleRoleTalentYearEnd(state: GameState): GameState {
  if (!state.roleTalents || state.month !== 12 || state.roleTalents.lastAnnualSettlement === state.year) return state;
  state = { ...state, roleTalents: { ...state.roleTalents, lastAnnualSettlement: state.year } };
  if (state.selectedRoleId === "genius") state = logTalent(state, addAttributes(state, { research: level(state, "tireless-scholar") }), "tireless-scholar", "学而不倦", "学年结束");
  if (state.selectedRoleId === "social") state = logTalent(state, addAttributes(state, { social: level(state, "growing-connections") }), "growing-connections", "左右逢源", "学年结束");
  if (state.selectedRoleId === "teacher-child") state = logTalent(state, addAttributes(state, { favor: level(state, "growing-familiarity") }), "growing-familiarity", "朝夕相处", "学年结束");
  if (state.degree !== "phd") return state;
  if (state.selectedRoleId === "normal") {
    const rank = level(state, "epiphany");
    state = logTalent(state, addAttributes(state, { research: rank, social: rank, favor: rank }), "epiphany", "厚积薄发", "博士学年结束");
  }
  if (state.selectedRoleId === "chosen") {
    const rank = level(state, "balanced-growth");
    const minimum = Math.min(...ATTRIBUTES.map((stat) => state.player[stat]));
    const changes = Object.fromEntries(ATTRIBUTES.map((stat) => [stat, state.player[stat] === minimum ? rank : 0]));
    state = logTalent(state, addAttributes(state, changes), "balanced-growth", "齐头并进", "学年结束，提升所有并列最低项");
  }
  return state;
}

export function settleRoleTalentDiseaseMilestones(state: GameState): GameState {
  const rank = state.selectedRoleId === "chosen" ? level(state, "misfortune-to-fortune") : 0;
  if (!rank) return state;
  const deepest = Math.max(0, Math.floor(-state.illnessProbability / 100));
  const previous = state.roleTalents?.negativeDiseaseMilestone ?? 0;
  if (deepest <= previous) return state;
  state = { ...state, roleTalents: { ...state.roleTalents!, negativeDiseaseMilestone: deepest } };
  const gain = (deepest - previous) * rank;
  return logTalent(state, addAttributes(state, { research: gain, social: gain, favor: gain }), "misfortune-to-fortune", "否极泰来", `疾病概率首次达到-${deepest * 100}%档位`, [`新领取${deepest - previous}档奖励；历史已领至-${deepest * 100}%，不会重复领取`], String(deepest));
}

function shuffle<T>(values: T[], getRoll: () => number): T[] {
  const shuffled = [...values];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.max(0, Math.min(i, Math.floor(getRoll() * (i + 1))));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

function applySwap(state: GameState, keys: Array<PlayerAttribute | "san" | "money">, getRoll: () => number): GameState {
  const snapshot = state;
  const targets = shuffle(keys.map((key) => snapshot.player[key]), getRoll);
  const player = { ...snapshot.player };
  const uncapped = level(state, "swap-breaks-cap") > 0;
  keys.forEach((key, index) => {
    const target = targets[index]!;
    if (key === "san") player.san = uncapped ? target : Math.min(snapshot.sanCap, target);
    else if (key === "money") player.money = roundMoney(target);
    else {
      const moved = applyPlayerAttributeChange(snapshot, key, target - snapshot.player[key], "swap").state.player[key];
      player[key] = uncapped ? moved : Math.min(getPlayerAttributeCap(snapshot, key), moved);
    }
  });
  return { ...state, player };
}

export function settleRoleTalentMonthStart(state: GameState, getRoll: () => number = gameRandom, options: { skipSwaps?: boolean } = {}): GameState {
  if (!state.roleTalents || state.totalMonths <= 0 || state.roleTalents.lastMonthlySettlement === state.totalMonths) return state;
  state = { ...state, roleTalents: { ...state.roleTalents, lastMonthlySettlement: state.totalMonths, regularActionBudget: 1, regularActionsSpent: 0 } };
  if (state.selectedRoleId === "normal") {
    if (state.totalMonths === 2) state = logTalent(state, recoverSan(state, 2 * level(state, "first-month-drive")), "first-month-drive", "满怀干劲", "入学首月结束");
    if (state.totalMonths > 1 && (state.month === 1 || state.month === 7)) state = logTalent(state, recoverSan(state, level(state, "first-month-drive-plus")), "first-month-drive-plus", "满怀干劲+", "新学期开始");
    if (level(state, "burnout") && state.sanCap < 8) state = logTalent(state, recordAchievementSanCapGain({ ...state, sanCap: state.sanCap + 1 }, 1), "burnout", "触底反弹", "月初SAN上限低于8");
    if (state.degree === "phd") {
      const accumulated = precise((state.roleTalents!.actionRemainder ?? 0) + level(state, "diligence") / 10);
      const extra = Math.floor(accumulated);
      state = { ...state, actionState: { ...state.actionState, limit: state.actionState.limit - (state.roleTalents!.monthlyActionBonus ?? 0) + extra }, roleTalents: { ...state.roleTalents!, actionRemainder: precise(accumulated - extra), monthlyActionBonus: extra, regularActionBudget: 1 + extra } };
      if (extra) state = logTalent(state, state, "diligence", "勤能补拙", "累计行动余量到账", [`本月行动+${extra}次`]);
    }
  }
  if (state.totalMonths <= 1) return state;
  if (state.selectedRoleId === "rich-reversed") return settleGreedReset(state);
  if (state.selectedRoleId === "social-reversed" && (state.roleTalents?.socialStagnantMonths ?? 0) >= 2) {
    // A preview quotes either branch without consuming the actual random stream.
    const stat = (options.skipSwaps ? 0 : getRoll()) < 0.5 ? "research" : "favor";
    state = logTalent(state, applyPlayerAttributeChange(state, stat, -1).state, "social-stagnation", "患得患失", "连续两个月社交没有实际变化");
    state = { ...state, roleTalents: { ...state.roleTalents!, lastStagnationCurseMonth: state.totalMonths } };
  }
  if (state.selectedRoleId === "chosen") {
    const probability = state.illnessProbability - level(state, "fortunate-health");
    const oldProbability = state.illnessProbability;
    state = { ...state, illnessProbability: level(state, "misfortune-to-fortune") ? probability : Math.max(0, probability) };
    if (state.illnessProbability !== oldProbability) state = logTalent(state, state, "fortunate-health", "吉人天相", "月初健康调整", [describeTalentChange("疾病概率（百分点）", oldProbability, state.illnessProbability)]);
    return settleRoleTalentDiseaseMilestones(state);
  }
  if (state.selectedRoleId === "chosen-reversed") {
    if (!options.skipSwaps) {
      if (state.degree === "phd" && level(state, "post-phd-swap")) {
        state = logTalent(state, applySwap(state, ["research", "social", "favor", "san", "money"], getRoll), "post-phd-swap", "万象更迭", "月初随机排列，交换差额受抵抗影响");
      } else {
        if (level(state, "attribute-swap")) state = logTalent(state, applySwap(state, [...ATTRIBUTES], getRoll), "attribute-swap", "乾坤错位", "月初随机排列，交换差额受抵抗影响");
        if (level(state, "san-money-swap")) state = logTalent(state, applySwap(state, ["san", "money"], getRoll), "san-money-swap", "祸福相依", "月初SAN与金币随机排列");
      }
    }
    // October is the first curse month; the five targets then repeat in order.
    const target = (["san", "money", ...ATTRIBUTES] as const)[(state.totalMonths - 2) % 5]!;
    const beforeCurse = state;
    if (target === "san" || target === "money") {
      state = { ...state, player: { ...state.player, [target]: target === "money" ? roundMoney(state.player.money - 1) : state.player.san - 1 } };
    } else state = applyPlayerAttributeChange(state, target, -1).state;
    state = logTalent(beforeCurse, state, "fate-curse", "命运反噬", "月初轮流损失一项属性");
    state = { ...state, roleTalents: { ...state.roleTalents!, lastSwapMonth: state.totalMonths, lastCurseMonth: state.totalMonths } };
  }
  return state;
}

/** Runs while the ending month's action counters and ordinary social changes are still available. */
export function settleRoleTalentMonthEnd(state: GameState): GameState {
  if (!state.roleTalents || state.totalMonths < 1 || state.roleTalents.lastMonthEndSettlement === state.totalMonths) return state;
  state = { ...state, roleTalents: { ...state.roleTalents, lastMonthEndSettlement: state.totalMonths } };
  if (state.selectedRoleId === "normal-reversed" && level(state, "san-cap-reserve")) {
    const unused = Math.max(0, (state.roleTalents!.regularActionBudget ?? 1) - (state.roleTalents!.regularActionsSpent ?? 0));
    const remaining = Math.max(0, 20 - (state.roleTalents!.sanCapReserveBonus ?? 0));
    const gained = Math.min(unused, remaining);
    if (gained) state = logTalent(state, recordAchievementSanCapGain({
      ...state,
      sanCap: state.sanCap + gained,
      roleTalents: { ...state.roleTalents!, sanCapReserveBonus: (state.roleTalents!.sanCapReserveBonus ?? 0) + gained },
    }, gained), "san-cap-reserve", "日渐圆润", "月末剩余常规行动", [`未使用${unused}次常规行动`]);
  }
  if (state.selectedRoleId === "social-reversed") {
    const changed = state.roleTalents!.socialChangedMonth === state.totalMonths;
    state = { ...state, roleTalents: { ...state.roleTalents!, socialStagnantMonths: changed ? 0 : (state.roleTalents!.socialStagnantMonths ?? 0) + 1 } };
  }
  return state;
}

export function settleRoleTalentPaperRejection(state: GameState, paper: Paper): GameState {
  if (state.selectedRoleId !== "genius-reversed" || state.degree !== "master" || !level(state, "learning-from-rejection")
    || !isPlayerFirstAuthor(paper) || (paper.rejectionCount ?? 0) > 0 || state.roleTalents?.rejectedPaperRewardIds?.includes(paper.id)) return state;
  state = { ...state, roleTalents: { ...state.roleTalents!, rejectedPaperRewardIds: [...(state.roleTalents?.rejectedPaperRewardIds ?? []), paper.id] } };
  return logTalent(state, addAttributes(state, { research: 1 }), "learning-from-rejection", "屡败屡研", `一作论文《${paper.title}》首次拒稿`, [], paper.id);
}
