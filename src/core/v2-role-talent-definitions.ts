import type { RoleId } from "./v2-types";
import { MAX_ROLE_LEVEL, ROLE_TALENT_POINTS_PER_LEVEL } from "./v2-role-experience";
import { LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD } from "./v2-lab-project-constants";

export type TalentAllocation = Partial<Record<RoleId, Record<string, number>>>;

export interface DesignedTalentNode {
  id: string;
  name: string;
  icon: string;
  tier: number;
  column: string;
  row: string;
  maxLevel: number;
  cost: number;
  effect: string;
  prerequisiteIds: readonly string[];
  initialLevel?: number;
  fixed?: boolean;
  challenge?: boolean;
}

export const NORMAL_TALENT_NODES = [
  { id: "first-month-drive", name: "满怀干劲", icon: "heart-plus", tier: 0, column: "1", row: "1 / 4", maxLevel: 3, cost: 1, effect: "首月结束后，下月初SAN回复+2/级", prerequisiteIds: [] },
  { id: "self-determination", name: "我命由我", icon: "sunrise", tier: 1, column: "2", row: "1", maxLevel: 12, cost: 1, effect: "转博时科研、社交、导师好感提升10%/级，向上取整", prerequisiteIds: ["first-month-drive"] },
  { id: "diligence", name: "勤能补拙", icon: "footprints", tier: 1, column: "2", row: "2", maxLevel: 10, cost: 1, effect: "转博后每月行动+0.1次/级，余数逐月累积", prerequisiteIds: ["first-month-drive"] },
  { id: "first-month-drive-plus", name: "满怀干劲+", icon: "zap", tier: 1, column: "2", row: "3", maxLevel: 5, cost: 1, effect: "除入学以外，每学期初SAN回复+1/级", prerequisiteIds: ["first-month-drive"] },
  { id: "breakthrough", name: "突破极限", icon: "rocket", tier: 2, column: "3", row: "1", maxLevel: 1, cost: 2, effect: "每笔属性奖励溢出时上限+1，本次溢出可填入新增上限，累计不限", prerequisiteIds: ["self-determination"] },
  { id: "burning-life-alpha", name: "燃烧生命α", icon: "heart-crack", tier: 2, column: "3", row: "2", maxLevel: 1, cost: 3, effect: "转博后每月行动点耗尽仍可行动1次，消耗1点SAN上限", prerequisiteIds: ["diligence"] },
  { id: "burning-life-beta", name: "燃烧生命β", icon: "heart-pulse", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 2, effect: "转博后每月SAN不足时，免除1次SAN消耗，消耗1点SAN上限", prerequisiteIds: ["first-month-drive-plus"] },
  { id: "burnout", name: "触底反弹", icon: "flame", tier: 3, column: "4", row: "2 / 4", maxLevel: 1, cost: 3, effect: "每月初SAN上限低于8时，SAN上限+1", prerequisiteIds: ["burning-life-alpha", "burning-life-beta"] },
  { id: "epiphany", name: "厚积薄发", icon: "sparkles", tier: 3, column: "4", row: "1", maxLevel: 2, cost: 3, effect: "转博后每年科研、社交、导师好感+1/级", prerequisiteIds: ["breakthrough"] },
] as const satisfies readonly DesignedTalentNode[];

export const RICH_TALENT_NODES = [
  { id: "red-envelope", name: "红包拿来", icon: "gift", tier: 0, column: "1", row: "1", maxLevel: 4, cost: 1, effect: "寒假事件中压岁钱+1/级", prerequisiteIds: [] },
  { id: "heiress", name: "千金小姐", icon: "wallet", tier: 0, column: "1", row: "3", maxLevel: 4, cost: 1, effect: "初始金币+2/级", prerequisiteIds: [] },
  { id: "bring-funding", name: "带资进组", icon: "hand-coins", tier: 1, column: "2", row: "2", maxLevel: 4, cost: 1, effect: "导师科研经费+15/级", prerequisiteIds: ["red-envelope", "heiress"] },
  // Preview rule for later activation: both transfer bonuses use the pre-transfer state, so paper rewards do not compound the coin bonus.
  { id: "wealth-growth", name: "财富倍增", icon: "trending-up", tier: 1, column: "2", row: "1", maxLevel: 8, cost: 1, effect: "转博时金币增加25%/级", prerequisiteIds: ["red-envelope"] },
  { id: "knowledge-is-wealth", name: "书中自有黄金屋", icon: "book-open", tier: 1, column: "2", row: "3", maxLevel: 5, cost: 2, effect: "转博时每篇一作论文奖励1金币/级", prerequisiteIds: ["heiress"] },
  { id: "investment-savvy", name: "理财能手", icon: "piggy-bank", tier: 2, column: "3", row: "1", maxLevel: 2, cost: 3, effect: "每笔投资5金币，12个月后利息+1/级，可同时多笔", prerequisiteIds: ["wealth-growth"] },
  { id: "work-pays-off", name: "薪满意足", icon: "briefcase-business", tier: 2, column: "3", row: "3", maxLevel: 2, cost: 3, effect: "实习收入+50%/级", prerequisiteIds: ["knowledge-is-wealth"] },
  { id: "gold-power-alpha", name: "金之力α", icon: "circle-dollar-sign", tier: 3, column: "4", row: "3", maxLevel: 1, cost: 2, effect: "金币达到50时，每点SAN消耗转为1金币", prerequisiteIds: ["work-pays-off"] },
  { id: "gold-power-beta", name: "金之力β", icon: "badge-dollar-sign", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 2, effect: "金币达到50时，导师好感降低转为金币-2/级", prerequisiteIds: ["bring-funding"] },
  { id: "gold-power-gamma", name: "金之力γ", icon: "coins", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 2, effect: "金币达到50时，社交能力降低转为金币-2/级", prerequisiteIds: ["investment-savvy"] },
] as const satisfies readonly DesignedTalentNode[];

