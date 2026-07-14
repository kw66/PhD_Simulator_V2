import type {
  GameState,
  RoleAchievementDefinition,
  RoleAchievementMetricId,
  RoleAchievementProgressSnapshot,
  RoleId,
} from "./v2-types";

type RoleAchievementProgressMode = "best-single" | "cumulative";

interface RoleAchievementMetricTemplate {
  id: RoleAchievementMetricId;
  label: string;
  target: number;
}

interface RoleAchievementTemplate {
  idSuffix: string;
  title: string;
  description: string;
  rewardText?: string;
  milestone?: RoleAchievementDefinition["milestone"];
  progressMode?: RoleAchievementProgressMode;
  progressMetrics?: readonly RoleAchievementMetricTemplate[];
}

const ROLE_PROFILE_SUMMARIES: Record<RoleId, string> = {
  normal: "从小镇一路做题做到这里，身后是父母省吃俭用攒出的学费，身前是没人兜底的未来。没有耀眼的天赋，也不敢轻易停下，只能把组会、熬夜和论文一寸寸熬成往上走的台阶。",
  genius: "一路都是尖子生，奖状、保研和夸赞来得比别人更早。可真坐到课题和投稿面前，天赋只够换来更高的期待，能不能把灵光变成成果，才决定名字会不会被记住。",
  social: "课题组里接得住话，饭桌上也找得到位置，会场和人情场都知道该往哪里站。读研这条路从来不只靠埋头苦熬，很多门不是撞开的，而是靠一次次体面周全地敲开的。",
  rich: "不用在房租、差旅和设备上反复算账，连试错都比别人从容几分。别人得咬着牙争来的余地，这里从一开始就握在手里；真正难的，是别把宽裕活成浪费。",
  "teacher-child": "比别人更早听懂师门里的弦外之音，也更早看清规则背后的人情冷暖。靠近中心从来不等于轻松，只是连犯错都比旁人更显眼，连沉默都得更有分寸。",
  chosen: "履历漂亮，路也走得顺，像总能在最关键的时候接住一点偏爱。可越是样样都拿得起来，越不能把顺利当成理所当然，真正考验的是在每个阶段都把力气压到最该压的地方。",
  rewinder: "选题、投稿、转博、毕业，像是一条已经走过太多次的时间线。别人还在岔路口押运气，轮回者却像站在结果之后回望过程，知道哪一步会崩，哪一步会成，连命运都只能按他看过的轨迹再演一遍。",
  "research-captain": "课题、人心、资源、节奏，在统御者眼里从来不是彼此分开的碎片。别人还在规则里抢位置，他已经站到规则外重新编排整张棋盘，让谁出手、让谁沉默、让哪篇成果先落地，都像某种更高的秩序在悄悄降临。",
  "normal-reversed": "组会、选题、人情、挣钱，样样都能上手，普通人得慢慢补的短板这里一开始就补齐了。只是精力烧得比谁都快，整盘都能扛起来的代价，就是每往前推一步都像在透支自己。",
  "genius-reversed": "除了科研，别的都像被命运补偿到了近乎过分的地步。论文位一格不空，人情、精力和资源越滚越高，唯独科研像被诅咒一样死死钉在零上；越碰不到成果，越能把别处的回报榨到极致。",
  "social-reversed": "最会来事的人，当然也最会拿人情做燃料。社交不是用来维持体面的，而是拆开来烧的；每一次拉扯、比较和不甘，最后都会换成更硬的成果、更高的好感，或者继续往前顶的底气。",
  "rich-reversed": "别的东西全会掉回谷底又如何，只要钱还在涨，这局就还远远没输。精力、能力和体面，每个月都在被强行折现，正因为失去得够狠，账上的数字才滚得比谁都夸张。",
  "teacher-child-reversed": "最厉害的不是讨喜欢，而是敢把关系一路玩到最险的边上。好感不会真正断掉，闹到最僵也总能被重新拉回桌边；别人怕翻脸，这条路偏要拿翻脸当推进。",
  "chosen-reversed": "选题、关系、成果、情绪，连命运本身都在不断换位，没有哪张牌会老老实实待在原处。可越是这样，越能从乱局里摸到别人根本碰不到的上限；稳定只是安慰，失序才是武器。",
};

