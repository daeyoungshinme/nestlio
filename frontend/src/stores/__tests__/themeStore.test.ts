import { beforeEach, describe, expect, it } from "vitest";
import { useThemeStore } from "@/stores/themeStore";

describe("themeStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("toggle flips isDark and persists the choice", () => {
    const before = useThemeStore.getState().isDark;
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().isDark).toBe(!before);
    expect(localStorage.getItem("nestlio:theme")).toBe(!before ? "dark" : "light");
  });
});