export const GENIUS_TALENT_NODES = [
  { id: "innate-insight", name: "生而知之", icon: "brain", tier: 0, column: "1", row: "1", maxLevel: 5, cost: 1, effect: "初始科研能力+1/级", prerequisiteIds: [] },
  { id: "idea-insight", name: "灵光乍现", icon: "lightbulb", tier: 0, column: "1", row: "3", maxLevel: 3, cost: 1, effect: "永久想idea+2分/级", prerequisiteIds: [] },
  { id: "tireless-scholar", name: "学而不倦", icon: "calendar-days", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 3, effect: "科研能力每年+1", prerequisiteIds: ["innate-insight"] },
  { id: "thirst-for-knowledge", name: "求知若渴", icon: "book-open", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 1, effect: "不断学习事件出现概率+100%", prerequisiteIds: ["innate-insight"] },
  { id: "experiment-practice", name: "躬行求真", icon: "flask-conical", tier: 1, column: "2", row: "3", maxLevel: 3, cost: 1, effect: "永久做实验+2分/级", prerequisiteIds: ["idea-insight"] },
  { id: "proven-by-papers", name: "以文证道", icon: "file-text", tier: 2, column: "3", row: "1", maxLevel: 3, cost: 2, effect: "转博时每篇一作A类论文，科研能力+1/级", prerequisiteIds: ["tireless-scholar"] },
  { id: "boundless-study", name: "学无止境", icon: "infinity", tier: 2, column: "3", row: "2", maxLevel: 5, cost: 1, effect: "转博时每篇一作A类论文，科研上限+1/级", prerequisiteIds: ["thirst-for-knowledge"] },
  { id: "writing-mastery", name: "妙笔成章", icon: "notebook-pen", tier: 2, column: "3", row: "3", maxLevel: 3, cost: 1, effect: "永久写论文+2分/级", prerequisiteIds: ["experiment-practice"] },
  { id: "rise-together", name: "共攀高峰", icon: "users", tier: 3, column: "4", row: "1", maxLevel: 4, cost: 1, effect: "转博后同学的科研能力+1/级", prerequisiteIds: ["proven-by-papers"] },
  { id: "lasting-work", name: "历久弥新", icon: "hourglass", tier: 3, column: "4", row: "3", maxLevel: 5, cost: 1, effect: "转博后未发表论文分数每月衰减率减少3个百分点/级", prerequisiteIds: ["writing-mastery"] },
  { id: "academic-confidence", name: "学术底气", icon: "award", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 3, effect: "转博时每篇已发表A类论文，使科研增长抵抗降低10个百分点，最低为0", prerequisiteIds: ["boundless-study"] },
] as const satisfies readonly DesignedTalentNode[];

