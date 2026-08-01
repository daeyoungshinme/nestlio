import { describe, expect, it } from "vitest";
import { insightSeverityStyle } from "@/utils/colors";

describe("insight severity style", () => {
  it("returns a distinct style per severity", () => {
    const severities = ["info", "warning", "critical"] as const;
    const styles = severities.map(insightSeverityStyle);
    expect(new Set(styles).size).toBe(3);
  });
});
