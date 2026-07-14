import { describe, expect, it } from "vitest";

import {
  compareEventQueueItems,
  createEventQueueItem,
  decrementEventQueueDeadlines,
  enqueueEventQueueItem,
  getCurrentEvent,
  getSortedEventQueue,
  hasBlockingEventQueueItems,
  removeEventQueueItem,
} from "../src/core/v2-event-queue";
import type { PendingEvent } from "../src/core/v2-types";

function createEvent(id: string, deadlineMonths: number, blocking = true): PendingEvent {
  return {
    id,
    title: `事件 ${id}`,
    description: `描述 ${id}`,
    preview: `预览 ${id}`,
    source: "fixed",
    blocking,
    deadlineMonths,
    chainId: id,
    stage: "act1",
    choices: [{ id: `${id}-choice`, label: "确定", outcome: "完成", effects: {} }],
  };
}

describe("v2 event queue", () => {
  it("入队时会补齐排序字段并保持预览文本", () => {
    const queueItem = createEventQueueItem(createEvent("a", 0), 3);
    expect(queueItem.queueOrder).toBe(3);
    expect(queueItem.preview).toBe("预览 a");
  });

  it("按期限优先、再按入队顺序排序", () => {
    const left = createEventQueueItem(createEvent("a", 1), 2);
    const right = createEventQueueItem(createEvent("b", 0), 1);
    expect(compareEventQueueItems(left, right)).toBeGreaterThan(0);
    expect(getSortedEventQueue([left, right]).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("只把 deadline 到期的阻塞事件视为真正阻塞", () => {
    const queue = [
      createEventQueueItem(createEvent("future", 2), 1),
      createEventQueueItem(createEvent("non-blocking", 0, false), 2),
    ];
    expect(hasBlockingEventQueueItems(queue)).toBe(false);

    const nextQueue = enqueueEventQueueItem(queue, createEvent("now", 0));
    expect(hasBlockingEventQueueItems(nextQueue)).toBe(true);
    expect(getCurrentEvent(nextQueue)?.id).toBe("now");
  });

  it("支持去重入队、跨月递减和出队", () => {
    let queue = enqueueEventQueueItem([], createEvent("future", 2));
    queue = enqueueEventQueueItem(queue, createEvent("future", 2));
    expect(queue).toHaveLength(1);

    queue = decrementEventQueueDeadlines(queue);
    expect(queue[0]?.deadlineMonths).toBe(1);

    queue = removeEventQueueItem(queue, "future");
    expect(queue).toHaveLength(0);
  });
});
