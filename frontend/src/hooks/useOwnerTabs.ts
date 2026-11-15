import { useState } from "react";
import type { UserOut } from "@/types";

export const ALL_OWNERS_TAB = "전체";

/** 전체 / 배우자 이름들 / 공통(또는 "공동") 탭 — 보고서·절감 점검·일정 목록이 같은 탭과 같은 판정을 쓴다.
 * `ownerParam`은 API의 owner 파라미터 모양: 전체면 undefined, 공통이면 "shared", 배우자면 그 user id
 * (사용자 목록이 아직 없어 이름을 못 찾으면 undefined = 전체). */
export function useOwnerTabs(users: UserOut[] | undefined, sharedLabel = "공통") {
  const [ownerTab, setOwnerTab] = useState(ALL_OWNERS_TAB);
  const tabs = [ALL_OWNERS_TAB, ...(users?.map((u) => u.display_name) ?? []), sharedLabel];
  const ownerParam: string | undefined =
    ownerTab === ALL_OWNERS_TAB
      ? undefined
      : ownerTab === sharedLabel
        ? "shared"
        : users?.find((u) => u.display_name === ownerTab)?.id;
  return { tabs, ownerTab, setOwnerTab, isAll: ownerTab === ALL_OWNERS_TAB, ownerParam };
}
