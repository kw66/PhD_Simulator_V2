import { describe, expect, it } from "vitest";

import {
  applyTemporaryActionEffectUpdates,
  calculateTemporaryActionGain,
  consumeTemporaryActionEffect,
  createTemporaryActionEffects,
} from "../src/core/v2-temporary-action-rules";

describe("v2 temporary action rules", () => {
  it("stacks bonus, multiplier and extraActions in a low-coupling state object", () => {
    const initial = createTemporaryActionEffects();
    const updated = applyTemporaryActionEffectUpdates(initial, {
      idea: { bonus: 10, extraActions: 1 },
      writing: { multiplier: 0.5 },
    });

    expect(updated.idea).toEqual({ bonus: 10, multiplier: 1, extraActions: 1 });
    expect(updated.writing).toEqual({ bonus: 0, multiplier: 0.5, extraActions: 0 });
    expect(initial.idea).toEqual({ bonus: 0, multiplier: 1, extraActions: 0 });
  });

  it("maps one-shot old-style buffs into deterministic v2 paper gains", () => {
    expect(calculateTemporaryActionGain(2, { bonus: 10, multiplier: 1, extraActions: 1 })).toBe(14);
    expect(calculateTemporaryActionGain(3, { bonus: 5, multiplier: 0.5, extraActions: 1 })).toBe(6);
  });

  it("consumes only the matching action effect", () => {
    const updated = applyTemporaryActionEffectUpdates(createTemporaryActionEffects(), {
      idea: { bonus: 8 },
      writing: { extraActions: 1 },
    });
    const consumed = consumeTemporaryActionEffect(updated, "idea");

    expect(consumed.idea).toEqual({ bonus: 0, multiplier: 1, extraActions: 0 });
    expect(consumed.writing).toEqual({ bonus: 0, multiplier: 1, extraActions: 1 });
  });
});
