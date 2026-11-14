import { describe, expect, it } from "vitest";
import { crossedMilestone } from "@/utils/goalMilestone";

describe("crossedMilestone", () => {
  it("returns the highest milestone newly crossed by a goal", () => {
    expect(crossedMilestone(20, 55, "goal")).toBe(50);
    expect(crossedMilestone(10, 100, "goal")).toBe(100);
  });

  it("returns null when nothing new was crossed (including staying on a milestone)", () => {
    expect(crossedMilestone(50, 60, "goal")).toBeNull();
    expect(crossedMilestone(60, 40, "goal")).toBeNull();
  });

  it("celebrates challenges only at 100%", () => {
    expect(crossedMilestone(10, 80, "challenge")).toBeNull();
    expect(crossedMilestone(90, 100, "challenge")).toBe(100);
  });
});
