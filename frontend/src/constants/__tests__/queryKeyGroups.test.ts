import { describe, expect, it } from "vitest";
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
});
