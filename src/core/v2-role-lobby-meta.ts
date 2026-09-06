import type {
  RoleAchievementDefinition,
  RoleId,
} from "./v2-types";

interface RoleAchievementTemplate {
  idSuffix: string;
  icon: string;
  title: string;
  description: string;
  rewardText?: string;
}

const ROLE_UNLOCK_DISPLAY_ACHIEVEMENTS: Partial<Record<RoleId, RoleAchievementDefinition>> = {
  rich: {
    id: "unlock:rich",
    icon: "💰",
    title: "小有积蓄",
    description: "使用大多数角色，金币达到30",
    rewardText: "经验+5，解锁富可敌国角色",
    unlocksRoleId: "rich",
  },
  genius: {
    id: "unlock:genius",
    icon: "🔬",
    title: "初窥门径",
    description: "使用大多数角色，科研能力达到12",
    rewardText: "经验+5，解锁院士转世角色",
    unlocksRoleId: "genius",
  },
  "teacher-child": {
    id: "unlock:teacher-child",
    icon: "🌟",
    title: "得到器重",
    description: "使用大多数角色，导师好感达到12",
    rewardText: "经验+5，解锁导师子女角色",
    unlocksRoleId: "teacher-child",
  },
  social: {
    id: "unlock:social",
    icon: "🤝",
    title: "人脉初成",
    description: "使用大多数角色，社交能力达到12",
    rewardText: "经验+5，解锁社交达人角色",
    unlocksRoleId: "social",
  },
  chosen: {
    id: "unlock:chosen",
    icon: "🏆",
    title: "全面发展",
    description: "使用大多数角色，科研、社交、好感、金币都达到6",
    rewardText: "经验+5，解锁天选之人角色",
    unlocksRoleId: "chosen",
  },
  "normal-reversed": {
    id: "unlock:normal-reversed",
    icon: "😴",
    title: "渐生惰性",
    description: "使用大多数角色，购买办公椅并升级为人体工学椅",
    rewardText: "经验+5，解锁怠惰·大多数角色",
    unlocksRoleId: "normal-reversed",
  },
};

const ROLE_PROFILE_SUMMARIES: Record<RoleId, string> = {
  normal: "家里条件普通，读研没有什么捷径。组会前赶实验，月底算生活费，论文被拒就再改一版。接下来的日子，科研和生活都得由你自己安排。",
  genius: "从本科起就是老师眼里的好苗子，读论文快，做实验也容易抓住关键。但研究生阶段不认过去的奖状：点子能否落地、论文能否被录用，才是新的成绩单。",
  social: "你记得每个人的研究方向，也知道组会后该和谁多聊两句。打听合作机会、会议信息和师门消息是你的拿手活，不过人情往来同样需要时间维护。",
  rich: "生活费和设备钱不用精打细算，遇到想做的方向也能多试几次。钱能省下不少麻烦，却不能替你写论文；怎么花，仍会决定这段研究生生活怎么走。",
  "teacher-child": "你从小听惯了高校里的职称、项目和人情，进组后很快就能读懂导师话里的分寸。熟悉规则是优势，也意味着每次成绩都容易被拿来和家庭背景一起议论。",
  chosen: "科研、社交和导师沟通，你起步时都不算吃力，手头也还宽裕。但样样都能做一点，反而让你难以决定先忙哪一件；月底回头一看，可别只有待办清单变长了。",
  rewinder: "你记得哪些选题会卡住、哪次投稿会被拒，也记得谁会在关键时候伸手。重新来过不等于自动成功，只是这一次，你能少交几笔昂贵的学费。",
  "research-captain": "你擅长把人和任务放到合适的位置：谁写代码，谁跑实验，谁去谈合作。你习惯先把分工和截止日期说清楚，免得到了组会前，才发现大家还在等同一份数据。",
  "normal-reversed": "你不是不会做，只是总想等状态好一点再开始。待办越积越多，赶工时 SAN 又掉得更快；你常在“再歇一会儿”和“这次真得开工了”之间反复横跳。",
  "genius-reversed": "你的科研能力始终是零，论文槽却一个不少。科研提升会转为金币、SAN、社交和好感；看着越来越满的钱包，再看看工位上的稿子，你也说不清今天算不算有所进展。",
  "social-reversed": "你对同门的进展格外敏感。社交下降会换来科研和导师好感提升；社交上升时，SAN 和金币也会增加。嘴上说着“替你高兴”，回到工位却又忍不住打开了实验记录。",
  "rich-reversed": "你只在意账户里的数字。每个月，SAN 和能力都会被压回最低点，损失则折算成金币；这不是轻松的富有，而是一场拿其他一切换钱的交易。",
  "teacher-child-reversed": "你熟悉导师的底线，也总忍不住去试探。关系闹僵后仍有机会回到桌前，甚至换来额外资源；这条路线靠的不是讨好，而是把分寸拿捏得足够准确。",
  "chosen-reversed": "每个月，科研、社交和好感都会重新洗牌，连 SAN 与金币也可能互换。月初你得先看看这回哪项属性派得上用场，再决定是赶论文、去社交，还是先缓一缓。",
};

