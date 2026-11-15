import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOwnerTabs } from "@/hooks/useOwnerTabs";
import type { UserOut } from "@/types";

const USERS = [
  { id: "u1", display_name: "지민" },
  { id: "u2", display_name: "서준" },
] as UserOut[];

describe("useOwnerTabs", () => {
  it("lists 전체, each spouse and the shared tab", () => {
    const { result } = renderHook(() => useOwnerTabs(USERS, "공동"));
    expect(result.current.tabs).toEqual(["전체", "지민", "서준", "공동"]);
    expect(result.current.ownerParam).toBeUndefined();
    expect(result.current.isAll).toBe(true);
  });

  it("maps a spouse tab to the user id and the shared tab to 'shared'", () => {
    const { result } = renderHook(() => useOwnerTabs(USERS));
    act(() => result.current.setOwnerTab("서준"));
    expect(result.current.ownerParam).toBe("u2");
    act(() => result.current.setOwnerTab("공통"));
    expect(result.current.ownerParam).toBe("shared");
    expect(result.current.isAll).toBe(false);
  });
});
