import { getActualSanChange } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

type RandomRollProvider = () => number;

function createRandomEvent10(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const isLowSocial = state.player.social < 6;
  const sanChange = getActualSanChange(-2, state.month, state.eventSupport);
  const mutualSuccess = getRoll() < 0.5;

  return {
    id: `random-10-y${state.year}-m${state.month}-n${serial}`,
    title: "\u540c\u95e8\u5408\u4f5c",
    description: "同门邀请你合作论文。多个人能分担，也可能多些麻烦。怎么合作？",
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
}

function createRandomEvent11(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const roleText = getRoll() < 0.5 ? "\u5e08\u5144" : "\u5e08\u59d0";
  const eventTitle = roleText === "\u5e08\u59d0" ? "\u5e08\u59d0\u6307\u5bfc" : "\u5e08\u5144\u6307\u5bfc";
  const sanChange = getActualSanChange(-2, state.month, state.eventSupport);

  return {
    id: `random-11-y${state.year}-m${state.month}-n${serial}`,
    title: eventTitle,
    description: `${roleText}邀请你合作项目。机会不错，但你的时间也不宽裕。怎么合作？`,
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
