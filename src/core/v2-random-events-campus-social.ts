import { getAttributeTier } from "./v2-random-event-rules";
import { getBadmintonWinRate, getPokerWinRate } from "./v2-growth-system";
import {
  createThreeStageRandomEvent,
  formatProbabilityCondition,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import { applyTierResist, formatTierResistedOutcome, getTierResistedNarrative } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

export function createSocialCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const winRate = getBadmintonWinRate(
    state.eventCounters.badmintonCount,
    state.eventSupport.hasBadmintonRacket,
  ) / 100;
  const badmintonChampion = getRoll() < winRate;

  const pokerStake = Math.max(0, Math.min(state.player.money, 5));
  const pokerWinRate = getPokerWinRate(state.eventCounters.pokerCount) / 100;
  const pokerWin = getRoll() < pokerWinRate;

  const ktvSocialResult = applyTierResist(1, state.player.social, getRoll);
  const ktvSocialGain = ktvSocialResult.effectiveChange;
  const ktvSocialNarrative = getTierResistedNarrative("社交", 1, ktvSocialResult);

  const dinnerAdvisorTreat = getRoll() >= 0.5;
  const dinnerFavorResult = dinnerAdvisorTreat ? applyTierResist(1, state.player.favor, getRoll) : null;
  const dinnerFavorGain = dinnerFavorResult?.effectiveChange ?? 0;
  const dinnerFavorNarrative = dinnerFavorResult
    ? getTierResistedNarrative("导师好感", 1, dinnerFavorResult)
    : "";

  const event: PendingEvent = {
    id: `random-7-y${state.year}-m${state.month}-n${serial}`,
    title: "组内团建",
    description: "导师难得组织了一次团建，群里终于不只是在催论文和项目。活动有好几种，你准备跟大家去做什么？",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-7",
    stage: "act1",
    choices: [
      {
        id: `random-7-badminton-${serial}`,
        label: "打羽毛球",
        outcome: badmintonChampion
          ? `获胜（胜率 ${Math.round(winRate * 100)}%）｜生病概率 -10%｜羽毛球参加次数 +1${state.eventSupport.hasStrongBodyTalent ? "" : "｜首次获胜获得强身健体"}`
          : `落败（胜率 ${Math.round(winRate * 100)}%）｜生病概率 -10%｜羽毛球参加次数 +1`,
        effects: {
          illnessProbabilityDelta: -10,
          counterDeltas: { badmintonCount: 1 },
          eventSupportUpdates: badmintonChampion && !state.eventSupport.hasStrongBodyTalent ? { hasStrongBodyTalent: true } : {},
        },
      },
      {
        id: `random-7-poker-${serial}`,
        label: "打德州扑克",
        outcome: pokerStake === 0
          ? (pokerWin ? `无本金，纯游戏获胜（胜率 ${Math.round(pokerWinRate * 100)}%）｜德州扑克参加次数 +1` : `无本金，纯游戏落败（胜率 ${Math.round(pokerWinRate * 100)}%）｜德州扑克参加次数 +1`)
          : pokerWin ? `押注 ${pokerStake} 金币；获胜（胜率 ${Math.round(pokerWinRate * 100)}%）｜金币 +${pokerStake}｜德州扑克参加次数 +1` : `押注 ${pokerStake} 金币；落败（胜率 ${Math.round(pokerWinRate * 100)}%）｜金币 -${pokerStake}｜德州扑克参加次数 +1`,
        effects: pokerWin
          ? {
            ...(pokerStake > 0 ? { money: pokerStake } : {}),
            counterDeltas: { pokerCount: 1 },
          }
          : {
            ...(pokerStake > 0 ? { money: -pokerStake } : {}),
            counterDeltas: { pokerCount: 1 },
          },
      },
      {
        id: `random-7-ktv-${serial}`,
        label: "KTV 唱歌",
        outcome: `${formatTierResistedOutcome("社交", 1, ktvSocialResult)}。`,
        effects: {
          ...(ktvSocialGain > 0 ? { social: ktvSocialGain } : {}),
        },
      },
      {
        id: `random-7-dinner-${serial}`,
        label: "聚餐",
        outcome: dinnerAdvisorTreat
          ? `${formatProbabilityCondition("导师请客", 0.5)}｜SAN +5｜${formatTierResistedOutcome("导师好感", 1, dinnerFavorResult!)}。`
          : `${formatProbabilityCondition("AA 聚餐", 0.5)}｜SAN +5｜金币 -2。`,
        effects: dinnerAdvisorTreat
          ? {
            san: 5,
            ...(dinnerFavorGain > 0 ? { favor: dinnerFavorGain } : {}),
          }
          : {
            san: 5,
            money: -2,
          },
      },
    ],
  };

  const badmintonDescription = badmintonChampion
    ? "前几拍你还在找手感，打到后半场以后，脚步和落点都顺了起来。最后一球压在线内，你赢下了这场比赛。出了一身汗再走出球馆，久坐后的肩背也松了不少。"
    : "前几拍你还在找手感，对方已经连续把球压到后场。你追了几轮，最后还是没能把比分追回来。输球有点可惜，不过出了一身汗再走出球馆，久坐后的肩背也松了不少。";

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师组织了实验室团建，大家难得一起出来玩。",
      "周末集合时，同门状态都很放松，气氛明显和组会不一样。",
      "没有人谈截止日期，你也想好好放松半天。",
    ].join("\n\n"),
    decisionTitle: "活动选择",
    decisionDescription: [
      pokerStake === 0
        ? "球场已经订好了，牌桌也凑齐了人；德州扑克没有本金也能参加，输赢都不扣金币。"
        : `球场已经订好了，牌桌也凑齐了人；德州扑克本次押注 ${pokerStake} 金币，输了会扣掉这笔本金。`,
      "另一拨同门在约唱歌，气氛会轻松一些。",
      "晚上还有聚餐，导师可能请客，也可能每人各出 2 金币。",
    ].join("\n\n"),
    results: {
      [`random-7-badminton-${serial}`]: {
        title: "羽毛球",
        description: badmintonDescription,
      },
      [`random-7-poker-${serial}`]: {
        title: "德州扑克",
        description: pokerWin
          ? [
              "你坐到牌桌前，和几个师兄师姐开始了德州扑克。",
              "前几局你打得很保守，慢慢摸清了大家的牌风。",
              "关键一局，你拿到一手不错的牌，跟到最后顺利赢下底池。",
              "大家笑着说你今晚手气不错，你也把筹码收了回来。",
            ].join("\n\n")
          : [
              "你坐到牌桌前，和几个师兄师姐开始了德州扑克。",
              "前几局你还小赢了几手，后来一次跟注太深，桌上的筹码很快见了底。",
              "最后摊牌时，对方刚好大你一级。大家重新洗牌，你笑着把位置让给了下一位。",
            ].join("\n\n"),
      },
      [`random-7-ktv-${serial}`]: {
        title: "KTV 唱歌",
        description: [
          "包厢里刚开始还有些拘谨，唱过两轮以后，跑调的人反而抢起了麦克风。",
          "轮到你时，你点了一首大家都听过的动画片主题曲。副歌还没唱完，整间包厢已经跟着合唱。",
          "回去路上，群里还在互相发刚才的录像。以后再见到这些同门，聊天也多了几个不用谈科研的话题。",
          ...(ktvSocialNarrative ? [ktvSocialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-7-dinner-${serial}`]: {
        title: "聚餐",
        description: dinnerAdvisorTreat
          ? [
              "大家在学校附近找了家餐厅，坐下以后才发现聊天比点菜还慢。",
              "结账时，导师摆摆手：“今天我请吧，大家难得一起出来。”原本准备 AA 的同门立刻把手机收了回去。",
              "饭桌上从最近的实验聊到假期安排，导师也没有追问进度。散场时，你们之间的距离比组会上近了一点。",
              ...(dinnerFavorNarrative ? [dinnerFavorNarrative] : []),
            ].join("\n\n")
          : [
              "大家在学校附近找了家餐厅，菜单传了一圈，很快点满一桌平时食堂吃不到的菜。",
              "饭桌上没人催实验，最近的糗事反而被翻出来讲了个遍。你也跟着笑了很久。",
              "最后照例 AA，每人付了 2 金币。钱包少了一点，这顿饭倒确实让人放松。",
            ].join("\n\n"),
      },
    },
  });
}

export function createFundingCampusRandomEvent(state: GameState, _getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const favorTier = getAttributeTier(state.player.favor);
  const salaryGain = [3, 5, 7, 9][favorTier] ?? 3;

  const event: PendingEvent = {
    id: `random-8-y${state.year}-m${state.month}-n${serial}`,
    title: "导师经费",
    description: "导师负责的项目快结项了，账上还有一笔经费没用完。结项前得尽快确定用途，实验室只能优先补上一项。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-8",
    stage: "act1",
    choices: [
      {
        id: `random-8-gpu-${serial}`,
        label: "买显卡",
        outcome: "下次购买或升级显卡：0 金币。",
        effects: {
          shopEntitlementDeltas: { gpuTransaction: 1 },
        },
      },
      {
        id: `random-8-salary-${serial}`,
        label: "发劳务费",
        outcome: `导师好感第 ${favorTier + 1} 档｜金币 +${salaryGain}。`,
        effects: {
          money: salaryGain,
        },
      },
      {
        id: `random-8-renovate-${serial}`,
        label: "装修工位",
        outcome: "下次购买机械键盘、2K 显示器、办公椅、咖啡机，以及下次升级办公椅、咖啡机：0 金币。",
        effects: {
          shopEntitlementDeltas: {
            keyboardPurchase: 1,
            monitorPurchase: 1,
            chairPurchase: 1,
            chairUpgrade: 1,
            coffeeMachinePurchase: 1,
            coffeeMachineUpgrade: 1,
          },
        },
      },
      {
        id: `random-8-ai-${serial}`,
        label: "报销 AI 费用",
        outcome: "本月商店中的 AI 使用费用为 0。",
        effects: {
          eventSupportUpdates: { aiCostsCoveredUntilTotalMonths: state.totalMonths },
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师负责的一个项目快结项了，账上还有一笔经费没用完。",
      "结项前得尽快把用途定下来，导师便在组会上让大家想想，实验室还有什么值得添置。",
      "有人想添 **💻 GPU 服务器**，有人希望多发点 **💰 劳务费**，也有人提议置办 **🪑 工位设备**、报销常用的 **🤖 AI 工具**。",
      "---",
      "导师把几种提议记在白板上，又看向你：“你更支持哪一种？”",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "服务器能让实验少排队，劳务费能让这个月宽裕一些。",
      "工位改善和 AI 报销也都用得上，组里一时谁也说服不了谁。",
      "💻 **买显卡**：以后跑实验不用总排队",
      "💰 **发劳务费**：这个月手头宽裕一点",
      "🪑 **装修工位**：添置桌椅、外设和咖啡机",
      "🤖 **报销 AI 费用**：本月商店里的 AI 费用由组里承担",
      "---",
      "导师把最后的决定交给了你，但这笔经费只能先顾一头。",
    ].join("\n\n"),
    results: {
      [`random-8-gpu-${serial}`]: {
        title: "显卡采购",
        description: [
          "“显卡确实该添了。”导师同意从项目经费里出一笔设备预算，具体型号由你按需要选择。",
          "财务把额度记进了你的采购清单。下次在商店购买或升级显卡时，这笔费用会直接由项目经费承担。",
          "你重新看了看实验安排，决定先不急着下单，等需要更强算力时再把这次机会用掉。",
        ].join("\n\n"),
      },
      [`random-8-salary-${serial}`]: {
        title: "涨工资",
        description: salaryGain === 3
          ? [
              "“劳务费啊……”导师翻了翻账本，“最近开销比较大，先发一点吧。”",
              `到账提醒很快弹出来，这次一共多发了 ${salaryGain} 金币。`,
              "数目不算多，至少这个月的日常开销能松一点。",
            ].join("\n\n")
          : salaryGain === 5
            ? [
                "“劳务费？没问题。”导师爽快地答应了。",
                `很快，${salaryGain} 金币打进账户，比平时的补贴宽裕不少。`,
                "你顺手把拖了几天的购物清单也结了账。",
              ].join("\n\n")
            : [
                "“劳务费？”导师笑了笑，“你最近表现不错，多发点。”",
                `到账提醒显示多了 ${salaryGain} 金币，比你预想的数目高出不少。`,
                "这下不只日常开销有了着落，还能留下一些备用。",
              ].join("\n\n"),
      },
      [`random-8-renovate-${serial}`]: {
        title: "布置工位",
        description: [
          "“工位确实该收拾一下了。”导师给每个人留了一笔设备预算，让大家按自己的习惯添置。",
          "你的机械键盘、2K 显示器、办公椅和咖啡机都可以各报销一次，办公椅与咖啡机之后再升级也能走这笔经费。",
          "预算不会立刻过期，你打算去商店慢慢挑，缺哪件就先换哪件。",
        ].join("\n\n"),
      },
      [`random-8-ai-${serial}`]: {
        title: "报销 AI 费用",
        description: [
          "你提议把一部分经费用来报销本月的 AI 订阅：“查资料、改代码和整理实验都用得上。”",
          "导师点了点头：“这类工具确实能省下不少时间，本月的费用先从项目经费里走。”",
          "手续办好后，你打开商店看了一眼，所有 AI 模型都显示为 0 金币。",
          "这个月再需要订阅模型时，你不用先盯着余额计算了。",
        ].join("\n\n"),
      },
    },
  });
}
