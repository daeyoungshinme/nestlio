import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/app.db"

    # Supabase Auth (growlio와 같은 프로젝트를 공유 — 로그인 검증에만 사용)
    supabase_project_url: str = ""
    supabase_anon_key: str = ""
    # 부부 사진 저장용 Supabase Storage — 서비스 롤 키는 백엔드가 버킷에 직접 업/다운로드할 때만 사용
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "nestlio-media"

    notify_email_to: str = "you@example.com"

    # React SPA(dev: Vite, prod: 별도 오리진)에서의 요청을 허용
    cors_origins: list[str] = ["http://localhost:5273"]

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

    max_upload_size_mb: float = 5

    # /internal/jobs/* 엔드포인트 인증용 공유 시크릿 (GitHub Actions 예약 워크플로가 호출)
    internal_job_secret: str = ""

    # Google OAuth (Calendar/Gmail 연동, scripts/google_auth_setup.py에서 사용)
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""


settings = Settings()

if settings.database_url == Settings.model_fields["database_url"].default:
    logger.warning(
        "DATABASE_URL이 설정되지 않아 로컬 SQLite(%s)로 폴백합니다. 운영 배포라면 .env를 확인하세요.",
        settings.database_url,
    )
