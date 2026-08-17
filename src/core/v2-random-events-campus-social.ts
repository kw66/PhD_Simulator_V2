import { getAttributeTier } from "./v2-random-event-rules";
import { createThreeStageRandomEvent } from "./v2-random-events-core-shared";
import { applyTierResist } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";
import type { RandomRollProvider } from "./v2-random-events-campus-shared";

export function createSocialCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const nextBadmintonCount = state.eventCounters.badmintonCount + 1;
  const sanTier = getAttributeTier(state.player.san);
  const tierBonus = [-50, -25, 25, 50][sanTier];
  const expBonus = (nextBadmintonCount - 1) * 10;
  const winRate = Math.max(5, Math.min(95, 50 + tierBonus + expBonus)) / 100;
  let badmintonChampion = getRoll() < winRate;
  if (!badmintonChampion && state.eventSupport.hasBadmintonRacket) {
    badmintonChampion = getRoll() < winRate;
  }
  const badmintonSanGain = getRoll() < 0.5 ? 2 : 3;
  const badmintonSocialGain = badmintonChampion ? applyTierResist(1, state.player.social, getRoll).effectiveChange : 0;

  const pokerStake = Math.max(0, Math.min(state.player.money, 6));
  const pokerWin = getRoll() < 0.5;
  const nextPokerWinCount = state.eventCounters.pokerWinCount + (pokerWin ? 1 : 0);
  const nextPokerTotalEarnings = state.eventCounters.pokerTotalEarnings + (pokerWin ? pokerStake : 0);

  const nextKtvCount = state.eventCounters.ktvCount + 1;
  const ktvSocialGain = applyTierResist(1, state.player.social, getRoll).effectiveChange;

  const dinnerAdvisorTreat = getRoll() >= 0.5;
  const dinnerFavorGain = dinnerAdvisorTreat ? applyTierResist(1, state.player.favor, getRoll).effectiveChange : 0;

  const event: PendingEvent = {
    id: `random-7-y${state.year}-m${state.month}-n${serial}`,
    title: "实验室团建",
    description: "导师难得组织了一次团建，群里终于不只是在催论文和项目。活动有好几种，你准备跟大家去做什么？",
    preview: "实验室组织团建活动",
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
          ? `SAN +${badmintonSanGain}，今年不会感冒，社交 ${badmintonSocialGain > 0 ? `+${badmintonSocialGain}` : badmintonSocialGain}。`
          : `SAN +${badmintonSanGain}，今年不会感冒。`,
        effects: {
          san: badmintonSanGain,
          ...(badmintonSocialGain > 0 ? { social: badmintonSocialGain } : {}),
          counterDeltas: { badmintonCount: 1 },
          eventSupportUpdates: badmintonChampion && !state.eventSupport.hasStrongBodyTalent ? { hasStrongBodyTalent: true } : {},
          achievementFlags: badmintonChampion && !state.achievementFlags.badmintonChampion ? ["badmintonChampion"] : [],
          setBadmintonYearToCurrent: true,
        },
      },
      {
        id: `random-7-poker-${serial}`,
        label: "打德州扑克",
        outcome: pokerWin ? `金钱 +${pokerStake}。` : `金钱 -${pokerStake}。`,
        effects: pokerWin
          ? {
            money: pokerStake,
            counterDeltas: { pokerWinCount: 1, pokerTotalEarnings: pokerStake },
            eventSupportUpdates: nextPokerTotalEarnings >= 10 && !state.eventSupport.hasFinanceTalent ? { hasFinanceTalent: true } : {},
            achievementFlags: nextPokerWinCount >= 3 ? ["pokerGod"] : [],
          }
          : {
            money: -pokerStake,
          },
      },
      {
        id: `random-7-ktv-${serial}`,
        label: "KTV唱歌",
        outcome: ktvSocialGain > 0 ? `社交 +${ktvSocialGain}。` : "无事发生。",
        effects: {
          ...(ktvSocialGain > 0 ? { social: ktvSocialGain } : {}),
          counterDeltas: { ktvCount: 1 },
          achievementFlags: nextKtvCount >= 3 ? ["ktvKing"] : [],
        },
      },
      {
        id: `random-7-dinner-${serial}`,
        label: "聚餐",
        outcome: dinnerAdvisorTreat
          ? `SAN +5${dinnerFavorGain > 0 ? `，导师好感 +${dinnerFavorGain}` : ""}。`
          : "SAN +5，金钱 -2。",
        effects: dinnerAdvisorTreat
          ? {
            san: 5,
            ...(dinnerFavorGain > 0 ? { favor: dinnerFavorGain } : {}),
            counterDeltas: { dinnerCount: 1 },
          }
          : {
            san: 5,
            money: -2,
            counterDeltas: { dinnerCount: 1 },
          },
      },
    ],
  };

  const badmintonDescription = state.eventSupport.hasBadmintonRacket
    ? badmintonChampion
      ? [
          "你和师兄师姐们来到体育馆，拿起球拍开始打羽毛球。",
          "第一局你发挥失常，眼看就要输了。但你没有放弃，用自己的专业球拍再战一局！",
          "这一次你调整好状态，接球、扣杀、吊球，每一拍都精准有力。最终逆转取胜！",
          "大家纷纷上前祝贺，你感觉和同门们的关系更近了一步。",
        ].join("\n\n")
      : [
          "你和师兄师姐们来到体育馆，拿起球拍开始打羽毛球。",
          "第一局你发挥失常输了。不甘心的你用自己的专业球拍再战一局，但对手实力太强，还是遗憾落败。",
          "“没关系，下次再来！”师姐笑着说。你擦了擦汗，感觉整个人都轻松了不少。",
          "久坐实验室的脖子和手臂得到了锻炼，这种酣畅淋漓的感觉真好！",
        ].join("\n\n")
    : badmintonChampion
      ? [
          "你和师兄师姐们来到体育馆，拿起球拍开始打羽毛球。",
          "一开始只是随便打打，但很快大家就开始认真起来。你的状态出奇的好，接球、扣杀、吊球，每一拍都精准有力。",
          "“好球！”师兄忍不住叫好。最后的决赛中，你以精湛的球技击败了对手！",
          "大家纷纷上前祝贺，你感觉和同门们的关系更近了一步。这场羽毛球打下来，浑身舒畅，感觉自己充满了活力。",
        ].join("\n\n")
      : [
          "你和师兄师姐们来到体育馆，拿起球拍开始打羽毛球。",
          "虽然你很努力，但对手实力太强，最终遗憾落败。",
          "“没关系，下次再来！”师姐笑着说。你擦了擦汗，感觉整个人都轻松了不少。",
          "久坐实验室的脖子和手臂得到了锻炼，这种酣畅淋漓的感觉真好！",
        ].join("\n\n");

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "导师组织了实验室团建，大家难得从科研节奏里抽出来。",
      "周末集合时，同门状态都很放松，气氛明显和组会不一样。",
      "没有人谈截止日期，大家终于可以在“同门”之外，以“普通人”的方式相处半天。",
      "你想把这天过得轻松一点，也希望顺便把平时难说的话变成自然交流。",
      "问题是：怎么玩最值，既不浪费这次放松窗口，也能给后续协作留点正收益。",
    ].join("\n\n"),
    decisionTitle: "活动选择",
    decisionDescription: [
      "“打羽毛球更像竞技场，状态在线就能直接把存在感打出来。”",
      "“德州是高波动路线，今晚可能回血，也可能把零花钱交学费。”",
      "“KTV和聚餐是低风险社交线，收益不炸裂，但通常更稳。”你要选的是今天的主目标：修状态、搏手气，还是稳住关系。",
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
              "一开始你打得很保守，慢慢摸清了大家的牌风。师兄喜欢虚张声势，师姐则是稳扎稳打。",
              "关键的一局，你手上拿到了不错的牌。你镇定自若地加注，师兄跟注，师姐弃牌。翻牌的那一刻——",
              "“皇家同花顺！”你亮出手牌，全场惊呼。",
              "师兄瞪大了眼睛：“这运气也太好了吧！”你笑着把筹码收入囊中，今晚运气真不错。",
            ].join("\n\n")
          : [
              "你坐到牌桌前，和几个师兄师姐开始了德州扑克。",
              "一开始还赢了几把小的，你信心满满地加大了筹码。但运气似乎用完了……",
              "连续几把都是烂牌，好不容易来了一手好牌，结果师兄的牌比你更大。",
              "“哎，今天手气太差了……”你无奈地看着空空如也的筹码，只能认栽。",
              "师姐安慰你：“没关系，重在参与嘛！下次一定能赢回来。”",
            ].join("\n\n"),
      },
      [`random-7-ktv-${serial}`]: {
        title: "KTV唱歌",
        description: [
          "你和同门们来到了KTV，包厢里灯光闪烁，音响震耳欲聋。",
          "师兄先上去唱了一首情歌，虽然跑调但热情满满；师姐唱了首流行歌曲，获得阵阵掌声。",
          "轮到你了，你拿起话筒，选了一首《猪猪侠》主题曲。",
          "“超级棒棒糖，猪猪侠，聪明勇敢有力气~”",
          "包厢里顿时笑声一片，大家跟着一起唱了起来。欢乐的气氛感染了每一个人，你感觉和同门们的关系更近了。",
        ].join("\n\n"),
      },
      [`random-7-dinner-${serial}`]: {
        title: "聚餐",
        description: dinnerAdvisorTreat
          ? [
              "你和同门们来到了学校附近的餐厅，点了满满一桌菜。",
              "正准备扫码付款的时候，导师笑着摆摆手：“今天我请客，大家尽管吃！”",
              "全场欢呼，你也松了口气——毕竟钱包最近有点紧张。",
              "菜一道道上来，红烧肉、糖醋排骨、清蒸鱼……你大快朵颐，感觉这是来读研以来吃得最开心的一顿饭。",
              "导师举起杯子：“感谢大家这学期的努力，来，干杯！”大家一起碰杯，气氛温馨融洽。你感觉和导师的关系又近了一步。",
            ].join("\n\n")
          : [
              "你和同门们来到了学校附近的餐厅，点了满满一桌菜。",
              "红烧肉、糖醋排骨、清蒸鱼……菜一道道上来，香气扑鼻，你大快朵颐。",
              "“这个红烧肉太好吃了！”师弟一边吃一边感叹。",
              "你点点头表示赞同。确实，食堂的饭菜哪能和餐厅比。虽然最后AA的时候心疼了一下钱包，但这顿饭吃得值。",
              "吃饱喝足，你感觉整个人都精神了很多，心情也变得愉快起来。",
            ].join("\n\n"),
      },
    },
  });
}

