import type { RoleAchievementDefinition, RoleId } from "./v2-types";

// Only user-confirmed additions. Display only; evaluation, rewards and statistics remain deferred.
export interface PreviewAchievement extends RoleAchievementDefinition {
  requiredRoleId: RoleId;
  previewOnly: true;
}

export const ROLE_DESIGNED_ACHIEVEMENTS: Partial<Record<RoleId, PreviewAchievement[]>> = {
  normal: [
    { id: "normal:self-reliance-i", icon: "🔬", title: "自强不息α", description: "硕士期间科研能力达到6" },
    { id: "normal:self-reliance-ii", icon: "🤝", title: "自强不息β", description: "硕士期间社交能力达到6" },
    { id: "normal:self-reliance-iii", icon: "🌟", title: "自强不息γ", description: "硕士期间导师好感达到6" },
    { id: "normal:breakthrough", icon: "🚀", title: "突破极限", description: "科研|社交|导师好感任一项达到25" },
    { id: "normal:second-action", icon: "⏱️", title: "二次行动", description: "某个月拥有2个普通行动点" },
    { id: "normal:burning-both", icon: "🔥", title: "走火入魔", description: "同时触发燃烧生命α、β" },
    { id: "normal:hyperactive", icon: "⚡", title: "我有多动症", description: "某个月行动4次（包括AI行动）" },
    { id: "normal:medical-miracle", icon: "🩺", title: "医学奇迹", description: "连续触发10次触底反弹" },
    { id: "normal:paper-lover", icon: "📚", title: "爱看论文", description: "看20次论文" },
    { id: "normal:hexagon-warrior", icon: "🏅", title: "六边形战士", description: "科研|社交|好感|金币均达到12" },
    { id: "normal:air-dried", icon: "🍂", title: "自然风干", description: "论文的3项分数随时间流逝均衰减至1" },
    { id: "normal:tasteless", icon: "📄", title: "食之无味", description: "一篇论文被连续拒稿3次" },
    { id: "normal:clear-minded", icon: "🧭", title: "人间清醒", description: "两次达到转博条件，但都拒绝了" },
    { id: "normal:truly-ordinary", icon: "🎓", title: "真·大多数", description: "使用0天赋点博士毕业" },
  ].map((achievement) => ({ ...achievement, rewardText: "", requiredRoleId: "normal", previewOnly: true })),
  genius: [
    { id: "genius:perfect-start", icon: "🎯", title: "百发百中", description: "前5次投稿全部命中" },
    { id: "genius:paper-machine", icon: "📚", title: "论文机器", description: "发表论文达到10篇" },
    { id: "genius:wisdom-god", icon: "🧠", title: "智慧之神", description: "科研能力达到20" },
    { id: "genius:thousand-citations", icon: "📈", title: "千引大佬", description: "总引用达到1000" },
    { id: "genius:model-student", icon: "🏅", title: "三好学生", description: "连续拿到3年奖学金" },
    { id: "genius:highbrow", icon: "🏔️", title: "曲高和寡", description: "第一篇一作论文就是A类" },
    { id: "genius:young-genius", icon: "🎓", title: "天才少年", description: "转博时就达到博士毕业要求" },
    { id: "genius:double-hit", icon: "🏹", title: "一箭双雕", description: "在一个会议同时中至少2篇论文" },
    { id: "genius:top-lab", icon: "🔬", title: "顶尖大组", description: "人际栏至少3个同学科研能力达到12" },
    { id: "genius:strongest-brain", icon: "🧠", title: "最强大脑", description: "科研能力上限达到30" },
  ].map((achievement) => ({ ...achievement, rewardText: "", requiredRoleId: "genius", previewOnly: true })),
  social: [
    { id: "social:lucky-review", icon: "🍀", title: "幸运儿", description: "论文分配到3个心软审稿人" },
    { id: "social:early-romance", icon: "💕", title: "我要早恋", description: "硕士时就恋爱" },
    { id: "social:perfect-rapport", icon: "🤝", title: "心有灵犀", description: "人际栏至少3个同学默契达到12" },
  ].map((achievement) => ({ ...achievement, rewardText: "", requiredRoleId: "social", previewOnly: true })),
  "teacher-child": [
    { id: "teacher-child:beloved-mentor", icon: "✉️", title: "吾爱吾师", description: "教师节连续赠送3次邮票" },
    { id: "teacher-child:steadfast-bond", icon: "🤝", title: "铁杆师生", description: "导师好感达到20" },
    { id: "teacher-child:perfect-workstation", icon: "🪑", title: "完美工位", description: "同时拥有椅子|咖啡机|键盘|显示器" },
    { id: "teacher-child:advanced-gpu", icon: "🖥️", title: "高级显卡", description: "拥有A6000及以上的显卡" },
  ].map((achievement) => ({ ...achievement, rewardText: "", requiredRoleId: "teacher-child", previewOnly: true })),
  rich: [
    { id: "rich:money-power", icon: "🪙", title: "金钱力量", description: "金之力累计消耗20金币", rewardText: "经验+5，解锁贪求·富可敌国角色" },
    { id: "rich:great-fortune", icon: "💰", title: "家财万贯", description: "拥有60金币" },
    { id: "rich:travel-kit", icon: "🛵", title: "出行套装", description: "同时拥有小电驴|羽绒服|遮阳伞" },
    { id: "rich:perfect-workstation", icon: "🪑", title: "完美工位", description: "同时拥有椅子|咖啡机|键盘|显示器" },
  ].map((achievement) => ({ ...achievement, rewardText: achievement.rewardText ?? "", requiredRoleId: "rich", previewOnly: true })),
  "normal-reversed": [
    { id: "normal-reversed:deep-sleep", icon: "😴", title: "睡得好香", description: "一局内通过主动休息累计回复50点SAN" },
    { id: "normal-reversed:badminton-prodigy", icon: "🏸", title: "羽球天才", description: "首次打羽毛球，未购买球拍就获胜" },
    { id: "normal-reversed:cycling-prodigy", icon: "🚴", title: "骑行天才", description: "骑车累计增加12点SAN上限" },
    { id: "normal-reversed:thick-health", icon: "❤️", title: "超厚血条", description: "SAN上限达到50" },
  ].map((achievement) => ({ ...achievement, rewardText: "", requiredRoleId: "normal-reversed", previewOnly: true })),
  "rich-reversed": [
    { id: "rich-reversed:sickly", icon: "🤒", title: "体弱多病", description: "生病3次" },
    { id: "rich-reversed:ultimate-gpu", icon: "🖥️", title: "顶级显卡", description: "拥有B300显卡" },
    { id: "rich-reversed:shopping-spree", icon: "🛍️", title: "为爱买单", description: "恋人购物进度条满3次" },
  ].map((achievement) => ({ ...achievement, rewardText: "", requiredRoleId: "rich-reversed", previewOnly: true })),
  "social-reversed": [
    { id: "social-reversed:junior-rescue", icon: "🙋‍♀️", title: "师妹救我", description: "人际栏集齐4个师妹" },
    { id: "social-reversed:balanced-company", icon: "⚖️", title: "均衡分布", description: "人际栏集齐师兄|师弟|师姐|师妹" },
    { id: "social-reversed:expanded-cohort", icon: "👥", title: "大扩招", description: "人际栏集齐4个同门" },
  ].map((achievement) => ({ ...achievement, rewardText: "", requiredRoleId: "social-reversed", previewOnly: true })),
  chosen: [
    { id: "chosen:hexagon-warrior", icon: "🏅", title: "六边形战士", description: "科研|社交|好感|金币均达到12" },
    { id: "chosen:unbalanced", icon: "📐", title: "严重偏科", description: "科研|社交|好感最高和最低的差距超过12" },
  ].map((achievement) => ({ ...achievement, rewardText: "", requiredRoleId: "chosen", previewOnly: true })),
};