const ROLE_ACHIEVEMENT_TEMPLATES: Record<RoleId, readonly RoleAchievementTemplate[]> = {
  normal: [
    {
      idSuffix: "first-pot",
      title: "小有积蓄",
      description: "金币达到30",
      rewardText: "经验+5，解锁富可敌国角色",
      progressMode: "best-single",
      progressMetrics: [{ id: "money", label: "金币", target: 30 }],
    },
    {
      idSuffix: "research-start",
      title: "初窥门径",
      description: "科研能力达到12",
      rewardText: "经验+5，解锁院士转世角色",
      progressMode: "best-single",
      progressMetrics: [{ id: "research", label: "科研", target: 12 }],
    },
    {
      idSuffix: "favorite",
      title: "得到器重",
      description: "导师好感达到12",
      rewardText: "经验+5，解锁导师子女角色",
      progressMode: "best-single",
      progressMetrics: [{ id: "favor", label: "好感", target: 12 }],
    },
    {
      idSuffix: "socialite",
      title: "人脉初成",
      description: "社交能力达到12",
      rewardText: "经验+5，解锁社交达人角色",
      progressMode: "best-single",
      progressMetrics: [{ id: "social", label: "社交", target: 12 }],
    },
    {
      idSuffix: "all-rounder",
      title: "全面发展",
      description: "科研、社交、好感、金币都达到6",
      rewardText: "经验+5，解锁天选之人角色",
      progressMode: "best-single",
      progressMetrics: [
        { id: "research", label: "科研", target: 6 },
        { id: "social", label: "社交", target: 6 },
        { id: "favor", label: "好感", target: 6 },
        { id: "money", label: "金币", target: 6 },
      ],
    },
    {
      idSuffix: "chair-upgrade",
      title: "渐生惰性",
      description: "购买办公椅并升级为人体工学椅",
      rewardText: "经验+5，解锁怠惰·大多数角色",
      progressMode: "best-single",
      progressMetrics: [
        { id: "chair-owned", label: "办公椅", target: 1 },
        { id: "chair-advanced", label: "工学椅", target: 1 },
      ],
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
    title: template.title,
    description: template.description,
    rewardText: template.rewardText,
    milestone: template.milestone,
  }));
}

function getRoleAchievementTemplateByDefinitionId(roleId: RoleId, definitionId: string): RoleAchievementTemplate | null {
  return ROLE_ACHIEVEMENT_TEMPLATES[roleId].find((template) => `${roleId}:${template.idSuffix}` === definitionId) ?? null;
}

function getSnapshotMetricValue(
  snapshot: RoleAchievementProgressSnapshot | undefined,
  metricId: RoleAchievementMetricId,
): number {
  return Math.max(0, Math.floor(snapshot?.values[metricId] ?? 0));
}

function buildSnapshotScore(
  template: RoleAchievementTemplate,
  snapshot: RoleAchievementProgressSnapshot | undefined,
): number {
  if (!template.progressMetrics?.length || !snapshot) {
    return 0;
  }

  return template.progressMetrics.reduce((score, metric) => (
    score + Math.min(getSnapshotMetricValue(snapshot, metric.id) / metric.target, 1)
  ), 0);
}

function readMetricValueFromFinishedRun(
  metricId: RoleAchievementMetricId,
  state: Pick<GameState, "player" | "shopState">,
  nextCompletedRuns: number,
): number {
  switch (metricId) {
    case "completed-runs":
      return nextCompletedRuns;
    case "chair-owned":
      return state.shopState.chairOwned ? 1 : 0;
    case "chair-advanced":
      return state.shopState.chairUpgrade === "advanced" ? 1 : 0;
  }

  return Math.max(0, Math.floor(state.player[metricId]));
}

