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
    rewardText: "经验+5×经验倍率，解锁富可敌国角色",
    unlocksRoleId: "rich",
  },
  genius: {
    id: "unlock:genius",
    icon: "🔬",
    title: "初窥门径",
    description: "使用大多数角色，科研能力达到12",
    rewardText: "经验+5×经验倍率，解锁院士转世角色",
    unlocksRoleId: "genius",
  },
  "teacher-child": {
    id: "unlock:teacher-child",
    icon: "🌟",
    title: "得到器重",
    description: "使用大多数角色，导师好感达到12",
    rewardText: "经验+5×经验倍率，解锁导师子女角色",
    unlocksRoleId: "teacher-child",
  },
  social: {
    id: "unlock:social",
    icon: "🤝",
    title: "人脉初成",
    description: "使用大多数角色，社交能力达到12",
    rewardText: "经验+5×经验倍率，解锁社交达人角色",
    unlocksRoleId: "social",
  },
  chosen: {
    id: "unlock:chosen",
    icon: "🏆",
    title: "全面发展",
    description: "使用大多数角色，科研|社交|好感|金币达到6",
    rewardText: "经验+5×经验倍率，解锁天选之人角色",
    unlocksRoleId: "chosen",
  },
  "normal-reversed": {
    id: "unlock:normal-reversed",
    icon: "😴",
    title: "渐生惰性",
    description: "使用大多数角色，获得人体工学椅",
    rewardText: "经验+5×经验倍率，解锁怠惰·大多数角色",
    unlocksRoleId: "normal-reversed",
  },
};

const ROLE_PROFILE_SUMMARIES: Record<RoleId, string> = {
  normal: "家里条件普通，读研没有什么捷径。组会前赶实验，月底算生活费，论文被拒就再改一版。接下来的日子，科研和生活都得由你自己安排。",
  genius: "从本科起就被老师寄予厚望，如今你带着这份期待进组。研究生阶段不认过去的奖状：点子能否落地、论文能否被录用，才是新的成绩单。",
  social: "你记得每个人的研究方向，也知道组会后该和谁多聊两句。合作机会和师门消息常从闲聊里冒出来，不过人情往来同样需要时间维护。",
  rich: "家里总谈起投资和理财，你也习惯盘算每笔开销的去处。钱能省下不少麻烦，却不能替你写论文；怎么花，仍会决定这段研究生生活怎么走。",
  "teacher-child": "你从小听惯了高校里的职称、项目和人情，进组后对导师话里的分寸格外在意。家庭背景是绕不开的话题，你更希望别人记住自己的研究。",
  chosen: "身边的人总说你什么都能做好。真正开始读研后，科研、社交和导师沟通却一起摆在面前；月底回头一看，可别只有待办清单变长了。",
  rewinder: "有些场景让你觉得似曾相识：选题、投稿，还有关键时刻伸出援手的人。熟悉感无法代替每一步选择，这段研究生生活仍得亲自走完。",
  "research-captain": "你喜欢把人和任务放到合适的位置：谁写代码，谁跑实验，谁去谈合作。组会前先把分工和截止日期说清楚，总比临时找数据更踏实。",
  "normal-reversed": "你不是不会做，只是总想等状态好一点再开始。待办越积越多，你常在“再歇一会儿”和“这次真得开工了”之间反复横跳。",
  "genius-reversed": "一提到科研，你就担心自己跟不上别人。看着工位上的稿子和没读完的论文，偶尔会怀疑今天算不算有所进展。",
  "social-reversed": "你对同门的进展格外敏感。嘴上说着“替你高兴”，回到工位却又忍不住打开实验记录，想看看自己有没有落下。",
  "rich-reversed": "你总忍不住盯着账户里的数字。每次花钱都像在做取舍，连该不该为研究添置设备，也会犹豫很久。",
  "teacher-child-reversed": "你熟悉导师的底线，也总忍不住去试探。每次谈话后都要回想自己有没有说过头，关系的分寸比想象中难拿捏。",
  "chosen-reversed": "你对未来有很多设想，却迟迟不知道从哪一项开始。月初列好科研、社交和生活计划，到月底又发现时间远不够用。",
};

const ROLE_ACHIEVEMENT_TEMPLATES: Record<RoleId, readonly RoleAchievementTemplate[]> = {
  normal: [
    {
      idSuffix: "first-pot",
      icon: "💰",
      title: "小有积蓄",
      description: "金币达到30",
      rewardText: "经验+5×经验倍率，解锁富可敌国角色",
    },
    {
      idSuffix: "research-start",
      icon: "🔬",
      title: "初窥门径",
      description: "科研能力达到12",
      rewardText: "经验+5×经验倍率，解锁院士转世角色",
    },
    {
      idSuffix: "favorite",
      icon: "🌟",
      title: "得到器重",
      description: "导师好感达到12",
      rewardText: "经验+5×经验倍率，解锁导师子女角色",
    },
    {
      idSuffix: "socialite",
      icon: "🤝",
      title: "人脉初成",
      description: "社交能力达到12",
      rewardText: "经验+5×经验倍率，解锁社交达人角色",
    },
    {
      idSuffix: "all-rounder",
      icon: "🏆",
      title: "全面发展",
      description: "科研|社交|好感|金币达到6",
      rewardText: "经验+5×经验倍率，解锁天选之人角色",
    },
    {
      idSuffix: "chair-upgrade",
      icon: "😴",
      title: "渐生惰性",
      description: "获得人体工学椅",
      rewardText: "经验+5×经验倍率，解锁怠惰·大多数角色",
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
