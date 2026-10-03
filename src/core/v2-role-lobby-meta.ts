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
  normal: "家里条件普通，读研没有什么捷径。和大多数人一样，你第一次走进实验室，满怀期待，也有些迷茫。录取通知书收进了抽屉，桌上的第一篇论文还没读懂。",
  genius: "从本科起，你就习惯了满分和赞许。入组时，导师特意把最难的课题留给了你。同门还在翻教材，你已经在论文页边写满了自己的想法。",
  social: "从校际活动到学术会议，你总能聊出几个新朋友。通讯录里有外校同学，也有远方的同行。出门参会，刚报出城市，就有人发来一句：“到了喊我，一起吃饭。”",
  rich: "家里谈生意时，你就在旁边听着长大。读研后，显卡和差旅费从不让你为难。同门还在等报销，你已经订好机票，顺手把酒店也升了一档。",
  "teacher-child": "你在家属院里长大，饭桌上常听大人聊职称和基金。如今坐进实验室，导师还是熟悉的长辈，只是饭桌上的“最近忙不忙”，变成了组会上的“论文写完没”。",
  chosen: "你成绩拔尖，也是校队主力，当过班委，在学生会和社团都忙得开。家里条件不错，老师喜欢你，同学也爱找你。毕业合照拍完，大家约好等你读研回来再聚。",
  rewinder: "你已无数次坐在这张工位前。有一世攒够了钱，有一世发出了好论文，却总有遗憾。录取通知书再次寄来，你拆开信封，在日历上圈出那场错过的相遇。",
  "research-captain": "你身边坐着天才、富家子弟和四处交友的同伴，谁也不太服谁。你拉着几人聊了一晚，各自的本事有了用处。组会上，几份看似无关的工作拼成了同一个课题。",
  "normal-reversed": "床铺在身后低声挽留，惰性的阴影缠住脚踝。你睡过了闹钟，也睡过了催稿消息。梦里那些无人问津的念头，醒来竟成了草稿上最漂亮的几行。",
  "genius-reversed": "你明明触碰过真理，世人却只听见沉默。署名被抹去，讲台被占据，连辩解都困在喉咙里。深夜翻开手稿，那些被否认的答案仍在纸上发光。",
  "social-reversed": "组会上，掌声又落到别人那里。你低头鼓掌，袖口的蛇影却越缠越紧。同门散去后，它伏在耳边，把那些没说出口的怨言一字字念给你听。",
  "rich-reversed": "家里留下的金库没有底，夜里总传来硬币碰撞的声音。你从梦中惊醒，昨晚熟记的公式已一片空白。枕边多了一枚金币，摸上去还带着体温。",
  "teacher-child-reversed": "从小替你挡风的庇护，如今变成了收紧的枷锁。每句夸奖都让锁链更沉，挨骂时反而能喘口气。导师办公室的门始终为你敞着，你站在门外，迟迟没有进去。",
  "chosen-reversed": "你总在梦里走进同一间实验室，醒来时，擅长的事又换了一样。昨夜读懂的论文重新变得陌生，随手写下的答案却从未学过。桌上的课表仍是你的名字。",
  "special-dandan": "你是一只可爱的抹茶色小鳄鱼，能变身切换形态。踩着滑板来学校，抱着枕头占工位，圆脑袋里装着几个研究点子。组会前，你默默切成了防御形态。",
  "special-daji": "你早就发现，学校里不缺聪明人，出众的容貌却少见。你偶尔回个笑脸，便有人抢着改稿、借算力、留署名。你收下这些好意，让几个人各自以为还有机会。",
  "special-finite-life": "你提前知道了生命的终点。每熬过一个长夜，身体里便有些东西悄悄散去，睡醒也不再回来。实验室的日历还在往后翻，你把那篇想写的论文挪到了待办最前面。",
  "special-fading-genius": "曾经一眼看懂的推导，如今要沿着笔记重走一遍。医生说，遗忘不会自行停下。你把每个想法写得格外仔细，怕明天的自己又认不出这些字。",
  "cursed-frail": "抽屉里药盒比零食多，组会请假条写得比摘要熟。换季时，同门收起外套，你又裹紧了一层。实验还在跑，你靠着椅背，等这阵头晕过去。",
  "cursed-debt": "父亲嗜赌欠下债务，母亲又患了重病。你带着助学贷款入学，补助还没到账，家里的催款电话已经打来。白天赶实验，晚上做兼职，书包里夹着论文和住院缴费单。",
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
  "special-finite-life": [],
  "special-fading-genius": [],
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
