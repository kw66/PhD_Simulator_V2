import { getActualSanChange } from "./v2-sanity-rules";
import { getShopRestSanGain } from "./v2-shop-items-effects";
import { createThreeStageRandomEvent, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { Buff, EventChoice, GameState, PendingEvent } from "./v2-types";

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
      "桌上的粥放凉了，电脑还停在刚打开的页面。你拉开椅子坐下，没过多久又站了起来。",
    ],
    decision: [
      "待办清单还开着，可你连第一条都没看完，肚子又疼了一阵。今天照常去工位，恐怕也坐不住；要把事情往后挪，又有些放心不下。",
      "买药要 1 金币，去医院要 3 金币；留在宿舍休息则要占用一次行动机会。",
    ],
    results: {
      hard: [
        "你还是去了实验室，想着先做一点。可隔一会儿就得往洗手间跑，回来时又得重新找刚才看到哪一行。",
        "熬到收拾东西时，桌上的水都没喝几口。身体没缓过来，接着做事也比平时吃力。",
      ],
      medicine: [
        "你去药店说明症状，买了药回宿舍，照着说明服用后躺了下来。手机放在枕边，待办清单暂时没再打开。",
        "到了傍晚，肚子安静了一些。你起身倒了杯温水，总算能坐着慢慢喝完。",
      ],
      hospital: [
        "你去了校医院，在候诊椅上弯着腰等叫号。轮到你时，医生问了饮食和症状，做了检查后安排治疗。",
        "临走前，你又确认了一遍用药和饮食注意事项。回到宿舍，把就诊单放在桌角，这才安心躺下。",
      ],
      rest: [
        "你给导师请了假，把今天的安排往后挪。水杯放到伸手能拿到的地方，电脑合上了。",
        "醒了喝点水，困了再睡一会儿。休息过后舒服了一些，只是清单上的事还留在那里，得等缓过来再做。",
      ],
    },
  },
  flu: {
    title: "流感来袭",
    intro: [
      "早上醒来，你的嗓子发紧，鼻子也堵得厉害。洗漱时喷嚏一个接一个，浑身酸痛，咳嗽迟迟停不下来。",
      "你在床边坐了好一会儿，书包就在脚边，伸手收拾都觉得累。桌上的纸巾很快就用了小半包。",
    ],
    decision: [
      "群里还在讨论今天的安排，你把回复打到一半，又放下手机咳了一阵。想按原计划做事，身体却不太配合；请假休息，手头的安排就得往后挪。",
      "宿舍里没有现成的药，买药要 2 金币，去医院要 4 金币；休息则要占用一次行动机会。",
    ],
    results: {
      hard: [
        "你戴上口罩去了实验室，想着处理一点就回去。撑到下午，却咳得停不下来，同一段文字来回看了几遍也没看进去。",
        "回去的路上，书包背着都嫌沉。鼻塞和乏力迟迟没缓解，之后做事也比平时更费力。",
      ],
      medicine: [
        "你去药店咨询后买了药，回宿舍照着说明服用，把今天的安排往后挪了挪。药盒和水杯就放在床边。",
        "症状没有立刻消失，你仍时不时抽张纸巾擦鼻子。等不适逐渐减轻，才有精神重新打开电脑。",
      ],
      hospital: [
        "你去医院做了检查，确认是流感后按医生的安排治疗。",
        "回去后，你按医嘱记好用药时间，把口罩和纸巾放在手边。原本准备带去工位的书包，今天没有再打开。",
      ],
      rest: [
        "你在群里请了假，把电脑合上。窗帘拉到一半，水杯和纸巾都放在枕边。",
        "醒了就喝水，困了又继续睡。晚上鼻塞和咳嗽轻了一些，你看了看还没做的事，决定等精神好些再说。",
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
      "你还惦记着今天的安排，回复消息时却连字都打错了几次。室友已经查好了就诊路线，在旁边等你回话。",
      "买药要 3 金币，去医院要 5 金币；留在宿舍休息也要占用一次行动机会。",
    ],
    results: {
      hard: [
        "你还是去了实验室，想做完一点再回来。没撑多久就开始发抖，同门停下手里的事来照看你，催你赶紧就医。",
        "你靠在椅背上，连收拾书包都费劲。桌上的东西还摊着，人已经无力继续，之后再做事也更容易疲惫。",
      ],
      medicine: [
        "你先去买了药，回宿舍休息。到了晚上体温仍有反复，室友不放心，守着你观察了一阵。",
        "你把电脑推到一边，记下几次测量的体温。床头的水换了几回，手头的安排已经顾不上了。",
      ],
      hospital: [
        "室友陪你赶到医院，帮你拿着挂号单。医生检查后安排了治疗和观察，你给导师发去请假的消息。",
        "这场病总算得到了及时处理。等候时你靠在椅背上，手机屏幕暗了下去，也没有再点开。",
      ],
      rest: [
        "你请假留在宿舍，把体温计和水放到床边。室友隔一阵就来看看你，也答应需要时陪你去医院。",
        "躺下后不用再勉强盯着屏幕，身体却仍不舒服。你记着体温的变化，未回的消息暂时搁在一旁。",
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
  const hospitalMoney = -(3 + severity);
  const restSanGain = getShopRestSanGain(state.shopState);
  const activeOperationSanMultiplier = illnessType === "stomach" ? 1.5 : illnessType === "flu" ? 2 : 2.5;
  const pendingBuffId = `illness-work-penalty-${illnessType}-${state.totalMonths}-${serial}`;
  const illnessBuff: Buff = {
    id: pendingBuffId,
    name: `SAN消耗 ×${activeOperationSanMultiplier}`,
    source: copy.title,
    timing: "monthly",
    remainingMonths: 1,
    activeOperationSanMultiplier,
    description: "硬撑时持续至本月结束；影响操作、事件及审稿压力的SAN消耗，不影响固定扣除与恢复",
  };
  const illnessBuffs = [...state.buffs.filter((buff) => buff.id !== pendingBuffId), illnessBuff];
  const medicineSan = getActualSanChange(-severity, state.month, state.eventSupport, illnessBuffs);
  const restSan = getActualSanChange(-(4 + severity * 2), state.month, state.eventSupport, illnessBuffs);

  const event: PendingEvent = {
    id: `illness-${illnessType}-y${state.year}-m${state.month}-n${serial}`,
    title: copy.title,
    description: copy.intro.join("\n\n"),
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: `illness-${illnessType}`,
    stage: "act1",
    pendingBuffs: [illnessBuff],
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
