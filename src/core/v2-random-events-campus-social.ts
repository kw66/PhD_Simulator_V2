import { getAttributeTier } from "./v2-random-event-rules";
import { BADMINTON_VICTORY_THRESHOLD, getBadmintonStrength, getPokerWinRate } from "./v2-growth-system";
import {
  createThreeStageRandomEvent,
  drawInclusiveInt,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import { applyTierResist, formatTierResistedOutcome, getTierResistedNarrative } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

const KTV_SONGS = [
  { title: "《迪迦奥特曼》主题曲", lyric: "新的风暴已经出现，怎么能够停滞不前" },
  { title: "《猪猪侠》主题曲", lyric: "聪明勇敢有力气，圆头圆脑圆肚皮" },
  { title: "《神兵小将·梦的光点》", lyric: "我追着梦的光点，是因为有了勇气，才不怕危险" },
] as const;

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
  const ktvSong = KTV_SONGS[drawInclusiveInt(0, KTV_SONGS.length - 1, getRoll)]!;

  const event: PendingEvent = {
    id: `random-7-y${state.year}-m${state.month}-n${serial}`,
    title: "组内团建",
    description: "论文、实验和日志把实验室压得安静了好几天，导师的一条团建通知突然把群聊炸开了锅。打球、打牌、唱歌和聚餐的提议一条接一条，大家像终于从繁杂科研里挣脱出来。",
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
          ? `条件：获胜（羽毛球实力 ${badmintonStrength} ≥ ${BADMINTON_VICTORY_THRESHOLD}）｜结果：生病概率 -10%｜羽毛球参加次数 +1${state.eventSupport.hasStrongBodyTalent ? "" : "｜每周锻炼，强身健体；每月 SAN +1"}`
          : `条件：落败（羽毛球实力 ${badmintonStrength} < ${BADMINTON_VICTORY_THRESHOLD}）｜结果：生病概率 -10%｜羽毛球参加次数 +1`,
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
          ? (pokerWin ? `条件：本金 0，纯游戏获胜（${pokerWinRate * 100}%）｜结果：德州扑克参加次数 +1` : `条件：本金 0，纯游戏落败（${100 - pokerWinRate * 100}%）｜结果：德州扑克参加次数 +1`)
          : pokerWin ? `条件：押注 ${pokerStake} 金币；获胜（${pokerWinRate * 100}%）｜结果：金币 +${pokerStake}｜德州扑克参加次数 +1` : `条件：押注 ${pokerStake} 金币；落败（${100 - pokerWinRate * 100}%）｜结果：金币 -${pokerStake}｜德州扑克参加次数 +1`,
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
          ? `条件：导师请客（50%）｜结果：SAN +5｜${formatTierResistedOutcome("导师好感", 1, dinnerFavorResult!)}。`
          : "条件：AA 聚餐（50%）｜结果：SAN +5｜金币 -2。",
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
    ? state.eventSupport.hasStrongBodyTalent
      ? [
          "你赢下比赛。前几分还在试探，后半段已经跑得满场都是汗；最后一球落地，大家一起笑着复盘刚才那几个回合。",
          "你和同门约好下周继续锻炼。输赢是一回事，出汗以后整个人都松快了；这次运动也让生病概率下降。",
        ].join("\n\n")
      : [
          "你赢下比赛。前几分还在试探，后半段已经跑得满场都是汗；最后一球落地，大家一起笑着复盘刚才那几个回合。",
          "你和同门约好每周锻炼，强身健体。出汗以后整个人都松快了，规律运动也让生病概率下降。",
        ].join("\n\n")
    : [
        "你没能赢下比赛。对方几次回球压得很准，你也有几个球救得漂亮；最后一球落地时，场边还是先响起了笑声和掌声。",
        "输球不等于白来，来回跑动让你出了身汗。你和同门约好下次再来，运动把身体练起来，生病概率也会下降。",
      ].join("\n\n");

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "论文、实验和日志把实验室压得安静了好几天，导师的一条团建通知突然把群聊炸开了锅。打球、打牌、唱歌和聚餐的提议一条接一条，大家像终于从繁杂科研里挣脱出来。",
      "有人确认要不要带电脑，导师回了句“不用汇报”😌。你把装到一半的电源适配器放回桌上，群里的活动投票也发出来了。",
    ].join("\n\n"),
    decisionTitle: "活动选择",
    decisionDescription: [
      `羽毛球刚多一票，就有人约双打搭子。${badmintonChampion ? "掂掂球拍，想起最近练熟的几招，你真想上场比一比。" : "你挥了两下，身体还没活动开。想打赢，平时的练习、今天的精神和手里的球拍，都不能只靠临场发挥。"}同门的下一条语音已经在选 KTV 曲目了。`,
      (pokerStake === 0
        ? "打牌的同门也在招呼人。你说没有本金，对方回道：“只用筹码记输赢，一样玩。”"
        : `打牌这次押注 ${pokerStake} 金币。想起上次那手看着稳赢的牌，你还是摸了摸钱包。`) + "聚餐菜单也来了，导师没说请客，AA 每人得出 2 金币。歌还没选好，菜倒先看饿了。",
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
              "同门连每次加注都认真分析。你起初跟得保守，关键一局拿到好牌才跟到底；摊牌后，筹码被推到了你面前。",
              pokerStake === 0
                ? "你刚想复盘，同门先笑着说了句“手气不错”。筹码只记分，没赢到钱，你还是把它们整整齐齐码了一遍。"
                : "你刚想复盘，同门先笑着说了句“手气不错”。你收好赢来的金币，也没再坚持讲刚才那套分析。",
            ].join("\n\n")
          : [
              "和同门玩德州扑克，前几局小赢，你逐渐敢跟注。直到一次迟迟不肯弃牌，面前的筹码越推越少。",
              pokerStake === 0
                ? "摊牌后，对方的牌更大。你推过剩下的筹码，自己也纳闷怎么就跟到底了。好在这局只记输赢，没有损失金币。"
                : "摊牌后，对方的牌更大，押下的金币输了出去。你扣好牌，坐到旁边看下一局；轮到别人犹豫跟注，你倒清醒多了。",
            ].join("\n\n"),
      },
      [`random-7-ktv-${serial}`]: {
        title: "KTV 唱歌",
        description: [
          "话筒转一圈又回到原处。你点了首动画片主题曲，副歌时没拿话筒的反而唱得最响。",
          `唱到${ktvSong.title}的“${ktvSong.lyric}”，几个人同时接上，连凑数的同门也抢了话筒。`,
          "群里传来录像，你听两秒就调低音量：自己也没比别人准。同门争谁先跑调，你也加入了讨论。",
          ...(ktvSocialNarrative ? [ktvSocialNarrative] : []),
        ].join("\n\n"),
      },
      [`random-7-dinner-${serial}`]: {
        title: "聚餐",
        description: dinnerAdvisorTreat
          ? [
              "大家出了校门，直奔惦记已久的馆子。烤鱼滋滋冒油，招牌菜摆满一桌，刚才还说没胃口的人已经添了第二碗饭。吃上这顿大餐，你连熬实验的疲惫都松了些。",
              "聊起哪家店好吃，导师竟也有一串推荐。你顺着问了几句，平时见面只会打招呼，这回倒聊熟了。结账时，导师摆摆手：“今天我请。”",
              ...(dinnerFavorNarrative ? [dinnerFavorNarrative] : []),
            ].join("\n\n")
          : [
              "大家约着去校外吃顿大餐，点菜比讨论实验方案还热闹。烤肉、锅仔和招牌硬菜陆续上桌，香得筷子停不下来；喊着只吃几口的人最后都添了饭，积攒的疲惫也被这顿好吃的冲淡了。",
              "AA 结账，每人付了 2 金币。你才发现刚才光顾着接话，碗里还有半个丸子没吃😅。大家又聊了会儿，才往校门走。",
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
    description: "组会快结束时，导师又打开了项目经费表：一个项目临近结项，还剩一笔预算必须用完。刚合上的电脑又被打开，导师让大家各报一项学习或科研相关的开支。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-8",
    stage: "act1",
    choices: [
      {
        id: `random-8-gpu-${serial}`,
        label: "买显卡",
        outcome: "显卡报销：下次购买或升级显卡免费。",
        effects: {
          shopEntitlementDeltas: { gpuTransaction: 1 },
        },
      },
      {
        id: `random-8-salary-${serial}`,
        label: "发劳务费",
        outcome: `${["导师好感 < 6", "6 ≤ 导师好感 < 12", "12 ≤ 导师好感 < 18", "导师好感 ≥ 18"][favorTier]}｜金币 +${salaryGain}。`,
        effects: {
          money: salaryGain,
        },
      },
      {
        id: `random-8-renovate-${serial}`,
        label: "装修工位",
        outcome: "工位报销 +1：设备购买或椅子、咖啡机升级任选一次免单。",
        effects: {
          shopEntitlementDeltas: {
            workstationTransaction: 1,
          },
        },
      },
      {
        id: `random-8-ai-${serial}`,
        label: "报销 AI 费用",
        outcome: "AI 报销：本月使用费为 0。",
        effects: {
          eventSupportUpdates: { aiCostsCoveredUntilTotalMonths: state.totalMonths },
          addBuffs: [{
            id: "ai-reimbursement",
            name: "AI报销",
            source: "导师经费",
            timing: "monthly",
            remainingMonths: 1,
            shopEffects: { aiCostsCovered: true },
            description: "本月商店中的 AI 使用费用为 0。",
          }],
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "组会快结束时，导师又打开了项目经费表：一个项目临近结项，还剩一笔预算必须用完。刚合上的电脑又被打开，导师让大家各报一项学习或科研相关的开支。",
      "白板上陆续写下显卡、劳务费、工位设备和 AI 费用。导师对着表格核了一遍：“先选一项，别把同一笔预算报两遍。”",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      `你接过笔，显卡报价还开着，椅子往后一靠又吱呀响；同门小声说，发劳务费也挺好。${favorTier >= 2 ? "导师提起你这阵子的工作，说选劳务费会多安排些。" : favorTier >= 1 ? "导师翻翻你的工作记录，说劳务费可以再添一点。" : "你和导师还不太熟，老师按惯常标准填了劳务费。"}`,
      "报销范围圈好了：下次购买或升级显卡、一次工位设备购买或升级，还有本月的 AI 费用。平时舍不得花的钱，这会儿全想起来了。导师看着圈满的清单，等你选一项打勾。",
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
          "导师留出工位报销额度：机械键盘、2K 显示器、办公椅和咖啡机，任选一样免单，也能升级已有的办公椅或咖啡机。",
          "回到工位，你量量桌面空位，又比画椅子高度。认真挑办公设备，也得在自己这一平方米里来回折腾。",
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
