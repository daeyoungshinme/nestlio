from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/app.db"

    # Supabase Auth (growlio와 같은 프로젝트를 공유 — 로그인 검증에만 사용)
    supabase_project_url: str = ""
    supabase_anon_key: str = ""

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

    upload_dir: str = "data/uploads"
    max_upload_size_mb: float = 5


settings = Settings()