export const TEACHER_CHILD_TALENT_NODES = [
  { id: "near-the-source", name: "近水楼台", icon: "house", tier: 0, column: "1", row: "1 / 4", maxLevel: 5, cost: 1, effect: "初始导师好感+1/级", prerequisiteIds: [] },
  { id: "growing-familiarity", name: "朝夕相处", icon: "calendar-days", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 3, effect: "导师好感每年+1", prerequisiteIds: ["near-the-source"] },
  { id: "family-host", name: "长辈买单", icon: "hand-coins", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 1, effect: "组内团建事件中聚餐必定由导师请客", prerequisiteIds: ["near-the-source"] },
  { id: "family-patronage", name: "长辈提携", icon: "files", tier: 1, column: "2", row: "3", maxLevel: 2, cost: 3, effect: "转博时每6点导师好感赠送1篇一作C类论文/级", prerequisiteIds: ["near-the-source"] },
  { id: "computing-support", name: "算力后盾", icon: "cpu", tier: 2, column: "3", row: "1", maxLevel: 2, cost: 4, effect: "转博时获得1次显卡报销/级", prerequisiteIds: ["growing-familiarity"] },
  { id: "workspace-renewal", name: "工位焕新", icon: "monitor", tier: 2, column: "3", row: "2", maxLevel: 2, cost: 4, effect: "转博时获得1次工位报销/级", prerequisiteIds: ["growing-familiarity"] },
  { id: "mentor-insight", name: "名师点拨", icon: "book-open", tier: 2, column: "3", row: "3", maxLevel: 2, cost: 2, effect: "导师协作分+50%/级", prerequisiteIds: ["family-patronage"] },
  { id: "funding-shield", name: "经费护航", icon: "store", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 3, effect: `科研经费≥${LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD}且足够支付时，购买AI优先使用经费`, prerequisiteIds: ["computing-support", "workspace-renewal"] },
  { id: "learning-by-osmosis", name: "耳濡目染", icon: "graduation-cap", tier: 3, column: "4", row: "3", maxLevel: 1, cost: 6, effect: "转博后科研能力视为科研能力与导师好感的较大值", prerequisiteIds: ["mentor-insight"] },
  { id: "mentor-expectations", name: "师门厚望", icon: "heart-handshake", tier: 3, column: "4", row: "2", maxLevel: 3, cost: 1, effect: "导师好感增长抵抗降低10个百分点/级，最低为0；下降不变", prerequisiteIds: ["mentor-insight"] },
] as const satisfies readonly DesignedTalentNode[];

export const CHOSEN_TALENT_NODES = [
  { id: "favored-by-fate", name: "天命所眷", icon: "star", tier: 0, column: "1", row: "1", maxLevel: 2, cost: 3, effect: "初始科研、社交、导师好感、金币+1/级", prerequisiteIds: [] },
  { id: "athletic-prodigy", name: "运动健将", icon: "dumbbell", tier: 0, column: "1", row: "2", maxLevel: 2, cost: 1, effect: "组内团建事件中羽毛球实力+20/级", prerequisiteIds: [] },
  { id: "lasting-fortune", name: "福运绵长", icon: "sparkles", tier: 1, column: "2", row: "1", maxLevel: 3, cost: 2, effect: "科研、社交、导师好感增长时，抵抗降低20个百分点/级，最低为0；下降不变", prerequisiteIds: ["favored-by-fate"] },
  { id: "lucky-hand", name: "牌运亨通", icon: "gem", tier: 0, column: "1", row: "3", maxLevel: 2, cost: 1, effect: "组内团建事件中打牌胜率+20%/级", prerequisiteIds: [] },
  { id: "rare-color-fate", name: "异色之缘", icon: "gamepad-2", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 1, effect: "游戏放松事件中游玩洛克王国必定捉到异色", prerequisiteIds: ["athletic-prodigy", "lucky-hand"] },
  { id: "effortless-reinstall", name: "手到擒来", icon: "cpu", tier: 1, column: "2", row: "3", maxLevel: 1, cost: 1, effect: "显卡故障事件中自己重装必定成功", prerequisiteIds: ["athletic-prodigy", "lucky-hand"] },
  { id: "fortunate-health", name: "吉人天相", icon: "shield", tier: 2, column: "3", row: "2 / 4", maxLevel: 4, cost: 1, effect: "每月疾病概率-1%/级", prerequisiteIds: ["rare-color-fate", "effortless-reinstall"] },
  { id: "complete-potential", name: "查缺补漏", icon: "chart-no-axes-combined", tier: 2, column: "3", row: "1", maxLevel: 1, cost: 7, effect: "转博时，按科研、社交、导师好感与三者最高值的差额提升属性，受抵抗影响", prerequisiteIds: ["lasting-fortune"] },
  { id: "balanced-growth", name: "齐头并进", icon: "sprout", tier: 3, column: "4", row: "1", maxLevel: 2, cost: 2, effect: "转博后科研、社交、导师好感中的最低项每年+1/级", prerequisiteIds: ["complete-potential"] },
  { id: "misfortune-to-fortune", name: "否极泰来", icon: "sunrise", tier: 3, column: "4", row: "2 / 4", maxLevel: 3, cost: 2, effect: "疾病概率可为负数，每满-100%，全属性+1/级", prerequisiteIds: ["fortunate-health"] },
] as const satisfies readonly DesignedTalentNode[];

