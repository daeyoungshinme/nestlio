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
