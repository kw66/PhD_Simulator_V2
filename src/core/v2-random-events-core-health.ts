import { getActualSanChange } from "./v2-sanity-rules";
import { getShopRestSanGain } from "./v2-shop-items-effects";
import { createThreeStageRandomEvent, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";

export type IllnessType = "stomach" | "flu" | "fever";

const ILLNESS_INDEX: IllnessType[] = ["stomach", "flu", "fever"];
const ILLNESS_COPY: Record<IllnessType, {
  title: string;
  intro: string[];
  decision: string[];
  results: Record<"hard" | "medicine" | "hospital" | "rest", string[]>;
}> = {
  stomach: {
    title: "肚子虚弱",
    intro: [
      "早上起来，你的肚子就一阵阵不舒服，早餐只勉强吃了两口。刚坐到电脑前，又得起身往洗手间跑。",
      "组会和实验还排在日程里，可你现在连安稳坐一会儿都费劲。",
    ],
    decision: [
      "买药要 1 金币，去医院要 3 金币；留在宿舍休息则要占用一次行动机会。",
      "你还惦记着下午的实验，可肚子又疼了一阵。钱、时间和身体，总得先顾上一头。",
    ],
    results: {
      hard: [
        "你还是去了实验室，想着先把最急的实验跑完。可隔一会儿就得往洗手间跑，连核对日志都断断续续。",
        "当天的任务勉强做完了，身体却没缓过来。接下来的工作做起来更吃力，同门也劝你别再硬撑。",
      ],
      medicine: [
        "你去药店买了药，回宿舍躺下。下午的实验托同门帮忙看着，直到傍晚，肚子才安静了一些。",
        "身体还没有完全恢复，至少不用再不停往洗手间跑了。",
      ],
      hospital: [
        "你去了校医院，挂号后做了检查。",
        "医生根据检查结果安排了治疗，也交代了后续注意事项。折腾大半天，回去时你终于能踏实休息了。",
      ],
      rest: [
        "你给导师请了假，把手机调成静音。",
        "这一天除了喝水和睡觉，你什么也没干。",
        "第二天起床时舒服了一些，落下的任务只能之后慢慢补回来。",
      ],
    },
  },
  flu: {
    title: "流感来袭",
    intro: [
      "早上醒来，你的嗓子发紧，鼻子也堵得厉害。洗漱时喷嚏一个接一个，浑身酸痛，咳嗽迟迟停不下来。",
      "今天原本排了组会和实验，你却头昏乏力，连收拾东西都觉得累。",
    ],
    decision: [
      "宿舍里没有现成的药，买药要 2 金币，去医院要 4 金币；休息则要占用一次行动机会。",
      "群里还在讨论今天的安排，你却连消息都看得费劲。是先处理身体的不适，还是继续硬撑？",
    ],
    results: {
      hard: [
        "你戴上口罩去了实验室，想着把必须做的事处理完就走。撑到下午，却咳得停不下来，盯着屏幕也看不进东西。",
        "任务没做多少，人倒先累垮了。鼻塞和乏力迟迟没缓解，之后做事也比平时更费力。",
      ],
      medicine: [
        "你去药店咨询后买了药，把手头的事暂时交接出去。症状没有立刻消失，这几天还是得慢下来。",
        "等到不适逐渐减轻，你才重新打开实验记录，把中断的工作一点点接回来。",
      ],
      hospital: [
        "你去医院做了检查，确认是流感后按医生的安排治疗。",
        "同门替你看着正在跑的实验，你也不再惦记着赶回工位。眼下先照顾好身体，进度等恢复后再接着做。",
      ],
      rest: [
        "你在群里请了假，把电脑也合上了。",
        "一整天里，你醒了就喝水，困了又继续睡。",
        "晚上鼻塞和咳嗽轻了一些，只是落下的组会和实验还得之后补回来。",
      ],
    },
  },
  fever: {
    title: "高烧不退",
    intro: [
      "早上醒来，你浑身发烫，连下床都觉得腿软。体温计连续几次停在 39.5°C 左右，高烧始终没有退。",
      "室友看了眼温度，又看了眼你，催你不要再硬扛。",
    ],
    decision: [
      "买药要 3 金币，去医院要 5 金币；留在宿舍休息也要占用一次行动机会。",
      "你还想确认下午的实验安排，脑子却昏沉得连消息都回不清楚。室友催你先管身体，别再拿进度和自己较劲。",
    ],
    results: {
      hard: [
        "你还是去了实验室，想把关键步骤做完再回来。",
        "没撑多久，你就开始发抖，同门只好停下手里的事来照看你，催你赶紧就医。",
        "原本想保住的进度没有保住，身体还被拖得更疲惫。之后再做事，也远没有平时从容。",
      ],
      medicine: [
        "你先去买了药，回宿舍休息。到了晚上体温仍有反复，室友不放心，守着你观察了一阵。",
        "手头的安排已经顾不上了。省下一笔钱并没有让这场病轻松多少，你只能先停下工作。",
      ],
      hospital: [
        "室友陪你赶到医院，医生检查后安排了治疗和观察。你把实验交接好，不再急着回去工作。",
        "虽然多花了一笔钱，这场病总算得到了及时处理。接下来先休养，其他事都往后放。",
      ],
      rest: [
        "你请假留在宿舍，把实验交给同门照看。室友隔一阵就来看看你，也答应需要时陪你去医院。",
        "暂停工作让你能喘口气，却不代表病已经好了。未回的消息还在，但你暂时不打算逞强。",
      ],
    },
  },
};

function drawIllnessType(getRoll: RandomRollProvider): IllnessType {
  const index = Math.floor(Math.max(0, Math.min(0.999999999999, getRoll())) * ILLNESS_INDEX.length);
  return ILLNESS_INDEX[index] ?? "stomach";
}

export function createIllnessRandomEvent(
  state: GameState,
  getRoll: RandomRollProvider,
  illnessType: IllnessType = drawIllnessType(getRoll),
): PendingEvent {
  const serial = state.totalRandomEventCount;
  const copy = ILLNESS_COPY[illnessType];
  const severity = illnessType === "stomach" ? 0 : illnessType === "flu" ? 1 : 2;
  const hardCapDelta = -(1 + severity);
  const medicineMoney = -(1 + severity);
  const medicineSan = getActualSanChange(-severity, state.month, state.eventSupport);
  const hospitalMoney = -(3 + severity);
  const restSan = getActualSanChange(-(4 + severity * 2), state.month, state.eventSupport);
  const restSanGain = getShopRestSanGain(state.shopState);
  const activeOperationSanMultiplier = illnessType === "stomach" ? 1.5 : illnessType === "flu" ? 2 : 2.5;
  const pendingBuffId = `illness-work-penalty-${illnessType}-${state.totalMonths}-${serial}`;

  const event: PendingEvent = {
    id: `illness-${illnessType}-y${state.year}-m${state.month}-n${serial}`,
    title: copy.title,
    description: copy.intro.join("\n\n"),
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: `illness-${illnessType}`,
    stage: "act1",
    pendingBuffs: [{
      id: pendingBuffId,
      name: `主动操作 SAN ×${activeOperationSanMultiplier}`,
      source: copy.title,
      timing: "monthly",
      remainingMonths: 1,
      activeOperationSanMultiplier,
      description: "硬撑时持续至本月结束；作用于看论文、想 idea、写论文、做实验和人际主动操作",
    }],
    choices: [
      {
        id: `illness-${illnessType}-hard-${serial}`,
        label: "硬撑工作",
        outcome: `SAN 上限 ${hardCapDelta}｜生病概率 ×0.5`,
        effects: { sanCapDelta: hardCapDelta, illnessProbabilityMultiplier: 0.5 },
      },
      {
        id: `illness-${illnessType}-medicine-${serial}`,
        label: "先买药",
        outcome: `金币 ${medicineMoney}｜SAN ${medicineSan}｜SAN 上限 -${severity}｜生病概率 ×0.25`,
        effects: {
          money: medicineMoney,
          san: medicineSan,
          sanCapDelta: -severity,
          illnessProbabilityMultiplier: 0.25,
          removeBuffIds: [pendingBuffId],
        },
      },
      {
        id: `illness-${illnessType}-hospital-${serial}`,
        label: "去医院",
        outcome: `金币 ${hospitalMoney}｜生病概率 ×0`,
        effects: { money: hospitalMoney, illnessProbabilityMultiplier: 0, removeBuffIds: [pendingBuffId] },
      },
      {
        id: `illness-${illnessType}-rest-${serial}`,
        label: "休息",
        ...(state.actionState.used >= state.actionState.limit ? { disabledReason: "本月行动点已用尽，无法休息" } : {}),
        outcome: `SAN ${restSan}｜休息（SAN+${restSanGain}｜行动点-1）｜生病概率 ×0.5`,
        effects: { san: restSan, illnessProbabilityMultiplier: 0.5, restAction: true, removeBuffIds: [pendingBuffId] },
      },
    ],
  };

  const resultDescription = (choice: EventChoice): string => {
    const resultKey = choice.id.includes("hard")
      ? "hard"
      : choice.id.includes("medicine")
        ? "medicine"
        : choice.id.includes("hospital")
          ? "hospital"
          : "rest";
    return copy.results[resultKey].join("\n\n");
  };

  return createThreeStageRandomEvent(event, {
    introDescription: copy.intro.join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: copy.decision.join("\n\n"),
    results: Object.fromEntries(event.choices.map((choice) => [choice.id, { title: choice.label, description: resultDescription(choice) }])),
  });
}
