import { getAcceptedPaperScore } from "./v2-publication-rules";
import type { AchievementFlagId, AchievementFlags, CoffeeState, EventSupportState, Paper, ShopState } from "./v2-types";

export interface AchievementDefinition {
  id: AchievementFlagId;
  icon: string;
  name: string;
  description: string;
}

interface AchievementDerivedState {
  shopState: ShopState;
  coffeeState: CoffeeState;
  eventSupport: EventSupportState;
  papers: Paper[];
}

export function createAchievementFlags(): AchievementFlags {
  return {
    sickly: false,
    nearDeath: false,
    terraria300: false,
    magicTowerMaster: false,
    thankYouPlaying: false,
    badmintonAvoidedCold: false,
    badmintonChampion: false,
    pokerGod: false,
    ktvKing: false,
    narrowEscape: false,
    learnToSayNo: false,
    projectKing: false,
    loveMyTeacher: false,
    highScorePaper: false,
    advancedEquipment: false,
    cyclingMaster: false,
    fullGear: false,
  };
}

export function syncDerivedAchievementFlags(
  flags: AchievementFlags,
  state: AchievementDerivedState,
): AchievementFlags {
  const hasAnyEquipmentUpgrade = state.shopState.chairUpgrade !== null
    || state.shopState.monitorUpgrade !== null
    || state.shopState.bikeUpgrade !== null
    || state.coffeeState.machineUpgrade !== null;
  const hasFullGear = state.shopState.bikeUpgrade === "ebike"
    && state.eventSupport.hasParasol
    && state.eventSupport.hasDownJacket;
  const hasHighScorePaper = state.papers.some((paper) => paper.status === "published" && getAcceptedPaperScore(paper) >= 125 && paper.receivedRelationshipBonus !== true);

  return {
    ...flags,
    highScorePaper: flags.highScorePaper || hasHighScorePaper,
    advancedEquipment: flags.advancedEquipment || hasAnyEquipmentUpgrade,
    cyclingMaster: flags.cyclingMaster || state.shopState.bikeSanSpent >= 30,
    fullGear: flags.fullGear || hasFullGear,
  };
}


export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  { id: "sickly", icon: "🤧", name: "体弱多病", description: "感冒3次" },
  { id: "nearDeath", icon: "💀", name: "命悬一线", description: "SAN上限降到10以下" },
  { id: "terraria300", icon: "🌲", name: "300颗够吗", description: "玩泰拉瑞亚3次" },
  { id: "magicTowerMaster", icon: "🗼", name: "魔塔征服者", description: "玩魔塔50层3次" },
  { id: "thankYouPlaying", icon: "🎓", name: "感谢游玩", description: "玩研究生模拟器3次" },
  { id: "badmintonAvoidedCold", icon: "💪", name: "强身健体", description: "随机事件里选择打羽毛球后成功规避了感冒事件" },
  { id: "badmintonChampion", icon: "🏸", name: "羽球冠军", description: "在团建中打羽毛球时SAN>=20获得冠军1次" },
  { id: "pokerGod", icon: "🃏", name: "赌神转世", description: "在团建德州扑克中赢3次" },
  { id: "ktvKing", icon: "🎤", name: "K歌之王", description: "在团建中KTV唱歌3次" },
  { id: "narrowEscape", icon: "🎲", name: "躲过一劫", description: "数据丢失时没有正在进行的论文" },
  { id: "learnToSayNo", icon: "🙅", name: "学会拒绝", description: "拒绝过导师项目、审稿、指导本科生各1次" },
  { id: "projectKing", icon: "👔", name: "项目之王", description: "完成3次导师项目（横向或纵向）" },
  { id: "loveMyTeacher", icon: "📮", name: "吾爱吾师", description: "连续 3 年在教师节赠送邮票" },
  { id: "highScorePaper", icon: "📜", name: "高分论文", description: "论文分数达到125，且未从人脉关系角色获得分数加成" },
  { id: "advancedEquipment", icon: "🪑", name: "高级装备", description: "升级任意一件装备（工学椅、咖啡机、显示器、自行车等）" },
  { id: "cyclingMaster", icon: "🚴", name: "骑行大佬", description: "累计骑自行车减少30SAN" },
  { id: "fullGear", icon: "🎒", name: "整装待发", description: "同时拥有电动车（小电驴）+遮阳伞+羽绒服" },
];

export function getUnlockedAchievementDefinitions(flags: AchievementFlags): AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.filter((achievement) => flags[achievement.id] === true);
}

export function getUnlockedAchievementCount(flags: AchievementFlags): number {
  return getUnlockedAchievementDefinitions(flags).length;
}
