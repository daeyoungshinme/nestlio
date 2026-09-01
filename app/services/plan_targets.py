"""연간계획류(AnnualPlanItem/SavingsProductAnnualPlan/FinancialGoal) 도메인이 공유하는 "부모 +
월별 target 테이블" 패턴의 공용 헬퍼. 각 서비스는 부모 엔티티와 target 컬럼 구성이 달라
upsert/CRUD 골격 자체는 도메인마다 따로 두지만, 아래 조각들은 모두 동일해 여기 하나로 모은다
(app/services/CLAUDE.md 참고 — growlio_client.py처럼 "공용 조각만 헬퍼로 공유하고 전체 흐름은
억지로 통합하지 않는다" 원칙을 따른다)."""
from datetime import date

from app.config import settings
from app.utils.plan_status import PlanStatus, status_from_pct


def apply_monthly_targets(parent, monthly_targets: list[dict] | None, target_cls: type) -> None:
    """year_month로 기존 월별 target 행을 매칭해 target_amount만 갱신하고, 새 월은 새로 만든다.
    빠진 월은 반환 목록에서 제외돼 delete-orphan으로 삭제된다. target_cls가 target_amount 외의
    컬럼(예: GoalMonthlyTarget.achieved_amount)을 갖고 있어도, 기존 행은 인스턴스를 그대로 재사용하고
    새 행은 모델 기본값에 맡기므로 그 값들은 건드리지 않는다."""
    existing_by_month = {mt.year_month: mt for mt in parent.monthly_targets}
    new_targets = []
    for entry in monthly_targets or []:
        year_month = entry["year_month"]
        existing = existing_by_month.get(year_month)
        if existing is not None:
            existing.target_amount = entry["target_amount"]
            new_targets.append(existing)
        else:
            new_targets.append(target_cls(year_month=year_month, target_amount=entry["target_amount"]))
    parent.monthly_targets = new_targets


def elapsed_months(year: int, today: date) -> int:
    """그 해의 몇 월까지 실적을 집계할 수 있는지 — 과거 연도는 12개월 전부, 미래 연도는 0개월."""
    if year < today.year:
        return 12
    if year > today.year:
        return 0
    return today.month


def budget_status(
    section: str, pct: float, warn_pct: float | None = None, critical_pct: float | None = None
) -> PlanStatus:
    """지출 3섹션(fixed/variable/irregular)은 실적이 계획을 초과할수록 위험, income은 반대(실적이
    계획에 못 미칠수록 위험)이므로 section에 따라 invert를 나눈다. annual_plan_service/
    cashflow_plan_service가 공유한다.

    warn_pct/critical_pct를 넘기지 않으면 env 기본값(settings)으로 폴백하지만, 호출부(라우터)는
    가구가 조정한 임계값(coaching_settings_service.get_thresholds)을 넘겨야 월간/연간 화면과
    budget_service.budget_vs_actual이 같은 기준으로 status를 매긴다."""
    warn_pct = settings.budget_warn_pct if warn_pct is None else warn_pct
    critical_pct = settings.budget_critical_pct if critical_pct is None else critical_pct
    return status_from_pct(pct, warn_pct, critical_pct, invert=(section == "income"))


def savings_status(pct: float, warn_pct: float | None = None, critical_pct: float | None = None) -> PlanStatus:
    """저축/투자 계획 달성률은 미달(실적이 계획에 못 미침)이 위험이므로 income과 같은 방향으로
    판단한다 — 새 임계값을 추가하지 않고 기존 예산 경고/위험 기준(가구 조정값 우선)을 재사용한다."""
    warn_pct = settings.budget_warn_pct if warn_pct is None else warn_pct
    critical_pct = settings.budget_critical_pct if critical_pct is None else critical_pct
    return status_from_pct(pct, warn_pct, critical_pct, invert=True)