const ROLE_ACHIEVEMENT_TEMPLATES: Record<RoleId, readonly RoleAchievementTemplate[]> = {
  normal: [
    {
      idSuffix: "first-pot",
      icon: "💰",
      title: "小有积蓄",
      description: "金币达到30",
      rewardText: "经验+5，解锁富可敌国角色",
    },
    {
      idSuffix: "research-start",
      icon: "🔬",
      title: "初窥门径",
      description: "科研能力达到12",
      rewardText: "经验+5，解锁院士转世角色",
    },
    {
      idSuffix: "favorite",
      icon: "🌟",
      title: "得到器重",
      description: "导师好感达到12",
      rewardText: "经验+5，解锁导师子女角色",
    },
    {
      idSuffix: "socialite",
      icon: "🤝",
      title: "人脉初成",
      description: "社交能力达到12",
      rewardText: "经验+5，解锁社交达人角色",
    },
    {
      idSuffix: "all-rounder",
      icon: "🏆",
      title: "全面发展",
      description: "科研、社交、好感、金币都达到6",
      rewardText: "经验+5，解锁天选之人角色",
    },
    {
      idSuffix: "chair-upgrade",
      icon: "😴",
      title: "渐生惰性",
      description: "购买办公椅并升级为人体工学椅",
      rewardText: "经验+5，解锁怠惰·大多数角色",
    },
  ],
  genius: [],
  social: [],
  rich: [],
  "teacher-child": [],
  chosen: [],
  rewinder: [],
  "research-captain": [],
  "normal-reversed": [],
  "genius-reversed": [],
  "social-reversed": [],
  "rich-reversed": [],
  "teacher-child-reversed": [],
  "chosen-reversed": [],
};

export function getRoleProfileSummary(roleId: RoleId): string {
  return ROLE_PROFILE_SUMMARIES[roleId];
}

export function getRoleAchievementDefinitions(roleId: RoleId): RoleAchievementDefinition[] {
  return ROLE_ACHIEVEMENT_TEMPLATES[roleId].map((template) => ({
    id: `${roleId}:${template.idSuffix}`,
    icon: template.icon,
    title: template.title,
    description: template.description,
    rewardText: template.rewardText,
  }));
}

export function getRoleLobbyAchievementDefinitions(roleId: RoleId): RoleAchievementDefinition[] {
  const unlockAchievement = ROLE_UNLOCK_DISPLAY_ACHIEVEMENTS[roleId];
  const roleAchievements = getRoleAchievementDefinitions(roleId);
  return unlockAchievement ? [unlockAchievement, ...roleAchievements] : roleAchievements;
}
