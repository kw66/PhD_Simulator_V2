import { describe, expect, it } from "vitest";

import {
  THESIS_OPTIONS,
  THESIS_STAGES,
  abandonThesis,
  applyThesisOption,
  calculateThesisProgressGain,
  createInitialThesisState,
  getThesisStage,
  shouldTriggerThesisEvent,
  startThesisIfAvailable,
} from "../src/core/v2-thesis-rules";

describe("v2 thesis rules", () => {
  it("提供稳定的大论文阶段与选项定义", () => {
    expect(THESIS_STAGES.map((stage) => stage.threshold)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(THESIS_OPTIONS.map((option) => option.baseProgress)).toEqual([0, 5, 12, 25]);
  });

  it("按旧版口径判断大论文是否开始触发", () => {
    const initialThesis = createInitialThesisState();
    expect(shouldTriggerThesisEvent(2, 6, initialThesis)).toBe(false);
    expect(shouldTriggerThesisEvent(2, 7, initialThesis)).toBe(true);
    expect(startThesisIfAvailable(2, 7, initialThesis).started).toBe(true);
  });

  it("按旧版公式计算论文数与科研能力加成", () => {
    expect(calculateThesisProgressGain(0, 3, 12)).toBe(0);
    expect(calculateThesisProgressGain(5, 0, 0)).toBe(5);
    expect(calculateThesisProgressGain(12, 3, 20)).toBe(23);
    expect(calculateThesisProgressGain(25, 10, 20)).toBe(40);
  });

  it("能正确推进进度、判定完成并识别当前阶段", () => {
    const initialThesis = startThesisIfAvailable(2, 7, createInitialThesisState());
    const firstStep = applyThesisOption(initialThesis, THESIS_OPTIONS[2], 2, 10);
    expect(firstStep.progressGain).toBe(18);
    expect(firstStep.nextThesis.progress).toBe(18);
    expect(getThesisStage(firstStep.nextThesis.progress).name).toBe("未开始");

    const finalStep = applyThesisOption({ ...firstStep.nextThesis, progress: 90 }, THESIS_OPTIONS[3], 4, 20);
    expect(finalStep.nextThesis.progress).toBe(100);
    expect(finalStep.nextThesis.completed).toBe(true);
    expect(getThesisStage(finalStep.nextThesis.progress).name).toBe("答辩准备");
  });

  it("支持放弃后停止后续触发", () => {
    const abandoned = abandonThesis(startThesisIfAvailable(2, 7, createInitialThesisState()));
    expect(abandoned.abandoned).toBe(true);
    expect(shouldTriggerThesisEvent(3, 1, abandoned)).toBe(false);
  });
});
