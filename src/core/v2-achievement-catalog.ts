import { isAchievementAvailableToRole } from "./v2-achievement-scope";
import type { AchievementScope, RoleAchievementDefinition, RoleId } from "./v2-types";

// Achievement definitions; evaluation and one-time ending rewards live in v2-achievement-runtime.
export interface CatalogAchievement extends RoleAchievementDefinition {
  scope: AchievementScope;
}

export function getRoleEndingAchievements(roleId: RoleId): CatalogAchievement[] {
  return [
    { ending: "master", title: "硕士毕业", icon: "🎓" },
    { ending: "phd", title: "博士毕业", icon: "🎓" },
  ].map(({ ending, title, icon }) => ({
    id: `${roleId}:ending-${ending}`, title, icon,
    description: `达成${title}结局`, rewardText: "经验倍率+1", scope: { roleIds: [roleId] },
  }));
}

export const ACHIEVEMENT_CATALOG: CatalogAchievement[] = [
  // 正位角色的逆位解锁路线
  { id: "unlock:genius-reversed", icon: "🪨", title: "大智若愚", description: "博士毕业，科研能力始终小于6", rewardText: "经验倍率+1，解锁愚钝·院士转世角色", unlocksRoleId: "genius-reversed", scope: { roleIds: ["genius"] } },
  { id: "unlock:teacher-child-reversed", icon: "🎭", title: "不假师恩", description: "博士毕业，导师好感始终小于6", rewardText: "经验倍率+1，解锁玩世·导师子女角色", unlocksRoleId: "teacher-child-reversed", scope: { roleIds: ["teacher-child"] } },
  { id: "unlock:social-reversed", icon: "🧍", title: "独来独往", description: "博士毕业，社交能力始终小于6", rewardText: "经验倍率+1，解锁嫉妒·社交达人角色", unlocksRoleId: "social-reversed", scope: { roleIds: ["social"] } },
  { id: "unlock:rich-reversed", icon: "🪙", title: "一毛不拔", description: "博士毕业，累计金币花费小于10", rewardText: "经验倍率+1，解锁贪求·富可敌国角色", unlocksRoleId: "rich-reversed", scope: { roleIds: ["rich"] } },
  { id: "unlock:chosen-reversed", icon: "🌤️", title: "从容不迫", description: "博士毕业，SAN始终高于12", rewardText: "经验倍率+1，解锁空想·天选之人角色", unlocksRoleId: "chosen-reversed", scope: { roleIds: ["chosen"] } },

  // 角色与类别限定
  { id: "normal:self-reliance-i", icon: "🔬", title: "笨鸟先飞", description: "硕士期间科研达6", rewardText: "经验+5", scope: { roleIds: ["normal"] } },
  { id: "normal:self-reliance-ii", icon: "🤝", title: "主动破冰", description: "硕士期间社交达6", rewardText: "经验+5", scope: { roleIds: ["normal"] } },
  { id: "normal:self-reliance-iii", icon: "🌟", title: "初获赏识", description: "硕士期间导师好感达6", rewardText: "经验+5", scope: { roleIds: ["normal"] } },
  { id: "normal:self-reliance", icon: "🌱", title: "自立自强", description: "硕士期间科研、社交、导师好感均达6", rewardText: "经验+5", scope: { roleIds: ["normal"] } },
  { id: "normal:truly-ordinary", icon: "🎓", title: "真·大多数", description: "使用0天赋点博士毕业", rewardText: "经验倍率+1", scope: { roleIds: ["normal"] } },
  { id: "normal-reversed:zero-talent-master", icon: "🎓", title: "绝地求生·怠惰", description: "使用0天赋点硕士毕业", rewardText: "经验倍率+1", scope: { roleIds: ["normal-reversed"] } },
  { id: "rich-reversed:zero-talent-master", icon: "🎓", title: "绝地求生·贪求", description: "使用0天赋点硕士毕业", rewardText: "经验倍率+1", scope: { roleIds: ["rich-reversed"] } },
  { id: "genius-reversed:zero-talent-master", icon: "🎓", title: "绝地求生·愚钝", description: "使用0天赋点硕士毕业", rewardText: "经验倍率+1", scope: { roleIds: ["genius-reversed"] } },
  { id: "social-reversed:zero-talent-master", icon: "🎓", title: "绝地求生·嫉妒", description: "使用0天赋点硕士毕业", rewardText: "经验倍率+1", scope: { roleIds: ["social-reversed"] } },
  { id: "teacher-child-reversed:zero-talent-master", icon: "🎓", title: "绝地求生·玩世", description: "使用0天赋点硕士毕业", rewardText: "经验倍率+1", scope: { roleIds: ["teacher-child-reversed"] } },
  { id: "chosen-reversed:zero-talent-master", icon: "🎓", title: "绝地求生·空想", description: "使用0天赋点硕士毕业", rewardText: "经验倍率+1", scope: { roleIds: ["chosen-reversed"] } },

  // 属性与成长
  { id: "upright:breakthrough-i", icon: "🚀", title: "突破极限Ⅰ", description: "科研|社交|好感任一项达25", rewardText: "经验+5", scope: { audiences: ["upright"] } },
  { id: "global:breakthrough-ii", icon: "🚀", title: "突破极限Ⅱ", description: "科研|社交|好感任一项达30", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "upright:wisdom-god-i", icon: "🧠", title: "智慧之神Ⅰ", description: "科研达15", rewardText: "经验+5", scope: { audiences: ["upright"] } },
  { id: "global:wisdom-god-ii", icon: "🧠", title: "智慧之神Ⅱ", description: "科研达20", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "upright:social-butterfly-i", icon: "🦋", title: "交际花Ⅰ", description: "社交达15", rewardText: "经验+5", scope: { audiences: ["upright"] } },
  { id: "global:social-butterfly-ii", icon: "🦋", title: "交际花Ⅱ", description: "社交达20", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "upright:steadfast-bond-i", icon: "🤝", title: "铁杆师生Ⅰ", description: "导师好感达15", rewardText: "经验+5", scope: { audiences: ["upright"] } },
  { id: "global:steadfast-bond-ii", icon: "🤝", title: "铁杆师生Ⅱ", description: "导师好感达20", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:hexagon-warrior-i", icon: "🏅", title: "六边形战士Ⅰ", description: "科研|社交|好感|金币均达12", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:hexagon-warrior-ii", icon: "🏅", title: "六边形战士Ⅱ", description: "科研|社交|好感|金币均达20", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:strongest-brain", icon: "🧠", title: "最强大脑", description: "科研能力上限达到30", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:unbalanced", icon: "📐", title: "严重偏科", description: "科研|社交|好感极差>12", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:overdrawn-life", icon: "🔥", title: "命悬一线", description: "生命上限不超过6", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:medical-miracle", icon: "🩺", title: "医学奇迹", description: "累计提升40点生命上限", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "upright:thick-health-i", icon: "❤️", title: "超厚血条Ⅰ", description: "SAN上限达到36", rewardText: "经验+5", scope: { audiences: ["upright"] } },
  { id: "global:thick-health-ii", icon: "❤️", title: "超厚血条Ⅱ", description: "SAN上限达到60", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "upright:great-fortune-i", icon: "💰", title: "家财万贯Ⅰ", description: "金币达到60", rewardText: "经验+5", scope: { audiences: ["upright"] } },
  { id: "global:great-fortune-ii", icon: "💰", title: "家财万贯Ⅱ", description: "金币达到200", rewardText: "经验+5", scope: { audiences: ["all"] } },

  // 学业与论文
  { id: "global:advisor-funding-user", icon: "💳", title: "经费大户", description: "硕士期间自身累计使用100导师经费", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:clear-minded", icon: "🧭", title: "人间清醒", description: "两次达到转博条件，但都拒绝了", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:young-genius", icon: "🎓", title: "天才少年", description: "转博时就达到博士毕业要求", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:three-a-master", icon: "📚", title: "三A在手", description: "硕士期间一作发表≥3篇A类论文", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:collaboration-ten", icon: "🤝", title: "协作共赢", description: "合作发表≥10篇论文", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:collaboration-before-first", icon: "🪜", title: "从协作到领衔", description: "先发合作论文，再发一作", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "genius-reversed:break-research-curse", icon: "🌅", title: "拨云见日", description: "实际破除学术失语诅咒", rewardText: "经验倍率+1", scope: { roleIds: ["genius-reversed"] } },
  { id: "global:excellent-master-thesis", icon: "📜", title: "优秀硕士论文", description: "硕士论文盲审全部获A", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:excellent-phd-thesis", icon: "📜", title: "优秀博士论文", description: "博士论文盲审全部获A", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:academic-star", icon: "🌟", title: "学术之星", description: "毕业时发表≥5篇A类论文", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:model-student", icon: "🏅", title: "三好学生", description: "连续拿到3年奖学金", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:paper-lover", icon: "📚", title: "爱看论文", description: "看20次论文", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:paper-machine", icon: "📚", title: "论文机器", description: "发表论文达到10篇", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:c-paper-king", icon: "📄", title: "灌水之王", description: "硕士期间发表5篇C类论文", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:highbrow", icon: "🏔️", title: "曲高和寡", description: "第一篇一作论文就是A类", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:best-paper", icon: "🏆", title: "最佳之作", description: "一作发表A类Best Paper", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:nature-child", icon: "🌿", title: "自然之子", description: "一作发表NMI", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:nature-summit", icon: "🏔️", title: "自然之巅", description: "一作发表Nature", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:future-academician", icon: "🔬", title: "未来院士", description: "发表≥2篇Nature", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:high-score-paper-i", icon: "💯", title: "高分论文Ⅰ", description: "论文非协作分达100", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:high-score-paper-ii", icon: "💯", title: "高分论文Ⅱ", description: "论文非协作分达150", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:nobel-beginning", icon: "🏅", title: "诺奖之始", description: "论文总分达1000", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:all-publicity", icon: "📣", title: "全网开花", description: "单篇一作完成全部宣传", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:perfect-start", icon: "🎯", title: "百发百中", description: "前5次投稿全部命中", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:double-hit", icon: "🏹", title: "一箭双雕", description: "在一个会议同时中至少2篇论文", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:author-six", icon: "👥", title: "群英荟萃", description: "单篇论文作者≥6人", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:thousand-citations", icon: "📈", title: "千引大佬", description: "总引用达到1000", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ten-thousand-citations", icon: "📈", title: "万引大佬", description: "总引用达到10000", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:cannot-be-buried", icon: "💎", title: "无法埋没", description: "单篇C类论文引用超过100", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:air-dried", icon: "🍂", title: "自然风干", description: "论文三项分数均随时间衰减至1", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:tasteless", icon: "📄", title: "食之无味", description: "一篇论文被连续拒稿3次", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:never-give-up", icon: "📨", title: "百折不挠", description: "论文累计拒稿10次", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:double-trouble", icon: "🌧️", title: "祸不单行", description: "同时遇到被抢发idea和新SOTA", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:lucky-review", icon: "🍀", title: "幸运儿", description: "论文分配到3个心软审稿人", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:back-from-the-brink", icon: "🌱", title: "起死回生", description: "三位大牛审稿人均给改进", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:turn-the-tide", icon: "🛟", title: "力挽狂澜", description: "审稿总分-1时被PC捞起录用", rewardText: "经验+5", scope: { audiences: ["all"] } },

  // 人际关系
  { id: "global:new-love-type", icon: "💞", title: "别样心动", description: "分手后交往另一类型恋人", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:joint-training", icon: "🌐", title: "另开眼界", description: "参加联培", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:three-internships", icon: "💼", title: "职场熟客", description: "完成3段实习", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:learn-to-refuse", icon: "🙅", title: "学会拒绝", description: "导师项目|审稿|毕设各拒绝1次", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:tea-break", icon: "☕", title: "我爱茶歇", description: "开会选择茶歇≥3次", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:funded-travel", icon: "🧳", title: "公费旅游", description: "开会选择旅游≥3次", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:valse-poster", icon: "🖼️", title: "顺便展出", description: "在VALSE做Poster展示", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:reported-scholarship", icon: "⚠️", title: "失之交臂", description: "被举报导致错失国奖", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:help-collector", icon: "💡", title: "博闻强记", description: "阅读全部小提示", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:event-burst", icon: "🎲", title: "事件爆发", description: "某个月同时出现≥6个事件", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:buff-god", icon: "✨", title: "Buff之神", description: "同一时刻拥有≥10种Buff", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:expanded-cohort", icon: "👥", title: "大扩招", description: "人际栏集齐4个同门", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:balanced-company", icon: "⚖️", title: "均衡分布", description: "人际栏集齐师兄|师弟|师姐|师妹", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:junior-rescue", icon: "🙋‍♀️", title: "师妹救我", description: "人际栏集齐4个师妹", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:top-lab", icon: "🔬", title: "顶尖大组", description: "3个同学科研均达12", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:perfect-rapport", icon: "🤝", title: "心有灵犀", description: "3个同学默契均达12", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:beloved-mentor", icon: "✉️", title: "吾爱吾师", description: "教师节连续赠送3次邮票", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:reverse-mentoring-i", icon: "👨‍🏫", title: "鞭策导师Ⅰ", description: "导师评上三级教授", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:reverse-mentoring-ii", icon: "👨‍🏫", title: "鞭策导师Ⅱ", description: "导师评上院士", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:horizontal-king", icon: "🤝", title: "横向之王", description: "完成10次横向项目", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:vertical-king", icon: "🔬", title: "纵向之王", description: "完成10次纵向项目", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:early-romance", icon: "💕", title: "我要早恋", description: "硕士时就恋爱", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:shopping-spree", icon: "🛍️", title: "为爱买单", description: "恋人购物进度条满3次", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:errand-runner", icon: "🏃", title: "被迫跑腿", description: "跑腿3次", rewardText: "经验+5", scope: { audiences: ["all"] } },

  // 商店与花销
  { id: "global:windfall", icon: "💸", title: "一夜暴富", description: "某个月收入达到100金币", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ultimate-gpu-i", icon: "🖥️", title: "顶级显卡Ⅰ", description: "拥有A6000及以上的显卡", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ultimate-gpu-ii", icon: "🖥️", title: "顶级显卡Ⅱ", description: "拥有B300显卡", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:full-gear", icon: "🎒", title: "整装待发", description: "集齐小电驴|遮阳伞|羽绒服", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ai-collaboration", icon: "🤖", title: "AI协作", description: "同时订阅3路AI，含GPT/Claude", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:perfect-workstation", icon: "🪑", title: "完美工位", description: "集齐椅子|咖啡机|键盘|显示器", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:travel-kit", icon: "🛵", title: "出行套装", description: "集齐小电驴|羽绒服|遮阳伞", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ultimate-coffee", icon: "☕", title: "绝世咖啡", description: "冰美式效果达到SAN+6", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:workaholic", icon: "💼", title: "打工狂人", description: "累计打工15次", rewardText: "经验+5", scope: { audiences: ["all"] } },

  // 行动与生活
  { id: "global:hyperactive-i", icon: "⏱️", title: "我有多动症Ⅰ", description: "单月行动≥3次（含AI）", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:hyperactive-ii", icon: "⚡", title: "我有多动症Ⅱ", description: "单月行动≥4次（含AI）", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:deep-sleep", icon: "😴", title: "睡得好香", description: "主动休息累计回复50SAN", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:cherish-life", icon: "🏥", title: "爱惜生命", description: "去医院3次", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:cycling-prodigy", icon: "🚴", title: "骑行天才", description: "骑车累计增加12点SAN上限", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:badminton-expert", icon: "🏸", title: "羽球高手", description: "首次打羽球未买球拍就获胜", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:stay-put", icon: "🏡", title: "偏安一隅", description: "拒绝过实习", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:card-god", icon: "🃏", title: "赌神转世", description: "打牌累计赚取10金币", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:shiny-bond", icon: "✨", title: "异色之缘", description: "洛克王国抓取3次异色", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:karaoke-king", icon: "🎤", title: "K歌之王", description: "唱过猪猪侠|迪迦|神兵小将", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:magic-tower", icon: "🏰", title: "穞堵臸猭畍", description: "玩魔塔3次", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:terraria", icon: "🌳", title: "300颗够吗", description: "玩泰拉瑞亚3次", rewardText: "经验+5", scope: { audiences: ["all"] } },

  // 其他结局
  { id: "global:career-start", icon: "🧭", title: "初入职场", description: "取得任意offer", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:career-internet", icon: "💻", title: "大厂上岸", description: "取得大厂算法岗及以上offer", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:career-state", icon: "🏢", title: "央企有我", description: "取得央企总部业务主管及以上offer", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:career-civil", icon: "🏛️", title: "金榜题名", description: "取得省直二级主任科员及以上offer", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:career-academic", icon: "🎓", title: "站上讲台", description: "取得211讲师及以上offer", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:career-apex-internet", icon: "👑", title: "登峰造极·大厂", description: "取得首席科学家offer", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:career-apex-state", icon: "🏢", title: "登峰造极·央企", description: "取得央企总部部门负责人offer", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:career-apex-civil", icon: "🏛️", title: "登峰造极·仕途", description: "取得中央部委四级调研员offer", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:career-apex-academic", icon: "🎓", title: "登峰造极·学界", description: "取得世界名校长聘教授offer", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ending-delay", icon: "📅", title: "延毕", description: "达成延毕结局", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ending-overthinking", icon: "🧠", title: "用脑过度", description: "达成用脑过度结局", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ending-burnout", icon: "😵", title: "不堪重负", description: "达成不堪重负结局", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ending-expelled", icon: "🚪", title: "逐出师门", description: "达成逐出师门结局", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ending-quit", icon: "🎒", title: "主动退学", description: "达成主动退学结局", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ending-poor", icon: "💸", title: "穷困潦倒", description: "达成穷困潦倒结局", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ending-lab-bankrupt", icon: "🏚️", title: "实验室破产", description: "达成实验室破产结局", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:ending-isolated", icon: "🧍", title: "被孤立", description: "达成被孤立结局", rewardText: "经验+5", scope: { audiences: ["all"] } },
  { id: "global:buff-collector", icon: "🧪", title: "Buff收集者", description: "跨局跨角色获得过所有Buff", rewardText: "天赋点+1", scope: { audiences: ["all"] } },
  { id: "global:product-collector", icon: "🛍️", title: "商品收集者", description: "跨局跨角色获得过所有商品", rewardText: "天赋点+1", scope: { audiences: ["all"] } },
  { id: "global:conference-collector", icon: "🏛️", title: "会议收集者", description: "跨局跨角色中过所有会议的论文", rewardText: "天赋点+1", scope: { audiences: ["all"] } },
  { id: "global:travel-collector", icon: "🧳", title: "旅行收集者", description: "跨局跨角色去过所有会议地点", rewardText: "天赋点+1", scope: { audiences: ["all"] } },
  { id: "global:direction-collector", icon: "🧭", title: "方向收集者", description: "跨局跨角色发表过所有研究方向的论文", rewardText: "天赋点+1", scope: { audiences: ["all"] } },
  { id: "global:conference-three-years", icon: "📅", title: "年年赴约", description: "连续3年发表同一个会议", rewardText: "经验+5", scope: { audiences: ["all"] } },
];

export function getDesignedAchievements(roleId: RoleId): CatalogAchievement[] {
  // Preserve curated gameplay order even when adjacent achievements have different audiences.
  return ACHIEVEMENT_CATALOG.filter(achievement => isAchievementAvailableToRole(achievement.scope, roleId));
}
