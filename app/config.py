import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

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

    max_upload_size_mb: float = 5

    # /internal/jobs/* 엔드포인트 인증용 공유 시크릿 (GitHub Actions 예약 워크플로가 호출)
    internal_job_secret: str = ""

    # Google OAuth (Calendar/Gmail 연동, scripts/google_auth_setup.py에서 사용)
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""


settings = Settings()

# .env.example가 그대로 복사됐을 때 조용히 "연동 죽은 채로" 부팅되는 것을 막기 위한 시동 검증.
# 값 자체는 secrets 매니저(Render)가 채우므로 여기서는 raise하지 않고 경고만 남긴다.
_PLACEHOLDERS = {
    "supabase_project_url": "https://xyzabc.supabase.co",
    "supabase_service_role_key": "your-supabase-service-role-key",
    "internal_job_secret": "change-me-to-a-random-secret",
    "google_oauth_client_id": "your-google-oauth-client-id",
    "google_oauth_client_secret": "your-google-oauth-client-secret",
    "notify_email_to": "you@example.com",
}


def _looks_like_prod() -> bool:
    """app_base_url이 localhost가 아니면 운영 배포로 간주 — 그때만 시크릿 누락을 시끄럽게 경고한다."""
    url = settings.app_base_url.lower()
    return "localhost" not in url and "127.0.0.1" not in url


if settings.database_url == Settings.model_fields["database_url"].default:
    logger.warning(
        "DATABASE_URL이 설정되지 않아 로컬 SQLite(%s)로 폴백합니다. 운영 배포라면 .env를 확인하세요.",
        settings.database_url,
    )

# INTERNAL_JOB_SECRET이 공개된 플레이스홀더 그대로면 /internal/jobs/*가 알려진 시크릿으로 열린다 —
# 환경과 무관하게 경고한다.
if settings.internal_job_secret == _PLACEHOLDERS["internal_job_secret"]:
    logger.warning(
        "INTERNAL_JOB_SECRET이 .env.example의 플레이스홀더 그대로입니다. "
        "임의의 난수 값으로 바꾸세요 (예약 작업 엔드포인트가 공개된 시크릿으로 노출됨)."
    )

if _looks_like_prod():
    _unset = [
        key
        for key, placeholder in _PLACEHOLDERS.items()
        if not getattr(settings, key) or getattr(settings, key) == placeholder
    ]
    if _unset:
        logger.warning(
            "운영 배포로 보이는데 다음 설정이 비어 있거나 플레이스홀더입니다: %s. "
            "해당 연동이 동작하지 않습니다.",
            ", ".join(sorted(_unset)),
        )
