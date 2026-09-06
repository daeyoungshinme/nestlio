import logging
import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # "production"이면 시크릿 누락을 경고가 아니라 RuntimeError로 올린다(fail-fast). Render는
    # 컨테이너에 RENDER 환경변수를 항상 넣으므로 그것도 production 신호로 본다(_is_production).
    app_env: str = "development"

    database_url: str = "sqlite:///./data/app.db"

    # Supabase Auth (growlio와 같은 프로젝트를 공유 — JWKS로 로그인 토큰 검증에만 사용)
    supabase_project_url: str = ""
    # 부부 사진 저장용 Supabase Storage — 서비스 롤 키는 백엔드가 버킷에 직접 업/다운로드할 때만 사용
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "nestlio-media"

    notify_email_to: str = "you@example.com"

    # React SPA(dev: Vite, prod: 별도 오리진)에서의 요청을 허용
    # 5273 = Vite dev 서버, 8899 = 배포 스냅샷(dev.bat run) uvicorn 단일 프로세스
    cors_origins: list[str] = ["http://localhost:5273", "http://localhost:8899"]

    # 프론트엔드 SPA의 오리진 (초대 이메일에 넣을 가입 링크 조립용)
    app_base_url: str = "http://localhost:5273"

    # growlio(자산관리, 별도 서비스) 백엔드 — 저축상품 잔액 자동 동기화용 읽기전용 API 호출.
    # 비어 있으면 동기화 기능 자체를 비활성화한다 (savings_product_service.sync_from_growlio).
    growlio_api_base_url: str = ""

    savings_rate_warn: float = 20
    savings_rate_critical: float = 10
    fixed_cost_ratio_warn: float = 40
    fixed_cost_ratio_critical: float = 50
    budget_warn_pct: float = 90
    budget_critical_pct: float = 100
    discretionary_ratio_warn: float = 15
    debt_ratio_warn: float = 30

    # 코칭엔진 나머지 임계값 (coaching_engine.py에 하드코딩돼 있던 것 — 뜻은 그 파일 상단 주석 참고)
    emergency_fund_min_months: int = 3
    emergency_fund_target_months: int = 6
    goal_pace_critical_pct: float = 70
    goal_pace_info_pct: float = 100
    savings_execution_critical_pct: float = 50
    savings_execution_warn_pct: float = 80
    variable_trend_flag_pct: float = 20
    category_benchmark_top_n: int = 2

    # 표준 카테고리(app/constants/benchmark_groups.py)별 "일반적인 2인 가구" 지출 가이드라인.
    # 통계청 등 공식 통계 연동이 아니라 통상적으로 통용되는 참고 비율(소득 대비 %)이며,
    # 설정 화면(coaching_settings_service)에서 부부가 직접 조정할 수 있다.
    benchmark_food_warn_pct: float = 15
    benchmark_housing_warn_pct: float = 28
    benchmark_communication_warn_pct: float = 5
    benchmark_transport_warn_pct: float = 10
    benchmark_leisure_warn_pct: float = 10
    benchmark_healthcare_warn_pct: float = 6
    benchmark_education_warn_pct: float = 10
    benchmark_insurance_warn_pct: float = 8

    max_upload_size_mb: int = 5

    # /internal/jobs/* 엔드포인트 인증용 공유 시크릿 (GitHub Actions 예약 워크플로가 호출)
    internal_job_secret: str = ""

    # Google OAuth (Calendar/Gmail 연동, scripts/google_auth_setup.py에서 사용)
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""

    # 코칭 임계값은 0-100 % 범위여야 하고, warn/critical 쌍은 방향이 맞아야 한다
    # (저축률만 "낮을수록 나쁨"이라 warn > critical, 나머지는 "높을수록 나쁨"이라 warn < critical).
    # 설정 화면에서 조정 가능한 값이지만 여기 기본값의 오타는 부팅 시점에 잡는다.
    @model_validator(mode="after")
    def _validate_thresholds(self) -> "Settings":
        pct_fields = [
            name
            for name in self.__class__.model_fields
            if name.endswith(("_warn", "_critical", "_pct", "_warn_pct"))
        ]
        for name in pct_fields:
            value = getattr(self, name)
            if not 0 <= value <= 100:
                raise ValueError(f"{name}={value} — 코칭 임계값은 0-100 범위여야 합니다.")
        for hi, lo, label in (
            (self.savings_rate_warn, self.savings_rate_critical, "SAVINGS_RATE"),
            (self.goal_pace_info_pct, self.goal_pace_critical_pct, "GOAL_PACE"),
            (self.savings_execution_warn_pct, self.savings_execution_critical_pct, "SAVINGS_EXECUTION"),
        ):
            if not hi > lo:
                raise ValueError(f"{label}: '낮을수록 나쁨' 임계값은 warn/info > critical이어야 합니다.")
        for warn, crit, label in (
            (self.fixed_cost_ratio_warn, self.fixed_cost_ratio_critical, "FIXED_COST_RATIO"),
            (self.budget_warn_pct, self.budget_critical_pct, "BUDGET"),
        ):
            if not warn < crit:
                raise ValueError(f"{label}_WARN은 {label}_CRITICAL보다 작아야 합니다.")
        return self