export const CHOSEN_REVERSED_TALENT_NODES = [
  { id: "fate-curse", name: "命运反噬", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "SAN、金币、科研、社交、导师好感轮流在月初-1", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "attribute-swap", name: "乾坤错位", icon: "network", tier: 0, column: "1", row: "1", maxLevel: 1, cost: 2, effect: "每月科研、社交、导师好感随机排列，交换差额受抵抗影响", prerequisiteIds: [] },
  { id: "san-money-swap", name: "祸福相依", icon: "network", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 2, effect: "每月SAN、金币随机排列", prerequisiteIds: [] },
  { id: "post-phd-swap", name: "万象更迭", icon: "rotate-ccw", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 3, effect: "转博后每月科研、社交、导师好感、SAN、金币随机排列，三项属性的交换差额受抵抗影响", prerequisiteIds: ["attribute-swap", "san-money-swap"] },
  { id: "group-event-focus", name: "人声鼎沸", icon: "users", tier: 2, column: "3", row: "1", maxLevel: 4, cost: 2, effect: "组内团建事件出现概率+100%/级", prerequisiteIds: ["post-phd-swap"] },
  { id: "game-event-focus", name: "幻境游踪", icon: "gamepad-2", tier: 2, column: "3", row: "2", maxLevel: 4, cost: 2, effect: "游戏放松事件出现概率+100%/级", prerequisiteIds: ["post-phd-swap"] },
  { id: "swap-breaks-cap", name: "无界轮转", icon: "infinity", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 4, effect: "属性交换可突破上限", prerequisiteIds: ["group-event-focus", "game-event-focus"] },
  { id: "reverse-meter-alpha", name: "电表倒转α", icon: "brain", tier: 0, column: "1", row: "3", maxLevel: 3, cost: 1, effect: "科研增减时，抵抗降低10个百分点/级，最低为0", prerequisiteIds: [] },
  { id: "reverse-meter-beta", name: "电表倒转β", icon: "users", tier: 1, column: "2", row: "3", maxLevel: 3, cost: 1, effect: "社交增减时，抵抗降低10个百分点/级，最低为0", prerequisiteIds: ["reverse-meter-alpha"] },
  { id: "reverse-meter-gamma", name: "电表倒转γ", icon: "heart-handshake", tier: 2, column: "3", row: "3", maxLevel: 3, cost: 1, effect: "导师好感增减时，抵抗降低10个百分点/级，最低为0", prerequisiteIds: ["reverse-meter-beta"] },
] as const satisfies readonly DesignedTalentNode[];

export const SOCIAL_TALENT_NODES = [
  { id: "natural-charisma", name: "八面玲珑", icon: "smile", tier: 0, column: "1", row: "1", maxLevel: 5, cost: 1, effect: "初始社交+1/级", prerequisiteIds: [] },
  { id: "supporting-juniors", name: "提携后进", icon: "user-round", tier: 0, column: "1", row: "3", maxLevel: 1, cost: 2, effect: "指导师弟师妹事件出现概率+100%", prerequisiteIds: [] },
  { id: "growing-connections", name: "左右逢源", icon: "calendar-days", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 3, effect: "社交每年+1", prerequisiteIds: ["natural-charisma"] },
  { id: "peer-camaraderie", name: "同窗共进", icon: "handshake", tier: 1, column: "2", row: "3", maxLevel: 1, cost: 2, effect: "同门合作事件出现概率+100%", prerequisiteIds: ["supporting-juniors"] },
  { id: "circle-of-friends", name: "高朋满座", icon: "users", tier: 2, column: "3", row: "1", maxLevel: 2, cost: 3, effect: "转博时人际栏每位同学使社交+1/级、社交上限+1/级", prerequisiteIds: ["growing-connections"] },
  { id: "senior-mentorship", name: "师友相助", icon: "graduation-cap", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 2, effect: "师兄师姐指导事件出现概率+100%", prerequisiteIds: ["peer-camaraderie"] },
  { id: "kindly-reviewed", name: "人缘加持", icon: "heart", tier: 3, column: "4", row: "1", maxLevel: 5, cost: 2, effect: "转博时心软审稿人概率+社交×1%/级，其余类型保持相对比例", prerequisiteIds: ["circle-of-friends"] },
  { id: "collective-wisdom", name: "群策群力", icon: "network", tier: 3, column: "4", row: "3", maxLevel: 2, cost: 2, effect: "同学协作分+50%/级", prerequisiteIds: ["senior-mentorship"] },
  { id: "junior-delegation", name: "借力后进", icon: "hand-helping", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 2, effect: "麻烦师弟师妹不扣社交", prerequisiteIds: [] },
  { id: "junior-bond", name: "投桃报李", icon: "heart-handshake", tier: 1, column: "2", row: "2", maxLevel: 3, cost: 1, effect: "麻烦师弟师妹默契+1/级", prerequisiteIds: ["junior-delegation"] },
  { id: "paper-camaraderie", name: "珠联璧合", icon: "file-heart", tier: 2, column: "3", row: "2", maxLevel: 2, cost: 2, effect: "合作发表论文提升的默契+1/级", prerequisiteIds: ["junior-bond"] },
  { id: "overflow-social", name: "人多势众", icon: "user-round-plus", tier: 3, column: "4", row: "2", maxLevel: 2, cost: 2, effect: "人际栏同学溢出转为社交+1/级", prerequisiteIds: ["senior-mentorship"] },
] as const satisfies readonly DesignedTalentNode[];