export function buildRoleAchievementProgressSnapshotFromFinishedRun(
  roleId: RoleId,
  definitionId: string,
  state: Pick<GameState, "player" | "shopState">,
  nextCompletedRuns: number,
): RoleAchievementProgressSnapshot | null {
  const template = getRoleAchievementTemplateByDefinitionId(roleId, definitionId);
  if (!template?.progressMetrics?.length) {
    return null;
  }

  return {
    values: Object.fromEntries(
      template.progressMetrics.map((metric) => [
        metric.id,
        readMetricValueFromFinishedRun(metric.id, state, nextCompletedRuns),
      ]),
    ) as RoleAchievementProgressSnapshot["values"],
  };
}

export function mergeRoleAchievementProgressSnapshot(
  roleId: RoleId,
  definitionId: string,
  current: RoleAchievementProgressSnapshot | undefined,
  next: RoleAchievementProgressSnapshot | null,
): RoleAchievementProgressSnapshot | undefined {
  if (!next) {
    return current;
  }

  const template = getRoleAchievementTemplateByDefinitionId(roleId, definitionId);
  if (!template?.progressMetrics?.length) {
    return current;
  }

  if (!current) {
    return next;
  }

  if (template.progressMode === "best-single" && template.progressMetrics.length > 1) {
    return buildSnapshotScore(template, next) >= buildSnapshotScore(template, current) ? next : current;
  }

  return {
    values: Object.fromEntries(
      template.progressMetrics.map((metric) => [
        metric.id,
        Math.max(getSnapshotMetricValue(current, metric.id), getSnapshotMetricValue(next, metric.id)),
      ]),
    ) as RoleAchievementProgressSnapshot["values"],
  };
}

export function isRoleAchievementUnlockedFromSnapshot(
  roleId: RoleId,
  definitionId: string,
  snapshot: RoleAchievementProgressSnapshot | undefined,
): boolean {
  const template = getRoleAchievementTemplateByDefinitionId(roleId, definitionId);
  if (!template?.progressMetrics?.length) {
    return false;
  }

  return template.progressMetrics.every((metric) => getSnapshotMetricValue(snapshot, metric.id) >= metric.target);
}

export function buildRoleAchievementProgressLines(
  roleId: RoleId,
  definitionId: string,
  snapshot: RoleAchievementProgressSnapshot | undefined,
): string[] {
  const template = getRoleAchievementTemplateByDefinitionId(roleId, definitionId);
  if (!template?.progressMetrics?.length) {
    return [];
  }

  const progressSegments = template.progressMetrics.map((metric) => (
    `${metric.label} ${getSnapshotMetricValue(snapshot, metric.id)}/${metric.target}`
  ));

  if (template.progressMode === "cumulative" && progressSegments.length === 1) {
    const metric = template.progressMetrics[0];
    return [`累计 ${getSnapshotMetricValue(snapshot, metric.id)} / ${metric.target}`];
  }

  if (progressSegments.length === 1) {
    const metric = template.progressMetrics[0];
    return [`历史最高 ${getSnapshotMetricValue(snapshot, metric.id)} / ${metric.target}`];
  }

  return [`最佳单局：${progressSegments.join(" · ")}`];
}

export function isRoleAchievementUnlockedFromFinishedRun(
  definition: RoleAchievementDefinition,
  state: Pick<GameState, "ending" | "achievementFlags">,
): boolean {
  if (!definition.milestone) {
    return false;
  }

  switch (definition.milestone) {
    case "graduate":
      return state.ending === "master" || state.ending === "phd";
    case "phd":
      return state.ending === "phd";
    case "phd-with-global-achievements":
      return false;
  }
}
