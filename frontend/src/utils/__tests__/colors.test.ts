import { describe, expect, it } from "vitest";
import { insightSeverityStyle, returnRateTextColor } from "@/utils/colors";

describe("insight severity style", () => {
  it("returns a distinct style per severity", () => {
    const severities = ["info", "warning", "critical"] as const;
    const styles = severities.map(insightSeverityStyle);
    expect(new Set(styles).size).toBe(3);
  });
});

describe("return rate text color", () => {
  it("returns a distinct color per sign", () => {
    const colors = [returnRateTextColor(10), returnRateTextColor(-10), returnRateTextColor(0)];
    expect(new Set(colors).size).toBe(3);
  });
});
