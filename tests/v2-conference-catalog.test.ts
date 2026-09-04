import { describe, expect, it } from "vitest";

import { getConferenceInfo, getConferenceLocation, getConferenceReferenceScore, getRealConferenceYear } from "../src/core/v2-conference-catalog";
import { getCcigRealYear } from "../src/core/v2-fixed-events-ccig-shared";

describe("v2 conference catalog", () => {
  it("maps the first academic year to the 2023 enrollment calendar", () => {
    expect(getRealConferenceYear(1, 4)).toBe(2023);
    expect(getRealConferenceYear(1, 5)).toBe(2024);
    expect(getCcigRealYear(1, 4)).toBe(2023);
    expect(getCcigRealYear(1, 5)).toBe(2024);
  });

  it("switches ICCV/ECCV by real year parity", () => {
    expect(getConferenceInfo(7, "A", 1).name).toBe("ECCV");
    expect(getConferenceInfo(7, "A", 2).name).toBe("ICCV");
  });

  it("uses Interspeech for the speech B venue", () => {
    expect(getConferenceInfo(7, "B", 1)).toMatchObject({
      name: "Interspeech",
      fullName: "Annual Conference of the International Speech Communication Association",
    });
  });

  it("calculates venue references for the submission choices", () => {
    const conference = getConferenceInfo(3, "A", 1);

    expect(conference).toMatchObject({
      name: "CVPR",
      influence: 1.4,
      referenceScore: 82,
    });
  });

  it("calibrates reference scores through the review simulation", () => {
    expect(getConferenceReferenceScore("A", 1.2, 1)).toBe(70);
    expect(getConferenceReferenceScore("B", 0.65, 1)).toBe(40);
    expect(getConferenceReferenceScore("C", 0.3, 1)).toBe(20);
    expect(getConferenceReferenceScore("A", 1.4, 1)).toBe(82);
    expect(getConferenceReferenceScore("A", 1.4, 2)).toBeGreaterThanOrEqual(70);
  });

  it("ranks ICLR just above ICML in the venue influence scale", () => {
    expect(getConferenceInfo(1, "A", 1).influence).toBe(1.4);
    expect(getConferenceInfo(6, "A", 1).influence).toBe(1.35);
  });

  it("keeps reputable vision venues above ordinary C venues", () => {
    expect(getConferenceInfo(1, "C", 1).influence).toBe(0.35);
    expect(getConferenceInfo(9, "C", 1).influence).toBe(0.4);
    expect(getConferenceInfo(10, "C", 1).influence).toBe(0.3);
  });

  it("keeps AAAI slightly above IJCAI and ACM MM", () => {
    expect(getConferenceInfo(12, "A", 1).influence).toBe(1.0);
    expect(getConferenceInfo(5, "A", 1).influence).toBe(0.95);
    expect(getConferenceInfo(8, "A", 1).influence).toBe(0.9);
  });

  it("keeps PRCV in mainland-only domestic locations", () => {
    const location = getConferenceLocation(10, "C", 1);
    expect(location.region).toBe("domestic");
    expect(["北京", "上海", "深圳", "杭州", "南京", "广州"]).toContain(location.city);
  });

  it("pins a conference location to the run seed", () => {
    const first = getConferenceLocation(3, "A", 1, 123456);
    const repeat = getConferenceLocation(3, "A", 1, 123456);
    const otherRun = getConferenceLocation(3, "A", 1, 654321);

    expect(repeat).toEqual(first);
    expect(otherRun).not.toEqual(first);
  });
});
