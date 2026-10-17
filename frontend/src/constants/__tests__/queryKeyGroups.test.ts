import { describe, expect, it } from "vitest";
import { DEFAULT_GC_TIME, PERSIST_MAX_AGE } from "@/constants/queryConfig";
import { CATEGORY_RELATED_KEYS, QUERY_KEYS, USER_RELATED_KEYS } from "@/constants/queryKeys";

// 응답에 카테고리/사용자 정보를 박아 두는 캐시가 무효화 묶음에서 빠지면, 이름·색을 바꿔도 해당 화면이
// 옛 값을 계속 보여준다(고정지출 시트·추이 차트·월간 회고가 그랬다). 알려진 소비처를 고정해 둔다.
describe("query key groups", () => {
  it("category changes refresh every response that embeds category name/color", () => {
    expect(CATEGORY_RELATED_KEYS).toEqual(
      expect.arrayContaining([
        QUERY_KEYS.categoriesAll,
        QUERY_KEYS.transactionsAll,
        QUERY_KEYS.recurring,
        QUERY_KEYS.categoryTrendAll,
        QUERY_KEYS.monthlyRetrospective,
        QUERY_KEYS.dashboardAll,
      ]),
    );
  });

  it("display-name changes refresh every response that embeds a user's name", () => {
    expect(USER_RELATED_KEYS).toEqual(
      expect.arrayContaining([
        QUERY_KEYS.me,
        QUERY_KEYS.users,
        QUERY_KEYS.transactionsAll,
        QUERY_KEYS.eventsAll,
        QUERY_KEYS.monthlyRetrospective,
        QUERY_KEYS.dashboardBootstrap,
      ]),
    );
  });

  // 지난달 회고 인사이트는 계획·목표·자산·코칭 임계값을 모두 읽는다 — 그 변경들이 무효화하는 dashboardAll
  // 프리픽스 하위에 있어야 따로 나열하지 않아도 함께 갱신된다(예전 ["monthly-retrospective"]는 빠졌었다).
  it("monthly retrospective sits under the dashboard prefix", () => {
    expect(QUERY_KEYS.monthlyRetrospective.slice(0, QUERY_KEYS.dashboardAll.length)).toEqual([
      ...QUERY_KEYS.dashboardAll,
    ]);
  });
});

// 절감 점검은 계획·예산·반복거래·카테고리·이름·임계값을 읽는다 — 그 변경들이 무효화하는 dashboardAll 하위에
// 있어야 /review가 옛 결과를 보여주지 않는다(예전 ["savings-review"]는 거래·보험 저장에서만 갱신됐다).
describe("savings review cache", () => {
  it("sits under the dashboard prefix", () => {
    for (const key of [QUERY_KEYS.savingsReviewAll, QUERY_KEYS.savingsReview("2026-10", "shared")]) {
      expect(key.slice(0, QUERY_KEYS.dashboardAll.length)).toEqual([...QUERY_KEYS.dashboardAll]);
    }
    expect(QUERY_KEYS.savingsReview("2026-10").slice(0, 2)).toEqual([...QUERY_KEYS.savingsReviewAll]);
  });
});

describe("persisted cache config", () => {
  it("keeps queries in memory at least as long as they are persisted", () => {
    expect(DEFAULT_GC_TIME).toBeGreaterThanOrEqual(PERSIST_MAX_AGE);
  });
});
