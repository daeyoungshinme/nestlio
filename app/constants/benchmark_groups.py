"""표준 카테고리 그룹 — 사용자가 만든 자유형식 카테고리를, 일반적인 2인 가구 지출
가이드라인과 비교 가능한 공통 단위로 태깅하기 위한 고정 목록. `Category.benchmark_group`과
`app.config.settings`의 `benchmark_{group}_warn_pct` 필드 이름이 이 dict의 키를 그대로 쓴다.
"other"는 태깅은 가능하지만 벤치마크 비교 대상이 아니다(임계값 설정이 없음)."""

BENCHMARK_GROUPS: dict[str, str] = {
    "food": "식비",
    "housing": "주거/공과금",
    "communication": "통신비",
    "transport": "교통비",
    "leisure": "여가/문화",
    "healthcare": "의료/건강",
    "education": "교육",
    "insurance": "보험",
    "other": "기타",
}

# 실제 벤치마크 비교(경고 임계값)가 있는 그룹 — "other" 제외.
COMPARABLE_BENCHMARK_GROUPS: tuple[str, ...] = tuple(g for g in BENCHMARK_GROUPS if g != "other")
