import { getAttributeTier } from "./v2-random-event-rules";
import { BADMINTON_VICTORY_THRESHOLD, getBadmintonStrength, getPokerWinRate } from "./v2-growth-system";
import {
  createThreeStageEvent,
  drawInclusiveInt,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
import { applyTierResist, formatTierResistedOutcome, getTierResistedNarrative } from "./v2-sanity-rules";
import { getAdvisorMeetingAttendancePercent } from "./v2-advisor-progress";
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
  const nextPokerCount = state.eventCounters.pokerCount + 1;
  const badmintonGrowth = "胜率提升";
  const currentPokerRate = getPokerWinRate(state.eventCounters.pokerCount);
  const nextPokerRate = getPokerWinRate(nextPokerCount);
  const pokerGrowth = nextPokerRate > currentPokerRate ? `胜率 ${currentPokerRate}%→${nextPokerRate}%` : "";

  const ktvSocialRoll = getRoll();
  const ktvSocialResult = applyTierResist(1, state.player.social, () => ktvSocialRoll);
  const ktvSocialGain = ktvSocialResult.effectiveChange;
  const ktvSocialNarrative = getTierResistedNarrative("社交", 1, ktvSocialResult);

  const attendancePercent = getAdvisorMeetingAttendancePercent(state.advisorProgressState);
  const dinnerAdvisorTreat = getRoll() < attendancePercent / 100;
  const dinnerFavorRoll = getRoll();
  const dinnerFavorResult = dinnerAdvisorTreat ? applyTierResist(1, state.player.favor, () => dinnerFavorRoll) : null;
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
          ? `条件：获胜（羽毛球实力 ${badmintonStrength} ≥ ${BADMINTON_VICTORY_THRESHOLD}）｜结果：生病概率 -10%｜${badmintonGrowth}${state.eventSupport.hasStrongBodyTalent ? "" : "｜SAN +1（每月）"}`
          : `条件：落败（羽毛球实力 ${badmintonStrength} < ${BADMINTON_VICTORY_THRESHOLD}）｜结果：生病概率 -10%｜${badmintonGrowth}`,
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
          ? (pokerWin ? `条件：本金 0，纯游戏获胜（${pokerWinRate * 100}%）｜结果：${pokerGrowth || "金币 +0"}` : `条件：本金 0，纯游戏落败（${100 - pokerWinRate * 100}%）｜结果：${pokerGrowth || "金币 +0"}`)
          : pokerWin ? `条件：押注 ${pokerStake} 金币；获胜（${pokerWinRate * 100}%）｜结果：金币 +${pokerStake}${pokerGrowth ? `｜${pokerGrowth}` : ""}` : `条件：押注 ${pokerStake} 金币；落败（${100 - pokerWinRate * 100}%）｜结果：金币 -${pokerStake}${pokerGrowth ? `｜${pokerGrowth}` : ""}`,
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
          ? `条件：导师请客（${attendancePercent}%）｜结果：SAN +5｜${formatTierResistedOutcome("导师好感", 1, dinnerFavorResult!)}。`
          : `条件：AA 聚餐（${100 - attendancePercent}%）｜结果：SAN +5｜金币 -2。`,
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

  return createThreeStageEvent(event, {
    introDescription: [
      "论文、实验和日志把实验室压得安静了好几天，导师的一条团建通知突然把群聊炸开了锅。打球、打牌、唱歌和聚餐的提议一条接一条，大家像终于从繁杂科研里挣脱出来。",
      "有人确认要不要带电脑，导师回了句“不用汇报”😌。你把装到一半的电源适配器放回桌上，群里的活动投票也发出来了。",
    ].join("\n\n"),
    decisionTitle: "活动选择",
    decisionDescription: [
      `羽毛球刚多一票，就有人约双打搭子。${badmintonChampion ? "掂掂球拍，想起最近练熟的几招，你真想上场比一比。" : "你挥了两下，身体还没活动开。想打赢，平时的练习、今天的精神和手里的球拍，都不能只靠临场发挥。"}同门的下一条语音已经在选 KTV 曲目了。`,
      (pokerStake === 0
        ? "打牌的同门也在招呼人。你说没有本金，对方回道：“只用筹码记输赢，一样玩。”"
        : `打牌这次押注 ${pokerStake} 金币。想起上次那手看着稳赢的牌，你还是摸了摸钱包。`) + "聚餐菜单也来了，大家还在等导师最后确认是否请客；如果各自结账，每人得出 2 金币。歌还没选好，菜倒先看饿了。",
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

export function createFundingCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const favorTier = getAttributeTier(state.player.favor);
  const salaryGain = [3, 5, 7, 9][favorTier] ?? 3;
  const approvalPercent = [40, 60, 80, 100][favorTier] ?? 40;
  const favorCondition = ["导师好感 < 6", "6 ≤ 导师好感 < 12", "12 ≤ 导师好感 < 18", "导师好感 ≥ 18"][favorTier];
  const gpuApproved = getRoll() < approvalPercent / 100;
  const workstationApproved = getRoll() < approvalPercent / 100;
  const aiApproved = getRoll() < approvalPercent / 100;
  const reimbursementOutcome = (approved: boolean, reward: string): string =>
    `条件：${favorCondition}；${approved ? "同意报销" : "未获同意"}（${approved ? approvalPercent : 100 - approvalPercent}%）｜结果：${approved ? reward : "报销失败"}`;

  const event: PendingEvent = {
    id: `random-8-y${state.year}-m${state.month}-n${serial}`,
    title: "导师经费",
    description: "组会快结束时，导师翻出实验室经费表，说账上有些经费近期需要花出去，想给大家添点设备或发份劳务费。刚合上的电脑又被打开，大家开始列清单。",
    source: "random",
    blocking: true,
    deadlineMonths: 1,
    chainId: "random-8",
    stage: "act1",
    choices: [
      {
        id: `random-8-gpu-${serial}`,
        label: "买显卡",
        outcome: reimbursementOutcome(gpuApproved, "显卡报销：本月免单1次，使用时扣科研经费"),
        effects: gpuApproved ? {
          labReimbursement: "gpuTransaction",
        } : {},
      },
      {
        id: `random-8-salary-${serial}`,
        label: "发劳务费",
        outcome: `${favorCondition}｜金币 +${salaryGain}｜科研经费 -${salaryGain}。`,
        effects: {
          money: salaryGain,
          advisorProgressStateDeltas: { funding: -salaryGain },
          labFinanceCategory: "labor",
        },
      },
      {
        id: `random-8-renovate-${serial}`,
        label: "装修工位",
        outcome: reimbursementOutcome(workstationApproved, "工位报销：本月免单1次，使用时扣科研经费"),
        effects: workstationApproved ? {
          labReimbursement: "workstationTransaction",
        } : {},
      },
      {
        id: `random-8-ai-${serial}`,
        label: "报销 AI 费用",
        outcome: reimbursementOutcome(aiApproved, "AI报销：下月免费，使用时扣科研经费"),
        effects: aiApproved ? {
          addBuffs: [{
            id: `ai-reimbursement-${state.totalMonths + 1}`,
            name: "AI报销",
            source: "导师经费",
            timing: "monthly",
            remainingMonths: 2,
            shopEffects: { aiCostsCovered: true, aiCostsCoveredAtTotalMonths: state.totalMonths + 1 },
            description: "下月 AI 购买与自动续费由科研经费支付，余额不足时暂停。",
          }],
        } : {},
      },
    ],
  };

  const stagedEvent = createThreeStageEvent(event, {
    introDescription: [
      "组会快结束时，导师翻出实验室经费表，说账上有些经费近期需要花出去，想给大家添点设备或发份劳务费。刚合上的电脑又被打开，大家开始列清单。",
      "白板上陆续写下显卡、劳务费、工位设备和 AI 费用。导师对着表格核了一遍：“先提一项，设备和软件还得看看是否合适，别把同一笔预算报两遍。”",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      `你接过笔，显卡报价还开着，椅子往后一靠又吱呀响；同门小声说，发劳务费也挺好。${favorTier >= 2 ? "导师提起你这阵子的工作，说选劳务费会多安排些。" : favorTier >= 1 ? "导师翻翻你的工作记录，说劳务费可以再添一点。" : "你和导师还不太熟，选劳务费的话，大概只能按惯常标准发。"}`,
      `显卡、工位设备和下月的 AI 费用都可以提，但还得导师点头。${favorTier >= 3 ? "老师熟悉你的需要，让你选好报销项目就记下来。" : favorTier >= 1 ? "平时积下的信任让你更敢开口，只是老师仍会问问用途。" : "你和老师还不熟，想报的东西得好好解释用途。"}劳务费倒是能直接到账，你在几项之间犹豫起来。`,
    ].join("\n\n"),
    results: {
      [`random-8-gpu-${serial}`]: {
        title: "显卡采购",
        description: gpuApproved ? [
          "你指了指白板上的显卡。导师点点头，让你本月选好型号，购买或升级一次，实际费用从实验室经费里支付。",
          "你记下这次报销机会，打开参数页看起了显存容量。手指习惯性地往价格那一栏滑，停了一下，又往上翻了回去。",
        ].join("\n\n") : [
          "你把显卡报价递过去，导师看了眼型号：“组里的卡先排着用，个人显卡这次就不报了。”你准备好的显存对比还没讲完，话题已经转到了下一位同学。",
          "回到工位，购物车里的显卡还在。你关掉报价页，重新看了看服务器上排到明天的任务。",
        ].join("\n\n"),
      },
      [`random-8-salary-${serial}`]: {
        title: "领劳务费",
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
        description: workstationApproved ? [
          "导师同意本月从实验室经费里报销一次工位开支：键盘、显示器、办公椅和咖啡机任选一样，也能升级已有的椅子或咖啡机。",
          "回到工位，你量量桌面空位，又比画椅子高度。认真挑办公设备，也得在自己这一平方米里来回折腾。",
        ].join("\n\n") : [
          "你提起吱呀响的椅子和想换的设备，导师听完说：“先找后勤修修，能用的暂时别换。”你低头看看列好的清单，把那几个型号划掉了。",
          "回到工位一坐下，椅子又响了一声。你和隔壁同学对视了一眼，只好先把松动的螺丝拧紧。",
        ].join("\n\n"),
      },
      [`random-8-ai-${serial}`]: {
        title: "报销 AI 费用",
        description: aiApproved ? [
          "你指着清单上的 AI 费用说：“查资料、改代码都能用上，想报销下个月的费用。”导师点头，把这一项记进了经费表。",
          "下个月购买和续费都能报销，这个月已经订好的也不白花。你在日历上记下这件事，总算不用再盯着免费额度倒计时。",
        ].join("\n\n") : [
          "你说想报销下个月的 AI 费用，导师反问：“免费版不也能用吗？先用着，真离不开再说。”你想解释几种工具的区别，看老师已低头核对表格，又把话咽了回去。",
          "回到工位，页面正好提示免费额度已用完。你看了看订阅价格，决定先去接杯水，回来再算。",
        ].join("\n\n"),
      },
    },
  });
  for (const decision of stagedEvent.choices[0]!.effects.enqueueEvents![0]!.choices) {
    const { enqueueEvents, ...rewards } = decision.effects;
    decision.effects = { enqueueEvents };
    const result = enqueueEvents![0]!;
    const confirmation = result.choices[0]!;
    confirmation.effects = rewards;
    confirmation.outcome = decision.outcome;
  }
  return stagedEvent;
}