export const NORMAL_REVERSED_TALENT_NODES = [
  { id: "sloth-core", name: "极致怠惰", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "SAN消耗×2；转博后SAN消耗×3", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "monthly-san-recovery", name: "松弛人生", icon: "heart-pulse", tier: 0, column: "1", row: "1", maxLevel: 3, cost: 2, effect: "每月SAN回复+1/级", prerequisiteIds: [] },
  { id: "sloth-head-start", name: "天纵不羁", icon: "sparkles", tier: 1, column: "2", row: "2", maxLevel: 5, cost: 2, effect: "初始全属性+1/级", prerequisiteIds: ["monthly-san-recovery"] },
  { id: "restful-idle", name: "睡得好香", icon: "hourglass", tier: 0, column: "1", row: "3", maxLevel: 3, cost: 2, effect: "休息效果+1/级", prerequisiteIds: [] },
  { id: "post-phd-recovery", name: "无所事事", icon: "heart-plus", tier: 1, column: "2", row: "1", maxLevel: 2, cost: 2, effect: "转博后每月SAN+已损SAN的10%/级", prerequisiteIds: ["monthly-san-recovery"] },
  { id: "post-phd-growth", name: "天生我材", icon: "trending-up", tier: 2, column: "3", row: "2", maxLevel: 2, cost: 2, effect: "转博时全属性+50%/级", prerequisiteIds: ["sloth-head-start"] },
  { id: "coffee-lifeline", name: "困睡醒科", icon: "brain", tier: 1, column: "2", row: "3", maxLevel: 2, cost: 2, effect: "休息后下次想idea、做实验、写论文+2/级，可叠加", prerequisiteIds: ["restful-idle"] },
  { id: "san-cap-reserve", name: "日渐圆润", icon: "shield", tier: 2, column: "3", row: "1", maxLevel: 1, cost: 2, effect: "每浪费1常规行动点，SAN上限+1", prerequisiteIds: ["post-phd-recovery"] },
  { id: "year-summary-recovery", name: "忙里偷闲", icon: "calendar-days", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 2, effect: "学年总结事件中休息会回满SAN", prerequisiteIds: ["coffee-lifeline"] },
  { id: "full-san-research", name: "满血状态", icon: "brain", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 2, effect: "操作开始前SAN为满时，科研能力视为+5", prerequisiteIds: ["post-phd-growth"] },
] as const satisfies readonly DesignedTalentNode[];

export const RICH_REVERSED_TALENT_NODES = [
  { id: "money-curse", name: "金钱诅咒", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "每月SAN/属性重置为0", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "money-growth", name: "聚沙成塔", icon: "coins", tier: 0, column: "1", row: "1", maxLevel: 3, cost: 2, effect: "每月金币+1/级", prerequisiteIds: [] },
  { id: "loss-to-money", name: "因祸得财", icon: "badge-dollar-sign", tier: 0, column: "1", row: "3", maxLevel: 1, cost: 2, effect: "科研、社交、导师好感每降低1点，金币+1", prerequisiteIds: [] },
  { id: "spend-to-break-curse", name: "破财消灾", icon: "shield-plus", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 3, effect: "每消耗100金币，金钱诅咒重置值+1", prerequisiteIds: ["money-growth"] },
  { id: "post-phd-money-conversion", name: "钱能通神", icon: "circle-dollar-sign", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 2, effect: "转博后每枚金币消耗随机转化提升SAN、三项属性及三项属性上限", prerequisiteIds: ["money-growth", "loss-to-money"] },
  { id: "finance-master", name: "理财能手", icon: "piggy-bank", tier: 2, column: "3", row: "2", maxLevel: 3, cost: 2, effect: "每笔投资5金币，12个月后利息+1/级，可同时多笔", prerequisiteIds: ["post-phd-money-conversion"] },
  { id: "coin-game", name: "金币游戏", icon: "coins", tier: 1, column: "2", row: "3", maxLevel: 1, cost: 3, effect: "每次属性减少1点，进行一次判定：50%金币×1.5，50%金币×0.4", prerequisiteIds: ["loss-to-money"] },
  { id: "investment-acceleration", name: "快速周转", icon: "clock-3", tier: 3, column: "4", row: "2", maxLevel: 6, cost: 1, effect: "投资回报周期-1个月/级", prerequisiteIds: ["finance-master"] },
  { id: "coin-game-comeback", name: "败局翻盘", icon: "rotate-ccw", tier: 2, column: "3", row: "3", maxLevel: 5, cost: 1, effect: "金币游戏失败后的倍率+0.05/级", prerequisiteIds: ["coin-game"] },
] as const satisfies readonly DesignedTalentNode[];

