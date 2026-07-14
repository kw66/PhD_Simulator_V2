import { describe, expect, it } from "vitest";

import { getConferenceInfo, getConferenceLocation, getRealConferenceYear } from "../src/core/v2-conference-catalog";

describe("v2 conference catalog", () => {
  it("maps game month/year to real conference year like old code", () => {
    expect(getRealConferenceYear(1, 4)).toBe(2030);
    expect(getRealConferenceYear(1, 5)).toBe(2031);
  });

  it("switches ICCV/ECCV by real year parity", () => {
    expect(getConferenceInfo(7, "A", 1).name).toBe("ICCV");
    expect(getConferenceInfo(7, "A", 2).name).toBe("ECCV");
  });

  it("keeps PRCV in mainland-only domestic locations", () => {
    const location = getConferenceLocation(10, "C", 1);
    expect(location.region).toBe("domestic");
    expect(["北京", "上海", "深圳", "杭州", "南京", "广州"]).toContain(location.city);
  });
});