# .env.example가 그대로 복사됐을 때 조용히 "연동 죽은 채로" 부팅되는 것을 막기 위한 시동 검증.
_PLACEHOLDERS = {
    "supabase_project_url": "https://xyzabc.supabase.co",
    "supabase_service_role_key": "your-supabase-service-role-key",
    "internal_job_secret": "change-me-to-a-random-secret",
    "google_oauth_client_id": "your-google-oauth-client-id",
    "google_oauth_client_secret": "your-google-oauth-client-secret",
    "notify_email_to": "you@example.com",
}

# 이게 비어 있거나 플레이스홀더면 앱이 정상 동작할 수 없다 — 운영에서는 fail-fast한다.
_REQUIRED_IN_PROD = ("supabase_project_url", "internal_job_secret")


def _is_production(s: "Settings") -> bool:
    return s.app_env.lower() == "production" or os.getenv("RENDER") is not None


def _placeholder_or_empty(s: "Settings", key: str) -> bool:
    value = getattr(s, key)
    return not value or value == _PLACEHOLDERS.get(key)


def validate_startup(s: "Settings") -> None:
    """비어 있으면 앱이 못 도는 설정을 부팅 시점에 검사한다. 운영에서는 RuntimeError로
    fail-fast, 개발/CI에서는 경고만."""
    on_default_db = s.database_url == Settings.model_fields["database_url"].default

    if _is_production(s):
        problems = []
        if on_default_db:
            problems.append("DATABASE_URL (로컬 SQLite로 폴백 중 — Render 디스크는 휘발성)")
        problems += [key.upper() for key in _REQUIRED_IN_PROD if _placeholder_or_empty(s, key)]
        if problems:
            raise RuntimeError(
                "운영 환경(app_env=production 또는 RENDER)인데 필수 설정이 비었습니다: " + ", ".join(problems)
            )
        stale = sorted(k.upper() for k in _PLACEHOLDERS if _placeholder_or_empty(s, k))
        if stale:
            logger.warning("운영 환경에서 다음 연동 설정이 비어 있어 동작하지 않습니다: %s", ", ".join(stale))
        return

    if on_default_db:
        logger.warning("DATABASE_URL 미설정 — 로컬 SQLite(%s)로 폴백합니다.", s.database_url)
    if _placeholder_or_empty(s, "internal_job_secret"):
        logger.warning(
            "INTERNAL_JOB_SECRET이 플레이스홀더/미설정입니다 — /internal/jobs/*가 알려진 시크릿으로 노출됩니다."
        )


settings = Settings()
validate_startup(settings)