export const GENIUS_REVERSED_TALENT_NODES = [
  { id: "research-curse", name: "学术失语", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "科研视为0", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "paper-opening", name: "记忆残响", icon: "file-plus-2", tier: 0, column: "1", row: "1", maxLevel: 3, cost: 1, effect: "开局解锁论文卡片+1/级", prerequisiteIds: [] },
  { id: "knowledge-monetization", name: "以文谋生", icon: "coins", tier: 1, column: "2", row: "1", maxLevel: 2, cost: 1, effect: "科研提升→金币+2/级", prerequisiteIds: ["paper-opening"] },
  { id: "work-life-balance", name: "忍辱负重", icon: "heart-pulse", tier: 1, column: "2", row: "2", maxLevel: 2, cost: 1, effect: "科研提升→SAN+2/级", prerequisiteIds: ["learning-from-rejection"] },
  { id: "research-network", name: "正名之路", icon: "handshake", tier: 1, column: "2", row: "3", maxLevel: 1, cost: 3, effect: "科研提升→社交/好感+1", prerequisiteIds: ["papers-to-insight"] },
  { id: "research-wellness", name: "百折不挠", icon: "shield-plus", tier: 2, column: "3", row: "1", maxLevel: 1, cost: 3, effect: "转博后科研提升→SAN上限+1", prerequisiteIds: ["work-life-balance"] },
  { id: "reputation-growth", name: "导师力挺", icon: "heart-plus", tier: 2, column: "3", row: "2", maxLevel: 1, cost: 3, effect: "转博后科研提升→好感上限+1", prerequisiteIds: ["research-network"] },
  { id: "social-growth", name: "学界声援", icon: "users", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 3, effect: "转博后科研提升→社交上限+1", prerequisiteIds: ["research-network"] },
  { id: "break-research-curse", name: "拨云见日", icon: "sunrise", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 3, effect: "科研达到20时破除视为0诅咒，且科研不再受上限限制", prerequisiteIds: ["research-wellness", "reputation-growth", "social-growth"] },
  { id: "learning-from-rejection", name: "屡败屡研", icon: "rotate-ccw", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 3, effect: "转博前每篇一作论文首次被拒后，科研能力+1", prerequisiteIds: [] },
  { id: "papers-to-insight", name: "积稿成学", icon: "files", tier: 0, column: "1", row: "3", maxLevel: 1, cost: 3, effect: "转博时每篇一作论文，科研能力+1", prerequisiteIds: [] },
] as const satisfies readonly DesignedTalentNode[];

export const TEACHER_CHILD_REVERSED_TALENT_NODES = [
  { id: "favor-burden", name: "恩荫成枷", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "科研、社交视为减少导师好感上限，最低为0；导师好感上限最低为6", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "advisor-meeting-focus", name: "耳提面命", icon: "message-circle", tier: 0, column: "1", row: "1", maxLevel: 4, cost: 1, effect: "导师约谈事件出现概率+100%/级", prerequisiteIds: [] },
  { id: "favor-reset", name: "无限包容", icon: "rotate-ccw", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 2, effect: "导师好感低于0时上限-1，好感重置为上限", prerequisiteIds: [] },
  { id: "group-meeting-focus", name: "特别关注", icon: "presentation", tier: 0, column: "1", row: "3", maxLevel: 4, cost: 1, effect: "组会汇报事件出现概率+100%/级", prerequisiteIds: [] },
  { id: "reset-research", name: "歪打正着", icon: "brain", tier: 1, column: "2", row: "3", maxLevel: 1, cost: 2, effect: "导师好感重置时科研+1", prerequisiteIds: ["favor-reset"] },
  { id: "reset-social", name: "没大没小", icon: "users", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 2, effect: "导师好感重置时社交+1", prerequisiteIds: ["favor-reset"] },
  { id: "reset-coins", name: "伸手就有", icon: "coins", tier: 1, column: "2", row: "2", maxLevel: 2, cost: 1, effect: "导师好感重置时金币补充到2/级", prerequisiteIds: ["favor-reset"] },
  { id: "favor-reset-decrease", name: "得寸进尺", icon: "trending-up", tier: 3, column: "4", row: "2", maxLevel: 4, cost: 1, effect: "导师好感上限-1/级", prerequisiteIds: ["lower-favor-reset"] },
  { id: "lower-favor-reset", name: "恃宠而骄", icon: "heart-crack", tier: 2, column: "3", row: "2", maxLevel: 2, cost: 3, effect: "导师好感下降幅度+1/级", prerequisiteIds: ["reset-research", "reset-social", "reset-coins"] },
  { id: "reset-research-cap", name: "离经叛道", icon: "shield-plus", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 2, effect: "导师好感重置时科研上限+1", prerequisiteIds: ["reset-research"] },
  { id: "reset-social-cap", name: "横行无忌", icon: "heart-handshake", tier: 2, column: "3", row: "1", maxLevel: 1, cost: 2, effect: "导师好感重置时社交上限+1", prerequisiteIds: ["reset-social"] },
  { id: "end-of-grace", name: "恩断义绝", icon: "shield-plus", tier: 3, column: "4", row: "3", maxLevel: 2, cost: 3, effect: "导师好感上限下降幅度+1/级", prerequisiteIds: ["lower-favor-reset"] },
] as const satisfies readonly DesignedTalentNode[];

