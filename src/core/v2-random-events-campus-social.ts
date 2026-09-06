import { getAttributeTier } from "./v2-random-event-rules";
import { BADMINTON_VICTORY_THRESHOLD, getBadmintonStrength, getPokerWinRate } from "./v2-growth-system";
import {
  createThreeStageRandomEvent,
  formatProbabilityCondition,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import { applyTierResist, formatTierResistedOutcome, getTierResistedNarrative } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

export function createSocialCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const badmintonStrength = getBadmintonStrength(
    state.player.san,
    state.eventCounters.badmintonCount,
    state.eventSupport.hasBadmintonRacket,
  );
  const badmintonChampion = badmintonStrength >= BADMINTON_VICTORY_THRESHOLD;

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
    description: "导师难得组织了一次团建，群里终于不只是在催论文和项目。活动有好几种，你准备和大家一起做什么？",
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
          ? `获胜（实力 ${badmintonStrength}/${BADMINTON_VICTORY_THRESHOLD}）｜生病概率 -10%｜羽毛球参加次数 +1${state.eventSupport.hasStrongBodyTalent ? "" : "｜解锁每月 SAN +1"}`
          : `落败（实力 ${badmintonStrength}/${BADMINTON_VICTORY_THRESHOLD}）｜生病概率 -10%｜羽毛球参加次数 +1`,
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
            counterDeltas: { pokerCount: 1, pokerProfit: pokerStake },
          }
          : {
            ...(pokerStake > 0 ? { money: -pokerStake } : {}),
            counterDeltas: { pokerCount: 1, pokerProfit: -pokerStake },
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
    ? "前几拍你还在找手感，打到后半场，脚步和落点渐渐顺了起来。最后一球压在线内，你赢下了比赛。出了一身汗走出球馆，久坐后的肩背也松快了不少。"
    : "前几拍你还在找手感，对方却接连把球压到后场。你追了几轮，还是没能把比分追回来。实力还差一点，输球有些可惜，不过出了一身汗走出球馆，久坐后的肩背也松快了不少。";

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师在群里发起团建，大家提了打球、打牌、唱歌和聚餐几种方案。这次不用带 PPT，也没人要求汇报进度。",
      "难得有半天能放下实验，你准备投一票，选一项和大家一起去。",
    ].join("\n\n"),
    decisionTitle: "活动选择",
    decisionDescription: [
      pokerStake === 0
        ? "打球能活动筋骨，打牌则考验耐心。你没有本金，也能参加纯游戏牌局，输赢都不影响金币。"
        : `打球能活动筋骨，打牌则考验耐心。这次德州扑克押注 ${pokerStake} 金币，输了就要扣掉这笔本金。`,
      "也可以选唱歌或聚餐。聚餐可能由导师请客，也可能每人各出 2 金币。",
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
              "你坐到牌桌前，起初打得很保守，慢慢摸清了几位同门的牌风。关键一局拿到好牌，你跟到最后，赢下了底池。",
              pokerStake === 0
                ? "大家笑着说你手气不错。筹码只是记分用的，没赢到钱，也不妨碍你高兴一会儿。"
                : "大家笑着说你手气不错。清点筹码时，你发现这趟不光玩得开心，还多赚了一点生活费。",
            ].join("\n\n")
          : [
              "你坐到牌桌前，和几个师兄师姐玩起了德州扑克。",
              "前几局你还小赢了几手，后来一次跟注太深，桌上的筹码很快见了底。",
              pokerStake === 0
                ? "最后摊牌，对方的牌更大一些。好在只是记分牌局，你没损失金币，笑着让出了位置。"
                : "最后摊牌，对方的牌更大一些。这次押下的金币输了出去，你笑着让出位置，提醒自己下次别跟得太急。",
            ].join("\n\n"),
      },
      [`random-7-ktv-${serial}`]: {
        title: "KTV 唱歌",
        description: [
          "包厢里刚开始还有些拘谨，唱过两轮以后，最跑调的人反而先抢起了麦克风。",
          "轮到你时，你点了一首大家都听过的动画片主题曲。副歌还没唱完，整间包厢已经跟着合唱。",
          "回去路上，群里还在互相转发刚才的录像。以后再见到这些同门，聊天也多了几个不用谈科研的话题。",
          ...(ktvSocialNarrative ? [ktvSocialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-7-dinner-${serial}`]: {
        title: "聚餐",
        description: dinnerAdvisorTreat
          ? [
              "大家在学校附近找了家餐厅，聊起假期安排和最近的趣事。导师没有追问实验，饭桌比组会轻松得多。",
              "结账时，导师摆摆手：“今天我请，大家难得一起出来。”几部刚拿出来的手机又默默收了回去。",
              ...(dinnerFavorNarrative ? [dinnerFavorNarrative] : []),
            ].join("\n\n")
          : [
              "大家在学校附近找了家餐厅，菜单传了一圈，很快点满一桌平时在食堂吃不到的菜。",
              "饭桌上没人催实验，最近的糗事反而被翻出来讲了个遍。你也跟着笑了很久。",
              "最后照例 AA，每人付了 2 金币。钱包薄了一点，这顿饭倒确实让人放松。",
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
    description: "导师负责的项目快结项了，账上还剩一笔经费。结项前得尽快确定用途，实验室暂时只能优先补上一项。",
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
      "一个项目快结项了，导师在组会上征求剩余经费的使用意见。显卡不够用，工位该改善，劳务费和 AI 费用也有人惦记。",
      "几种提议写满了白板，预算却不能样样照顾。导师看向你：“这次你觉得该先花在哪儿？”",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "显卡预算可以留到下次购买或升级时使用；劳务费则直接到账，先缓解眼下的开销。",
      "也可以选工位设备的购买、升级报销，或让组里承担本月商店里的 AI 费用。这次只能选一项。",
    ].join("\n\n"),
    results: {
      [`random-8-gpu-${serial}`]: {
        title: "显卡采购",
        description: [
          "“显卡确实该添了。”导师同意留一笔设备预算，下次购买或升级显卡的费用由项目承担，型号按你的需要选。",
          "你把这次报销机会记好，打算先看看实验需求再下单。这回挑显卡，终于不用只盯着价格了。",
        ].join("\n\n"),
      },
      [`random-8-salary-${serial}`]: {
        title: "涨工资",
        description: salaryGain === 3
          ? [
              "“劳务费啊……”导师翻了翻账本，“最近开销比较大，先发一点吧。”",
              `到账提醒很快弹出来，这次一共多发了 ${salaryGain} 金币。`,
              "数目不算多，至少这个月手头能宽裕一点。",
            ].join("\n\n")
          : salaryGain === 5
            ? [
                "“劳务费？没问题。”导师爽快地答应了。",
                `很快，${salaryGain} 金币打进账户，比平时的补贴宽裕不少。`,
                "你重新打开搁置几天的购物清单，开始盘算这笔钱怎么花。",
              ].join("\n\n")
            : [
                "“劳务费？”导师笑了笑，“你最近表现不错，多发点。”",
                `到账提醒显示多了 ${salaryGain} 金币，比你预想的数目高出不少。`,
                "这下日常开销有了着落，还能留下一些备用。",
              ].join("\n\n"),
      },
      [`random-8-renovate-${serial}`]: {
        title: "布置工位",
        description: [
          "“工位确实该改善一下。”导师同意报销机械键盘、2K 显示器、办公椅和咖啡机，各一次；办公椅和咖啡机的下次升级也能报销。",
          "你把清单记好，打算按需要慢慢挑。天天坐在这里，能舒服一点也是件正经事。",
        ].join("\n\n"),
      },
      [`random-8-ai-${serial}`]: {
        title: "报销 AI 费用",
        description: [
          "你提议报销本月的 AI 费用：“查资料、改代码，平时都用得上。”导师点头，同意这笔钱从项目经费里出。",
          "手续办好后，商店里的 AI 费用都变成了 0 金币。至少这个月，用哪个工具可以先看需要，不必先看余额。",
        ].join("\n\n"),
      },
    },
  });
}
