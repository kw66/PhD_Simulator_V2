import { getAttributeTier } from "./v2-random-event-rules";
import { BADMINTON_VICTORY_THRESHOLD, getBadmintonStrength, getPokerWinRate } from "./v2-growth-system";
import {
  createThreeStageRandomEvent,
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
    description: "导师在组群里发了团建通知，打球、打牌、唱歌和聚餐的提议接连冒出来。平时问进度要等半天的群，这会儿消息一条接一条💬。",
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
          ? `获胜｜生病概率 -10%｜羽毛球参加次数 +1${state.eventSupport.hasStrongBodyTalent ? "" : "｜解锁每月 SAN +1"}`
          : "落败｜生病概率 -10%｜羽毛球参加次数 +1",
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
          ? (pokerWin ? "无本金，纯游戏获胜｜德州扑克参加次数 +1" : "无本金，纯游戏落败｜德州扑克参加次数 +1")
          : pokerWin ? `押注 ${pokerStake} 金币；获胜｜金币 +${pokerStake}｜德州扑克参加次数 +1` : `押注 ${pokerStake} 金币；落败｜金币 -${pokerStake}｜德州扑克参加次数 +1`,
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
          ? `导师请客｜SAN +5｜${formatTierResistedOutcome("导师好感", 1, dinnerFavorResult!)}。`
          : "AA 聚餐｜SAN +5｜金币 -2。",
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
    ? [
        "球鞋在地板上吱吱响，你从追着球跑，慢慢打到能把球送进对方空当。最后一球压在线内，场边的同门替你报出了获胜的比分。",
        state.eventSupport.hasStrongBodyTalent
          ? "收拍时你还在喘，同学已经在问下周约哪天。每周一起打球早已成了习惯，暂时离开工位跑动一阵，肩背松快了，脑子也跟着清醒起来。你笑着应下，又比画了一下刚才那记回球。"
          : "收拍时你还在喘，却忍不住又比画了一下最后那记回球。你发现自己真有点爱上这项运动了，当场和同学约好，以后每周都一起来打球。总算有件事能让你心甘情愿地离开工位；把它坚持下去，疲惫的日子里也多了个恢复精神的盼头。",
      ].join("\n\n")
    : "对方接连把球送到后场，你刚追过去，又得赶回网前。场边同门喊了几声加油，比分还是没能追回来。\n\n你扶着膝盖喘了会儿气，和对方碰了碰拍。落点没判断准，倒是把场地跑熟了；走出球馆时，久坐后的肩背也松快了不少。";

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师在组群里发了团建通知，打球、打牌、唱歌和聚餐的提议接连冒出来。平时问进度要等半天的群，这会儿消息一条接一条。",
      "有人确认要不要带电脑，导师回了句“不用汇报”😌。你把装到一半的电源适配器放回桌上，群里的活动投票也发出来了。",
    ].join("\n\n"),
    decisionTitle: "活动选择",
    decisionDescription: [
      `羽毛球那一栏刚多了一票，群里就有人约双打搭子。${badmintonChampion ? "掂了掂球拍，想起最近练熟的几招，你倒真想上场比一比。" : "你试着挥了两下，身体还没活动开。真想打赢，平时的练习、今天的精神和手里的球拍，哪样都不能全靠临场发挥。"}下一条语音里，同门已经在为 KTV 选曲了。`,
      (pokerStake === 0
        ? "提议打牌的同门也在招呼人。你说手头没有本金，对方很快回了消息：“那就只用筹码记输赢，一样玩。”"
        : `提议打牌的同门也在招呼人，这次押注 ${pokerStake} 金币。你想起上次那手看着稳赢的牌，还是先摸了摸钱包。`) + "聚餐菜单也发来了，导师还没说请客，真要 AA，每人得出 2 金币。你在几个群消息之间来回切，歌还没选好，菜倒先看饿了。",
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
              "几位同门把牌摊在桌上，连每次加注都有人认真分析。你起初跟得保守，关键一局拿到好牌才跟到底；摊牌之后，桌上的筹码被推到了你面前。",
              pokerStake === 0
                ? "你刚想复盘一下自己的判断，同门先笑着说了句“手气不错”。筹码只是记分用的，没赢到钱，你还是把它们整整齐齐码了一遍。"
                : "你刚想复盘一下自己的判断，同门先笑着说了句“手气不错”。结算后多了一笔金币，你收好赢来的钱，也没再坚持要讲刚才那套分析。",
            ].join("\n\n")
          : [
              "你和几位同门围着桌子玩德州扑克。前几局小赢了几手，你逐渐敢跟注，直到一次迟迟不肯弃牌，面前的筹码越推越少。",
              pokerStake === 0
                ? "最后摊牌，对方的牌更大。你把剩下的记分筹码推过去，回头再看刚才那手牌，自己也纳闷怎么就跟到底了。好在这局只记输赢，没有损失金币。"
                : "最后摊牌，对方的牌更大，这次押下的金币输了出去。你把牌扣回桌上，坐到旁边看下一局；轮到别人犹豫要不要跟注时，你倒是比刚才清醒多了。",
            ].join("\n\n"),
      },
      [`random-7-ktv-${serial}`]: {
        title: "KTV 唱歌",
        description: [
          "包厢刚开场，话筒传了一圈又回到原处。你点了首熟悉的动画片主题曲，第一句还有点放不开，到了副歌，没拿话筒的人反而唱得最响。",
          "回去路上，群里传来刚才的录像。你点开听了两秒就调低音量，原来自己也没比别人准多少。几位同门还在争是谁先跑调的，你也忍不住加入了讨论。",
          ...(ktvSocialNarrative ? [ktvSocialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-7-dinner-${serial}`]: {
        title: "聚餐",
        description: dinnerAdvisorTreat
          ? [
              "大家在校门口的餐厅挤了一桌，菜单在茶杯和碗碟间传来传去。有人聊起食堂换了窗口，你接上话才发现，导师也在那里排过长队。整顿饭都没拐到实验进度上。",
              "结账时，导师摆摆手：“今天我请。”你刚打开付款码，又和旁边的同门一起收起手机。出门时大家还在接着聊，你也没急着散。",
              ...(dinnerFavorNarrative ? [dinnerFavorNarrative] : []),
            ].join("\n\n")
          : [
              "大家在校门口找了家餐厅，菜单传了一圈，点菜比平时讨论实验方案还热闹。菜上来以后，话题从哪个食堂窗口好吃，一路聊到谁在校园里迷过路。",
              "最后按 AA 结账，每人付了 2 金币。你付完钱才发现，刚才光顾着接话，碗里还有半个丸子没吃😅。大家又坐着聊了一会儿，才慢慢往校门走。",
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
    description: "组会快结束时，导师又打开了项目经费表：一个项目临近结项，还剩一笔预算没安排。刚合上的电脑又被打开，白板上很快多了几项提议。",
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
        outcome: `金币 +${salaryGain}。`,
        effects: {
          money: salaryGain,
        },
      },
      {
        id: `random-8-renovate-${serial}`,
        label: "装修工位",
        outcome: "工位报销+1：购买机械键盘、2K 显示器、办公椅、咖啡机，或升级办公椅、咖啡机，任选一次免单。",
        effects: {
          shopEntitlementDeltas: {
            workstationTransaction: 1,
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
      "组会快结束时，导师又打开了项目经费表：一个项目临近结项，还剩一笔预算没安排。刚合上的电脑又被打开，这回大家查的是设备报价。",
      "白板上陆续写下显卡、劳务费、工位设备和 AI 费用。导师对着表格核了一遍，圈出剩余金额：“先安排一项，不能全报。”",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      `你接过导师递来的笔，显卡报价还开着，椅子一往后靠又吱呀响了一声；旁边的同门小声说，直接发劳务费也挺好。${favorTier >= 2 ? "导师提起你这阵子做的事，说要是选劳务费，会给你多安排些。" : favorTier >= 1 ? "导师翻了翻你最近的工作记录，点头说劳务费可以再添一点。" : "你和导师还不太熟，老师按惯常的标准在劳务费那栏写了个数。"}`,
      "你在纸上圈下报销范围：下次购买或升级显卡、一次工位设备购买或升级，还有本月的 AI 费用。平时舍不得花的钱，这会儿每一笔都想起来了。导师看着被你圈了一遍的清单，等你在选定的那项旁打勾。",
    ].join("\n\n"),
    results: {
      [`random-8-gpu-${serial}`]: {
        title: "显卡采购",
        description: [
          "你指了指白板上的显卡。导师在经费表里留出设备预算，同意承担你下次购买或升级显卡的费用，具体型号等选好再定。",
          "你记下这次报销机会，打开参数页看起了显存容量。手指习惯性地往价格那一栏滑，停了一下，又往上翻了回去。",
        ].join("\n\n"),
      },
      [`random-8-salary-${serial}`]: {
        title: "涨工资",
        description: salaryGain === 3
          ? [
              "“劳务费啊……”导师看了看经费表，在劳务那一栏填了个数：“这次先发这些。”你凑过去确认了金额。",
              `到账提醒弹出来，一共 ${salaryGain} 金币。你核对了一遍，收起手机；数目不多，看到余额往上跳一下，还是挺高兴的。`,
            ].join("\n\n")
          : salaryGain === 5
            ? [
                "“劳务费？没问题。”导师答应下来，在经费表上记好金额。你又确认了一句什么时候发，得到准信才坐回去。",
                `到账提醒里写着 ${salaryGain} 金币。你把通知看完，又点开余额看了一眼；刚才组会上核数字的认真劲，这会儿倒是一点没少。`,
              ].join("\n\n")
            : [
                "“劳务费？”导师笑了笑，“这次给你多安排一点。”你原本只顾着记，听到金额，又抬头确认了一遍。",
                `到账提醒显示多了 ${salaryGain} 金币。你对着屏幕把数额默念了一遍，和刚才记的一样，这才把手机揣回口袋。`,
              ].join("\n\n"),
      },
      [`random-8-renovate-${serial}`]: {
        title: "布置工位",
        description: [
          "导师同意留一笔工位报销额度。你记下范围：机械键盘、2K 显示器、办公椅和咖啡机，买一样可以免单，也可以用来升级已有的办公椅或咖啡机。",
          "回到工位，你先量了量桌面的空位，又坐下来比画了一下椅子的高度。原来认真挑办公设备，也得在自己这一平方米里来回折腾好一阵。",
        ].join("\n\n"),
      },
      [`random-8-ai-${serial}`]: {
        title: "报销 AI 费用",
        description: [
          "你指着清单上的 AI 费用说：“查资料、改代码都能用上，想报销本月的费用。”导师点头，把这一项记进了经费表。",
          "手续办好后，本月使用工具产生的费用由组里承担。你把原本要精打细算的额度放下，接着处理手头的研究。",
        ].join("\n\n"),
      },
    },
  });
}