export const SOCIAL_REVERSED_TALENT_NODES = [
  { id: "social-stagnation", name: "患得患失", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "连续2个月社交未变化，下月初科研、导师好感随机-1", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "social-to-san", name: "人前春风", icon: "heart-handshake", tier: 0, column: "1", row: "1", maxLevel: 3, cost: 1, effect: "社交每提升1点，SAN+1/级", prerequisiteIds: [] },
  { id: "fellow-add-social", name: "呼朋引伴", icon: "users", tier: 0, column: "1", row: "2", maxLevel: 2, cost: 2, effect: "人际栏添加同学，社交+1/级", prerequisiteIds: [] },
  { id: "social-loss-coins", name: "人走茶凉", icon: "coins", tier: 1, column: "2", row: "1", maxLevel: 3, cost: 1, effect: "社交每降低1点，金币+1/级", prerequisiteIds: ["social-to-san"] },
  { id: "fellow-remove-social", name: "割席断交", icon: "heart-crack", tier: 1, column: "2", row: "2", maxLevel: 2, cost: 2, effect: "人际栏放弃同学，社交-1/级", prerequisiteIds: ["fellow-add-social"] },
  { id: "peer-event-focus", name: "暗中较劲", icon: "handshake", tier: 2, column: "3", row: "1", maxLevel: 4, cost: 2, effect: "同门合作事件出现概率+100%/级", prerequisiteIds: ["fellow-remove-social"] },
  { id: "junior-event-focus", name: "后生可畏", icon: "users", tier: 2, column: "3", row: "2", maxLevel: 4, cost: 2, effect: "指导师弟师妹事件出现概率+100%/级", prerequisiteIds: ["fellow-remove-social"] },
  { id: "senior-event-focus", name: "望其项背", icon: "presentation", tier: 2, column: "3", row: "3", maxLevel: 4, cost: 2, effect: "师兄师姐指导事件出现概率+100%/级", prerequisiteIds: ["fellow-remove-social"] },
  { id: "affinity-conversion", name: "过河拆桥", icon: "rotate-ccw", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 4, effect: "放弃同学时，每点默契依次转为导师好感、科研、SAN上限、好感上限、科研上限+1，循环分配", prerequisiteIds: ["peer-event-focus", "junior-event-focus", "senior-event-focus"] },
] as const satisfies readonly DesignedTalentNode[];

export const FRAIL_TALENT_NODES = [
  { id: "illness-surface", name: "病在腠理", icon: "skull", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 0, effect: "疾病倍率：+9%、+6%、+3%、+0%", prerequisiteIds: [], challenge: true },
  { id: "illness-skin", name: "病入肌肤", icon: "skull", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 0, effect: "疾病倍率：+18%、+12%、+6%、+0%", prerequisiteIds: [], challenge: true },
  { id: "illness-organs", name: "病入脏腑", icon: "skull", tier: 2, column: "3", row: "2", maxLevel: 1, cost: 0, effect: "疾病倍率：+27%、+18%、+9%、+0%", prerequisiteIds: [], challenge: true },
  { id: "illness-terminal", name: "病入膏肓", icon: "skull", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 0, effect: "疾病倍率：+36%、+24%、+12%、+0%", prerequisiteIds: [], challenge: true },
] as const satisfies readonly DesignedTalentNode[];

export const FADING_GENIUS_TALENT_NODES = [
  { id: "fading-genius-20", name: "初现遗忘", icon: "skull", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 0, effect: "初始科研20；每月科研-1", prerequisiteIds: [], challenge: true },
  { id: "fading-genius-17", name: "思绪渐乱", icon: "skull", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 0, effect: "初始科研17；每月科研-1", prerequisiteIds: [], challenge: true },
  { id: "fading-genius-14", name: "旧识渐失", icon: "skull", tier: 2, column: "3", row: "2", maxLevel: 1, cost: 0, effect: "初始科研14；每月科研-1", prerequisiteIds: [], challenge: true },
  { id: "fading-genius-11", name: "才思将尽", icon: "skull", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 0, effect: "初始科研11；每月科研-1", prerequisiteIds: [], challenge: true },
] as const satisfies readonly DesignedTalentNode[];

export const FINITE_LIFE_TALENT_NODES = [
  { id: "finite-life-400", name: "尚有时日", icon: "skull", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 0, effect: "总SAN 400；不可回复", prerequisiteIds: [], challenge: true },
  { id: "finite-life-300", name: "时日渐短", icon: "skull", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 0, effect: "总SAN 300；不可回复", prerequisiteIds: [], challenge: true },
  { id: "finite-life-200", name: "暮色渐深", icon: "skull", tier: 2, column: "3", row: "2", maxLevel: 1, cost: 0, effect: "总SAN 200；不可回复", prerequisiteIds: [], challenge: true },
  { id: "finite-life-100", name: "命悬一线", icon: "skull", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 0, effect: "总SAN 100；不可回复", prerequisiteIds: [], challenge: true },
] as const satisfies readonly DesignedTalentNode[];

