import { createCustomFellowProgressProfile } from "./v2-fellow-progression";
import { tryAddRelationship } from "./v2-relationship-rules";
import {
  clamp,
  createFixedEvent,
  drawInclusiveInt,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

const MENTOR_ASSIGN_NAMES = ["小明", "小红", "小华", "小刚", "小丽", "小强", "小芳", "小伟", "小燕", "小杰", "小雪", "小龙"] as const;

function pickUniqueItems<T>(items: readonly T[], count: number, getRoll: RandomRollProvider): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const safeCount = Math.min(count, pool.length);

  while (picked.length < safeCount && pool.length > 0) {
    const index = Math.floor(clamp(0, getRoll(), 0.999999999999) * pool.length);
    picked.push(pool.splice(index, 1)[0] as T);
  }

  return picked;
}

function getMentorAssignHintText(candidate: { research: number; affinity: number }): string {
  if (candidate.research >= 5 && candidate.affinity >= 5) {
    return "学习快、沟通也顺，带起来会很省心";
  }
  if (candidate.research >= 5) {
    return "基础扎实，可能很快就能独立做事";
  }
  if (candidate.affinity >= 5) {
    return "很会来事，团队氛围可能更轻松";
  }
  if (candidate.research <= 2 && candidate.affinity <= 2) {
    return "起步略慢，前期需要投入更多精力";
  }
  return "中规中矩，适合稳扎稳打慢慢培养";
}

function createMentorAssignCandidates(getRoll: RandomRollProvider): NonNullable<FixedEventResolution["juniorCandidate"]>[] {
  return pickUniqueItems(MENTOR_ASSIGN_NAMES, 4, getRoll).map((name) => ({
    name,
    research: drawInclusiveInt(1, 6, getRoll),
    affinity: drawInclusiveInt(1, 6, getRoll),
  }));
}

function createMentorAssignChoiceEvent(
  state: GameState,
  candidates: NonNullable<FixedEventResolution["juniorCandidate"]>[],
): PendingEvent {
  return createFixedEvent({
    id: `mentor-assign-choice-y${state.year}-m${state.month}`,
    title: "指导新生 ➜ 如何抉择",
    description: "“这不是一次随手分配，而是在选未来几个月的协作搭档。”你会同时评估科研潜力与亲和程度，而不是只看某一项高分。选得合适，会形成正向循环；选得失衡，后续就会变成持续补位。",
    preview: "看看 4 位候选新生，再决定带谁",
    chainId: "mentor-assign",
    stage: "act2",
    choices: candidates.map((candidate, index) => ({
      id: `mentor-assign-candidate-${index}-y${state.year}-m${state.month}`,
      label: `选择${candidate.name}：${getMentorAssignHintText(candidate)}`,
      outcome: `你决定把 ${candidate.name} 作为这次带教对象。`,
      effects: {
        fixedEventResolution: {
          kind: "mentor-assign-candidate",
          juniorCandidate: candidate,
        },
      },
    })),
  });
}

function createMentorAssignResultEvent(
  state: GameState,
  candidate: NonNullable<FixedEventResolution["juniorCandidate"]>,
  added: boolean,
): PendingEvent {
  const levelText = candidate.research >= 5
    ? "科研起点较高，后续可能更快上手"
    : candidate.research <= 2
      ? "科研基础偏弱，前期需要你更多投入"
      : "科研基础中等，适合稳步培养";
  const relationText = candidate.affinity >= 5
    ? "相处起来比较顺畅，沟通阻力较小"
    : candidate.affinity <= 2
      ? "性格略生硬，磨合期可能会更长"
      : "亲和力中等，属于正常协作节奏";

  return createFixedEvent({
    id: `mentor-assign-result-${candidate.name}-y${state.year}-m${state.month}`,
    title: "指导新生 ➜ 如何抉择 ➜ 指派完成",
    description: `你最终选择了 ${candidate.name}。导师点头：“行，这位以后就跟你走流程、做训练。”你和对方简单打了招呼，一段新的师门协作关系从这里开始。${levelText}；${relationText}。${added ? `已加入关系网：${candidate.name}（科研 ${candidate.research}，亲和 ${candidate.affinity}）。` : `但当前关系槽位已满，这次没有把 ${candidate.name} 正式纳入关系网。`}`,
    preview: added ? `${candidate.name} 已加入你的关系网` : `${candidate.name} 本次未加入关系网`,
    chainId: "mentor-assign",
    stage: "result",
    choices: [
      {
        id: `mentor-assign-finish-${candidate.name}-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: added
          ? `${candidate.name} 加入了你的关系网。`
          : `${candidate.name} 这次没有加入你的关系网。`,
        effects: {},
      },
    ],
  });
}

export function createMentorAssignEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const candidates = createMentorAssignCandidates(getRoll);
  return createFixedEvent({
    id: "mentor-assign-junior",
    title: "指导新生",
    description: "导师把你叫到办公室，说新生需要你带一位入门。这不仅是额外工作，也是导师对你独立带人的考验。候选人背景不一，选得好会形成正向循环，选得差就可能持续补位。",
    preview: "导师让你带一位新入学同学",
    chainId: "mentor-assign",
    choices: [
      {
        id: `mentor-assign-open-y${state.year}-m${state.month}`,
        label: "看看候选人",
        outcome: "你准备认真比较这批候选人的科研潜力与相处成本。",
        effects: {
          enqueueEvents: [createMentorAssignChoiceEvent(state, candidates)],
        },
      },
    ],
  });
}

export function resolveMentorAssignCandidate(
  state: GameState,
  resolution: FixedEventResolution,
): FixedResolutionResult {
  const candidate = resolution.juniorCandidate;
  if (!candidate) {
    return {
      nextState: state,
      outcome: "这次没有成功确认要指导的新生对象。",
    };
  }

  const relationshipResult = tryAddRelationship(state.relationshipState, "junior");
  const nextState = relationshipResult.added
    ? {
      ...state,
      relationshipState: relationshipResult.nextState,
      fellowProgressState: [
        ...state.fellowProgressState,
        createCustomFellowProgressProfile({
          type: "junior",
          startTotalMonths: state.totalMonths,
          name: candidate.name,
          research: candidate.research,
          affinity: candidate.affinity,
        }),
      ],
    }
    : {
      ...state,
      relationshipState: relationshipResult.nextState,
    };

  return {
    nextState,
    outcome: relationshipResult.added
      ? `${candidate.name} 已加入你的关系网（科研 ${candidate.research}，亲和 ${candidate.affinity}）。`
      : `当前关系槽位已满，${candidate.name} 这次没有加入关系网。`,
    enqueueEvents: [createMentorAssignResultEvent(state, candidate, relationshipResult.added)],
  };
}
