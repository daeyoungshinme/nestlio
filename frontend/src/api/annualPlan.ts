import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import type { AnnualPlanItemUpsertIn, AnnualPlanListOut, AnnualPlanSeedIn } from "@/types";

export const fetchAnnualPlan = (year: number) => apiGet<AnnualPlanListOut>("/annual-plan", { params: { year } });

export const upsertAnnualPlanItem = (payload: AnnualPlanItemUpsertIn) =>
  apiPut<AnnualPlanListOut>("/annual-plan/items", payload);

export const deleteAnnualPlanItem = (id: number) => apiDelete(`/annual-plan/items/${id}`);

/** 빈 해의 연간계획을 작년 계획/반복 거래/최근 3개월 평균으로 한 번에 채운다(이미 항목이 있으면 409). */
export const seedAnnualPlan = (payload: AnnualPlanSeedIn) => apiPost<AnnualPlanListOut>("/annual-plan/seed", payload);
