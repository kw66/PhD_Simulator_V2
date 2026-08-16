import { describe, expect, it } from "vitest";

import { getConferenceInfo, getConferenceLocation, getRealConferenceYear } from "../src/core/v2-conference-catalog";
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

  it("keeps PRCV in mainland-only domestic locations", () => {
    const location = getConferenceLocation(10, "C", 1);
    expect(location.region).toBe("domestic");
    expect(["北京", "上海", "深圳", "杭州", "南京", "广州"]).toContain(location.city);
  });
});
