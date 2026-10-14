import type { RoleAchievementDefinition, RoleId } from "./v2-types";

// Only user-confirmed additions. Display only; evaluation, rewards and statistics remain deferred.
export interface PreviewAchievement extends RoleAchievementDefinition {
  requiredRoleId: RoleId;
  previewOnly: true;
}

export const ROLE_DESIGNED_ACHIEVEMENTS: Partial<Record<RoleId, PreviewAchievement[]>> = {
  normal: [
    { id: "normal:self-reliance-i", icon: "🔬", title: "自强不息Ⅰ", description: "硕士期间科研能力达到6" },
    { id: "normal:self-reliance-ii", icon: "🤝", title: "自强不息Ⅱ", description: "硕士期间社交能力达到6" },
    { id: "normal:self-reliance-iii", icon: "🌟", title: "自强不息Ⅲ", description: "硕士期间导师好感达到6" },
    { id: "normal:breakthrough", icon: "🚀", title: "突破极限", description: "科研|社交|导师好感任一项达到25" },
    { id: "normal:second-action", icon: "⏱️", title: "二次行动", description: "某个月拥有2个普通行动点" },
    { id: "normal:burning-both", icon: "🔥", title: "走火入魔", description: "同时触发燃烧生命α、β" },
    { id: "normal:hyperactive", icon: "⚡", title: "我有多动症", description: "某个月行动4次（包括AI行动）" },
    { id: "normal:medical-miracle", icon: "🩺", title: "医学奇迹", description: "连续触发10次触底反弹" },
    { id: "normal:paper-lover", icon: "📚", title: "爱看论文", description: "看20次论文" },
  ].map((achievement) => ({ ...achievement, rewardText: "", requiredRoleId: "normal", previewOnly: true })),
};