export const DEBT_TALENT_NODES = [
  { id: "debt-60", name: "捉襟见肘", icon: "skull", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 0, effect: "初始债务60；月利率2%", prerequisiteIds: [], challenge: true },
  { id: "debt-80", name: "入不敷出", icon: "skull", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 0, effect: "初始债务80；月利率2%", prerequisiteIds: [], challenge: true },
  { id: "debt-100", name: "债台高筑", icon: "skull", tier: 2, column: "3", row: "2", maxLevel: 1, cost: 0, effect: "初始债务100；月利率2%", prerequisiteIds: [], challenge: true },
  { id: "debt-120", name: "泥足深陷", icon: "skull", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 0, effect: "初始债务120；月利率2%", prerequisiteIds: [], challenge: true },
] as const satisfies readonly DesignedTalentNode[];

const ROLE_TALENT_NODES = {
  "cursed-frail": FRAIL_TALENT_NODES,
  "special-fading-genius": FADING_GENIUS_TALENT_NODES,
  "special-finite-life": FINITE_LIFE_TALENT_NODES,
  "cursed-debt": DEBT_TALENT_NODES,
  "normal": NORMAL_TALENT_NODES,
  "rich": RICH_TALENT_NODES,
  "genius": GENIUS_TALENT_NODES,
  "teacher-child": TEACHER_CHILD_TALENT_NODES,
  "chosen": CHOSEN_TALENT_NODES,
  "chosen-reversed": CHOSEN_REVERSED_TALENT_NODES,
  "social": SOCIAL_TALENT_NODES,
  "normal-reversed": NORMAL_REVERSED_TALENT_NODES,
  "rich-reversed": RICH_REVERSED_TALENT_NODES,
  "genius-reversed": GENIUS_REVERSED_TALENT_NODES,
  "teacher-child-reversed": TEACHER_CHILD_REVERSED_TALENT_NODES,
  "social-reversed": SOCIAL_REVERSED_TALENT_NODES,
} as const;

export function getDesignedTalentNodes(roleId: RoleId): readonly DesignedTalentNode[] | null {
  return ROLE_TALENT_NODES[roleId as keyof typeof ROLE_TALENT_NODES] ?? null;
}

export function isRoleTalentImplemented(roleId: RoleId): boolean {
  return ["normal", "rich", "genius", "social", "teacher-child", "chosen",
    "normal-reversed", "rich-reversed", "genius-reversed", "social-reversed", "teacher-child-reversed", "chosen-reversed"].includes(roleId);
}

export function getTalentPointBalance(roleId: RoleId, level: number, allocation: Record<string, number>): number {
  const spent = getDesignedTalentNodes(roleId)?.reduce((sum, node) => sum + (allocation[node.id] ?? 0) * node.cost, 0) ?? 0;
  const validLevel = Number.isFinite(level) ? Math.min(MAX_ROLE_LEVEL, Math.max(0, Math.floor(level))) : 0;
  return Math.max(0, validLevel * ROLE_TALENT_POINTS_PER_LEVEL - spent);
}

export function getTalentUpgradeReason(roleId: RoleId, level: number, allocation: Record<string, number>, talentId: string): string | null {
  if (!isRoleTalentImplemented(roleId)) return "该角色天赋暂未开放";
  const nodes = getDesignedTalentNodes(roleId);
  const node = nodes?.find((entry) => entry.id === talentId);
  if (!node || node.fixed) return "不可加点";
  if ((allocation[node.id] ?? node.initialLevel ?? 0) >= node.maxLevel) return "已满级";
  if (node.challenge) return nodes!.some((entry) => entry.challenge && entry.id !== node.id && (allocation[entry.id] ?? 0) > 0) ? "只能选择一个档位" : null;
  if (node.prerequisiteIds.length > 0 && !node.prerequisiteIds.some((id) => (allocation[id] ?? 0) >= 1)) return "需要先点亮相邻前置天赋";
  if (getTalentPointBalance(roleId, level, allocation) < node.cost) return "天赋点不足";
  return null;
}

/** Treat stored and dispatched allocations as untrusted. Rebuild a valid tree within the real level budget. */
export function sanitizeRoleTalentAllocation(roleId: RoleId, level: number, raw: unknown): Record<string, number> {
  if (!isRoleTalentImplemented(roleId) || !raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const allocation: Record<string, number> = {};
  const nodes = [...(getDesignedTalentNodes(roleId) ?? [])].sort((a, b) => a.tier - b.tier);
  for (const node of nodes) {
    const requested = source[node.id];
    if (!Number.isSafeInteger(requested) || (requested as number) <= 0 || node.fixed) continue;
    for (let next = 0; next < Math.min(node.maxLevel, requested as number); next += 1) {
      if (getTalentUpgradeReason(roleId, level, allocation, node.id) !== null) break;
      allocation[node.id] = (allocation[node.id] ?? 0) + 1;
    }
  }
  return allocation;
}
