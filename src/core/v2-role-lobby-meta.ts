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
    description: "使用大多数角色，科研|社交|好感|金币达到6",
    rewardText: "经验+5，解锁天选之人角色",
    unlocksRoleId: "chosen",
  },
  "normal-reversed": {
    id: "unlock:normal-reversed",
    icon: "😴",
    title: "渐生惰性",
    description: "使用大多数角色，获得人体工学椅",
    rewardText: "经验+5，解锁怠惰·大多数角色",
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
  "normal-reversed": "你只想向前走，却总听见床铺在身后低声挽留。惰性的阴影贴着你的脚踝，连时间都愿意替你停一会儿；可这份诅咒，也许正藏着另一种活法。",
  "genius-reversed": "那道本该照亮前路的光芒落到你身上，却像隔着一层看不见的雾。你明明触碰过真理，世人却只听见沉默；若能穿过这场失语，也许终会有人替你重新宣读姓名。",
  "social-reversed": "掌声落到别人那里，阴冷的蛇影便在你耳边长出细小的鳞片。你看得见每一段关系里最刺眼的裂缝，也听得见不甘心如何变成另一种力量。",
  "rich-reversed": "财富本该让人安心，你却继承了它背后的诅咒。每到月初，精神与能力都会被命运收走，只有金币在黑暗里留下回声。越接近一无所有，你越听得见那枚硬币召唤出的力量。",
  "teacher-child-reversed": "你本该站在庇护之下，却看见那把伞的影子正在反过来遮住自己。恩赐与审判只隔一线，血缘能替你打开门，也会在门后留下回声。",
  "chosen-reversed": "幸运在你这里拐了个弯，变成一座只在梦里出现的迷宫。你总能看见命运递来的门，却分不清哪一扇通往未来，哪一扇只是幻象留下的回光。",
  "special-dandan": "角色描述待补充。",
  "special-daji": "角色描述待补充。",
  "cursed-frail": "角色描述待补充。",
  "cursed-debt": "角色描述待补充。",
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
      description: "科研|社交|好感|金币达到6",
      rewardText: "经验+5，解锁天选之人角色",
    },
    {
      idSuffix: "chair-upgrade",
      icon: "😴",
      title: "渐生惰性",
      description: "获得人体工学椅",
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
  "special-dandan": [],
  "special-daji": [],
  "cursed-frail": [],
  "cursed-debt": [],
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
