import { getActualSanChange } from "./v2-sanity-rules";
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
      "早上起来，你的肚子就一阵阵不舒服，早餐只吃了两口。",
      "刚坐到电脑前，你又急着往洗手间跑。",
      "组会和实验还排在日程里，可你现在连坐稳都费劲。",
    ],
    decision: [
      "你打开药店页面看了看，蒙脱石散要 1 金币；去医院挂号检查，至少要 3 金币。",
      "这点钱不是拿不出来，只是这个月本来就没剩多少，你还惦记着下午没跑完的实验。",
      "肚子又疼了一阵，你只好先决定今天怎么过。",
    ],
    results: {
      hard: [
        "你还是去了实验室，想着先把最急的实验跑完。",
        "中午开始，你隔一会儿就得往洗手间跑，同门看你脸色不对，劝了好几次。",
        "当天的进度勉强保住了，这场病却拖了下去，你最后还是连休了几天。",
      ],
      medicine: [
        "你下楼买了一盒蒙脱石散，回宿舍就着温水服下。",
        "下午的实验只好托同门帮忙看着，你躺到傍晚，肚子总算安静了一点。",
        "人还没完全恢复，至少不用再一直往洗手间跑了。",
      ],
      hospital: [
        "你去了校医院，挂号后做了检查。",
        "医生让你补液、清淡饮食，还把这几天该注意的事交代了一遍。",
        "折腾了大半天，回去时肚子终于没那么难受了。",
      ],
      rest: [
        "你给导师请了假，把手机调成静音。",
        "这一天除了喝水和睡觉，你什么也没干。",
        "第二天起床时舒服了一些，落下的任务只能再慢慢补。",
      ],
    },
  },
  flu: {
    title: "流感来袭",
    intro: [
      "早上醒来，你的嗓子发紧，鼻子也堵得厉害。",
      "洗漱时喷嚏一个接一个，浑身酸痛，咳嗽也停不下来。",
      "今天原本排了组会和实验，你却头昏乏力，连收拾东西都嫌累。",
    ],
    decision: [
      "宿舍抽屉里没有现成的药，临时去买磷酸奥司他韦要 2 金币，去医院则要 4 金币。",
      "你担心请假会打乱本周进度，又怕硬撑一天把流感拖得更久。",
      "群里的消息还在往上跳，你得先把今天安排明白。",
    ],
    results: {
      hard: [
        "你戴上口罩去了实验室，想着把必须做的事处理完就走。",
        "撑到下午时，你咳得停不下来，浑身酸痛，盯着屏幕半天也看不进去。",
        "回宿舍后，鼻塞和咳嗽一直没好，你只好连休了几天，原来的安排还是全停了。",
      ],
      medicine: [
        "你去药店买了磷酸奥司他韦，按说明服下第一剂。",
        "鼻塞没有立刻缓解，不过咳嗽、酸痛和乏力慢慢轻了一些。",
        "你在宿舍休息了几天，才把作息重新拉回来。",
      ],
      hospital: [
        "你去医院做了检查，确认是流感后按医生的安排治疗。",
        "治疗后，咳嗽和浑身酸痛逐渐缓了下来，同门也替你把实验关好。",
        "回去再睡一晚，你总算不用担心病情继续加重。",
      ],
      rest: [
        "你在群里请了假，把电脑也合上了。",
        "一整天里，你醒了就喝水，困了又继续睡。",
        "晚上鼻塞和咳嗽轻了一些，只是落下的组会和实验还得之后补上。",
      ],
    },
  },
  fever: {
    title: "高烧不退",
    intro: [
      "早上醒来，你浑身发烫，连下床都觉得腿软。",
      "体温计连续几次停在 39.5°C 左右，高烧一直没有退。",
      "室友看了眼温度，又看了眼你，催你别再硬扛。",
    ],
    decision: [
      "布洛芬要 3 金币，去医院检查和治疗则要 5 金币。",
      "你盯着下午的实验安排看了半天，脑子却昏沉得连消息都回不利索。",
      "室友已经准备帮你叫车，你得马上决定怎么办。",
    ],
    results: {
      hard: [
        "你还是去了实验室，想把关键步骤做完再回来。",
        "没撑多久，你就开始发抖，同门只好停下手里的事把你送回宿舍。",
        "这场高烧让你连休了几天，原本想保住的进度也没能保住。",
      ],
      medicine: [
        "你先买了布洛芬，回宿舍服下后躺下。",
        "体温降得很慢，到了晚上仍然反复，你连饭都没怎么吃。",
        "第二天勉强能下床时，手头的安排已经乱成一团。",
      ],
      hospital: [
        "室友陪你赶到医院，医生很快安排了检查和输液。",
        "观察了一阵后，体温终于慢慢降了下来。",
        "虽然花了更多钱，这一晚至少睡得安稳了。",
      ],
      rest: [
        "你直接请假留在宿舍，把手机放到够不着的地方。",
        "一天过去，高烧还没完全退，你只能继续躺着补水休息。",
        "实验和消息堆了不少，但眼下也只能等身体慢慢恢复。",
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
  const hardCapDelta = -(2 + severity);
  const medicineMoney = -(1 + severity);
  const medicineSan = getActualSanChange(-severity, state.month, state.eventSupport);
  const hospitalMoney = -(3 + severity);
  const restSan = getActualSanChange(-(6 + severity * 2), state.month, state.eventSupport);
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
      remainingMonths: null,
      activeOperationSanMultiplier,
      description: "处理该疾病事件后消失；作用于看论文、想 idea、写论文、做实验和人际主动操作",
    }],
    removeBuffIdsOnCompletion: [pendingBuffId],
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
        effects: { money: medicineMoney, san: medicineSan, sanCapDelta: -severity, illnessProbabilityMultiplier: 0.25 },
      },
      {
        id: `illness-${illnessType}-hospital-${serial}`,
        label: "去医院",
        outcome: `金币 ${hospitalMoney}｜生病概率 ×0`,
        effects: { money: hospitalMoney, illnessProbabilityMultiplier: 0 },
      },
      {
        id: `illness-${illnessType}-rest-${serial}`,
        label: "休息一天",
        outcome: `SAN ${restSan}｜生病概率 ×0.5`,
        effects: { san: restSan, illnessProbabilityMultiplier: 0.5 },
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
