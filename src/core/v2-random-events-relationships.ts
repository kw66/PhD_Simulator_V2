import { getActualSanChange } from "./v2-sanity-rules";
import { createThreeStageRandomEvent } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

type RandomRollProvider = () => number;

function createRandomEvent10(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const isLowSocial = state.player.social < 6;
  const sanChange = getActualSanChange(-2, state.month, state.eventSupport);
  const mutualSuccess = getRoll() < 0.5;

  const event: PendingEvent = {
    id: `random-10-y${state.year}-m${state.month}-n${serial}`,
    title: "\u540c\u95e8\u5408\u4f5c",
    description: "同门拿着一个还不错的想法来找你，希望合作写篇论文。多个人能分担工作，也可能在分工和署名上添些麻烦。",
    preview: "\u540c\u95e8\u627e\u4f60\u5408\u4f5c",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-10",
    stage: "act1",
    choices: [
      {
        id: `random-10-exchange-${serial}`,
        label: "\u5b66\u672f\u4ea4\u6d41",
        outcome: isLowSocial
          ? "\u4e0b\u6b21\u60f3 idea +5\uff0c\u4e0b\u6b21\u60f3 idea x0.5\u3002"
          : "\u4e0b\u6b21\u60f3 idea +5\u3002",
        effects: {
          temporaryActionEffectUpdates: isLowSocial
            ? { idea: { bonus: 5, multiplier: 0.5 } }
            : { idea: { bonus: 5 } },
        },
      },
      {
        id: `random-10-mutual-${serial}`,
        label: "\u4e92\u6302\u8bba\u6587",
        outcome: mutualSuccess
          ? `SAN ${sanChange}\uff0c\u4e0b\u4e00\u7bc7\u53d1\u8868\u540e\u5f15\u7528 x2\u3002`
          : `SAN ${sanChange}\uff0c\u8fd9\u6b21\u6ca1\u62ff\u5230\u989d\u5916\u5f15\u7528\u589e\u901f\u3002`,
        effects: mutualSuccess
          ? { san: sanChange, nextPublicationCitationMultiplier: 2 }
          : { san: sanChange },
      },
      {
        id: `random-10-reject-${serial}`,
        label: "\u5a49\u62d2\u5408\u4f5c",
        outcome: "\u65e0\u4e8b\u53d1\u751f\u3002",
        effects: {},
      },
      {
        id: `random-10-full-${serial}`,
        label: "\u5168\u9762\u5408\u4f5c",
        outcome: isLowSocial
          ? `SAN ${sanChange}\uff0c\u4e0b\u6b21\u60f3 idea \u989d\u5916 1 \u6b21\uff0c\u4e0b\u6b21\u5199\u4f5c \u989d\u5916 1 \u6b21\u3002`
          : "\u4e0b\u6b21\u60f3 idea \u989d\u5916 1 \u6b21\uff0c\u4e0b\u6b21\u5199\u4f5c \u989d\u5916 1 \u6b21\u3002",
        effects: {
          ...(isLowSocial ? { san: sanChange } : {}),
          ...(!isLowSocial ? { relationshipAdditions: ["peer"] } : {}),
          temporaryActionEffectUpdates: {
            idea: { extraActions: 1 },
            writing: { extraActions: 1 },
          },
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      "同级同门来找你合作一个想法。",
      "方案有潜力，但合作意味着分工、信用和收益分配问题。",
      "你们关系不错，可一旦进入正式协作，很多“默认默契”都要变成可落地的规则。",
      "你要判断这段关系是“互相成就”，还是“把彼此拖进低效磨损”。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“只做学术交流，投入小，但你给出去的想法未必都能按预期回来。”",
      "“互挂论文像押注中稿节奏，成了就双赢，不成就一起空转。”",
      "“全面合作上限最高，但分工、节奏和信用任何一项失衡都会反噬。”",
      "“婉拒是保守策略，能稳住当前计划，也可能关掉一条潜在快车道。”你要选的是合作深度，而不是一个看起来最安全的说法。",
    ].join("\n\n"),
    results: {
      [`random-10-exchange-${serial}`]: {
        title: "交换合作",
        description: isLowSocial
          ? [
              "你们约了个时间，一起讨论各自的研究。",
              "交流中你分享了一些想法，小王听得很认真，还做了笔记。",
              "结果没过多久，你发现他发了一篇论文，里面的核心idea和你说的几乎一模一样！",
              "“这也太不讲武德了……”你气愤又无奈。",
            ].join("\n\n")
          : [
              "你们约了个时间，一起讨论各自的研究。",
              "交流中你们互相启发，碰撞出不少新想法。",
              "“这个角度我没想到！”小王兴奋地说。你也从他的思路中获得了灵感。",
              "这次交流让你收获颇丰。",
            ].join("\n\n"),
      },
      [`random-10-mutual-${serial}`]: {
        title: "互补合作",
        description: mutualSuccess
          ? [
              "你们约定好互相在论文里挂名引用。",
              "没过多久，小王的论文中了！他第一时间在参考文献里加上了你的论文。",
              "“兄弟够意思！”你看着引用数蹭蹭上涨，心情大好。",
            ].join("\n\n")
          : [
              "你们约定好互相在论文里挂名引用。",
              "结果等了好久，小王的论文一直没中。不是被拒就是大修，来来回回折腾了好几轮。",
              "“他这水平……算了，当我没说。”你有些后悔浪费了时间。",
            ].join("\n\n"),
      },
      [`random-10-reject-${serial}`]: {
        title: "拒绝合作",
        description: [
          "“不好意思，最近太忙了，下次有机会再合作吧。”你婉言谢绝了。",
          "小王有些失望，但也表示理解。",
          "你继续埋头做自己的事情。",
        ].join("\n\n"),
      },
      [`random-10-full-${serial}`]: {
        title: isLowSocial ? "合作满员" : "新增同门",
        description: isLowSocial
          ? [
              "你们决定全面合作，一起做一个大项目。",
              "但合作过程并不顺利，分工不明确，沟通也有问题，经常要返工。",
              "虽然最后勉强完成了，但你累得够呛。",
              "“下次合作前得先处好关系……”你暗自总结教训。",
            ].join("\n\n")
          : [
              "你们决定全面合作，一起做一个大项目。",
              "合作非常顺利，分工明确，配合默契。你负责idea和写作，他负责实验和数据。",
              "“和你合作真是太愉快了！”小王由衷地说。",
              "你们成为了很好的学术伙伴。",
            ].join("\n\n"),
      },
    },
  });
}

function createRandomEvent11(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const roleText = getRoll() < 0.5 ? "\u5e08\u5144" : "\u5e08\u59d0";
  const eventTitle = roleText === "\u5e08\u59d0" ? "\u5e08\u59d0\u6307\u5bfc" : "\u5e08\u5144\u6307\u5bfc";
  const sanChange = getActualSanChange(-2, state.month, state.eventSupport);

  const event: PendingEvent = {
    id: `random-11-y${state.year}-m${state.month}-n${serial}`,
    title: eventTitle,
    description: `${roleText}邀请你一起做个项目，方向和你的研究正好有些交集。机会不错，但你手头的时间也不宽裕，得先谈好怎么合作。`,
    preview: `${roleText}\u627e\u4f60\u5408\u4f5c`,
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-11",
    stage: "act1",
    choices: [
      {
        id: `random-11-watch-${serial}`,
        label: "\u5148\u89c2\u671b",
        outcome: `${roleText}\u5148\u627e\u4e86\u522b\u4eba\u5408\u4f5c\u3002`,
        effects: {},
      },
      {
        id: `random-11-light-${serial}`,
        label: "\u6d45\u6d45\u5408\u4f5c",
        outcome: `SAN ${sanChange}\uFF0C\u4e0b\u6b21\u60f3 idea +10\u3002`,
        effects: {
          san: sanChange,
          temporaryActionEffectUpdates: {
            idea: { bonus: 10 },
          },
        },
      },
      {
        id: `random-11-deep-${serial}`,
        label: "\u6df1\u5165\u5408\u4f5c",
        outcome: `\u79d1\u7814 +1\uFF0CSAN ${sanChange}\u3002`,
        effects: {
          research: 1,
          san: sanChange,
          relationshipAdditions: ["senior"],
        },
      },
      {
        id: `random-11-mentor-${serial}`,
        label: "\u62dc\u5165\u95e8\u4e0b",
        outcome: `\u5199\u4f5c +5\uFF0CSAN ${sanChange}\u3002`,
        effects: {
          writingBonus: 5,
          san: sanChange,
          relationshipAdditions: ["senior"],
        },
      },
    ],
  };

  return createThreeStageRandomEvent(event, {
    introDescription: [
      `临近毕业的${roleText}邀你一起做项目。`,
      `${roleText}手上项目节奏很快，意味着你能学到体系，也可能被强度直接卷住。`,
      "你知道这类合作常常决定一个新人后续两三学期的成长路径。",
      "这次你需要决定的不只是“做不做”，而是“投入到什么深度”。",
    ].join("\n\n"),
    decisionTitle: "你的选择",
    decisionDescription: [
      "“先观望最安全，但学术机会通常不会在原地等人。”",
      "“浅合作像试水，能拿到方法和灵感，投入还在可控范围。”",
      "“深合作意味着把自己彻底放进高强度节奏，成长和疲惫一起上升。”",
      "“拜入门下回报最高，但你之后的时间分配也会被重新定义。”你要判断自己此刻更需要稳态成长，还是主动换挡。",
    ].join("\n\n"),
    results: {
      [`random-11-watch-${serial}`]: {
        title: "先观望",
        description: [
          "“我再考虑考虑……”你犹豫地说。",
          `${roleText}点点头：“行，不着急，你想好了告诉我。”`,
          `结果没过几天，你就看到${roleText}和另一个同门一起讨论项目了。`,
          "“机会错过了……”你有些后悔。",
        ].join("\n\n"),
      },
      [`random-11-light-${serial}`]: {
        title: "浅合作",
        description: [
          "“好啊，我可以帮忙做一部分。”你答应了。",
          `合作过程中，${roleText}分享了很多研究心得和idea。`,
          `“这个方向很有前景，你可以试试。”${roleText}指点道。`,
          "虽然只是浅浅合作，但你收获了一个很棒的研究思路。",
        ].join("\n\n"),
      },
      [`random-11-deep-${serial}`]: {
        title: "深合作",
        description: [
          `“${roleText}，我想认真跟你学，咱们深入合作吧！”`,
          `${roleText}很高兴：“好！那我就不客气了，接下来会很累的。”`,
          `接下来的日子里，你跟着${roleText}从头到尾做了一个完整的项目。`,
          "虽然累，但你的科研能力有了质的飞跃。",
        ].join("\n\n"),
      },
      [`random-11-mentor-${serial}`]: {
        title: "拜入门下",
        description: [
          `“${roleText}，我想拜你为师，以后跟着你学！”你诚恳地说。`,
          `${roleText}愣了一下，然后笑了：“行啊，那我就收下你这个徒弟。”`,
          `从此，${roleText}成了你的第二导师，手把手教你写论文的技巧。`,
          `“写论文要注意这些细节……”${roleText}的指导让你受益匪浅。`,
        ].join("\n\n"),
      },
    },
  });
}

export function createRelationshipRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): PendingEvent | null {
  if (eventId === 10) {
    return createRandomEvent10(state, getRoll);
  }
  if (eventId === 11) {
    return createRandomEvent11(state, getRoll);
  }
  return null;
}
