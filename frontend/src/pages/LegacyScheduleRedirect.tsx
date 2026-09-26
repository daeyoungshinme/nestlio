import { Navigate, useSearchParams } from "react-router-dom";
import { ROUTES } from "@/constants/routes";

/** 구 독립 일정 페이지 `/schedule`(`?date=YYYY-MM-DD` 포함)를 가계부 "일정" 보기로 옮긴다 — 일정은 가계부
 * 캘린더에 병합됐다. `date`가 있으면 그대로 넘겨 가계부가 그 날 모달을 연다. */
export function legacyScheduleTarget(params: URLSearchParams): string {
  const date = params.get("date");
  return date ? `${ROUTES.schedule}&date=${date}` : ROUTES.schedule;
}

export default function LegacyScheduleRedirect() {
  const [searchParams] = useSearchParams();
  return <Navigate to={legacyScheduleTarget(searchParams)} replace />;
}