export function createFundingCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const buyGPU = getRoll() < 0.5;
  const favorTier = getAttributeTier(state.player.favor);
  const gpuCount = favorTier === 0 ? 1 : favorTier === 1 ? 2 : 3;
  const salaryGain = favorTier === 0 ? 2 : favorTier === 1 ? 4 : 6;

  const event: PendingEvent = {
    id: `random-8-y${state.year}-m${state.month}-n${serial}`,
    title: "导师经费",
    description: "新一笔项目经费到账，组里缺设备的、缺劳务费的都在等安排。钱看着不少，真正花起来却只能先顾一头。",
    preview: "导师有经费要花",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-8",
    stage: "act1",
    choices: [
      {
        id: `random-8-gpu-${serial}`,
        label: "买GPU服务器",
        outcome: buyGPU ? `永久实验 +${gpuCount}，永久实验额外 ${gpuCount} 次。` : "导师并不想买。",
        effects: buyGPU
          ? {
            experimentBonus: gpuCount,
            persistentExtraActionDeltas: { experiment: gpuCount },
          }
          : {},
      },
      {
        id: `random-8-salary-${serial}`,
        label: "多发劳务费",
        outcome: `金钱 +${salaryGain}。`,
        effects: {
          money: salaryGain,
        },
      },
      {
        id: `random-8-renovate-${serial}`,
        label: "装修工位",
        outcome: "永久想 idea +1，永久写作 +1。",
        effects: {
          ideaBonus: 1,
          writingBonus: 1,
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "项目经费到账，导师让大家提资源使用建议。",
      "组会里每个人都在争取自己最急需的资源，讨论很快从“想要什么”变成“为什么该给你”。",
      "这次决定不仅影响你自己，也会影响整个组的日常节奏。",
      "你意识到自己这句话可能会改变后续几个月的工作手感和效率天花板。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“把钱砸在 GPU 上是长期主义，今天麻烦，后面每次实验都受益。”",
      "“要劳务费最直接，能立刻缓解现金流压力，但不改变系统效率。”",
      "“升级工位像慢变量，单次体感不强，长期却会悄悄抬高产出稳定性。”你需要在“短期舒服”和“长期回本”之间给出清晰立场。",
    ].join("\n\n"),
    results: {
      [`random-8-gpu-${serial}`]: {
        title: "买GPU",
        description: !buyGPU
          ? [
              "“买服务器？”导师想了想，“现在的服务器还能用，等以后再说吧。”",
              "你有些失望，但也没办法。",
            ].join("\n\n")
          : [
              "“行，那就买台新服务器。”导师同意了。",
              `新服务器到货后，导师分配显卡资源。你分到了${gpuCount}张显卡${gpuCount > 1 ? "！" : "。"}`,
              gpuCount === 1
                ? "“虽然只有一张，但总比没有强。”你安慰自己。"
                : gpuCount === 2
                  ? "“不错不错，跑实验效率能提升不少。”你很满意。"
                  : "“导师对我真好！”你感动得差点流泪。",
            ].join("\n\n"),
      },
      [`random-8-salary-${serial}`]: {
        title: "涨工资",
        description: salaryGain === 2
          ? [
              "“劳务费啊……”导师翻了翻账本，“最近开销比较大，先发一点吧。”",
              "你看着到账的金额，有点失望，但也只能接受。",
            ].join("\n\n")
          : salaryGain === 4
            ? [
                "“劳务费？没问题。”导师爽快地答应了。",
                "很快，一笔可观的劳务费到账了。你看着银行余额，心情不错。",
              ].join("\n\n")
            : [
                "“劳务费？”导师笑了笑，“你最近表现不错，多发点。”",
                "你看着到账的金额，简直不敢相信自己的眼睛。导师太大方了！",
              ].join("\n\n"),
      },
      [`random-8-renovate-${serial}`]: {
        title: "装修实验室",
        description: [
          "“装修工位？”导师想了想，“确实该改善一下环境了。”",
          "很快，实验室焕然一新。新的办公桌、舒适的椅子、明亮的灯光……",
          "坐在新工位上，你感觉思路都清晰了不少。",
          "“环境好了，效率肯定能提高！”你对自己说。",
        ].join("\n\n"),
      },
    },
  });
}
