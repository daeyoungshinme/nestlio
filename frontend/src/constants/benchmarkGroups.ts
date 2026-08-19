import type { BenchmarkGroup } from "@/types";

// app/constants/benchmark_groups.py의 BENCHMARK_GROUPS를 손으로 미러링.
export const BENCHMARK_GROUP_LABELS: Record<BenchmarkGroup, string> = {
  food: "식비",
  housing: "주거/공과금",
  communication: "통신비",
  transport: "교통비",
  leisure: "여가/문화",
  healthcare: "의료/건강",
  education: "교육",
  insurance: "보험",
  other: "기타",
};

export const BENCHMARK_GROUP_ORDER: BenchmarkGroup[] = [
  "food",
  "housing",
  "communication",
  "transport",
  "leisure",
  "healthcare",
  "education",
  "insurance",
  "other",
];
