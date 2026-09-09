# nestlio

부부 전용 가계부 웹앱 (UI 문구는 한국어). FastAPI JSON API 백엔드 + React/TypeScript SPA
프론트엔드(`frontend/`)로 분리돼 있고, growlio(자산관리 앱)와 디자인 시스템·인증(Supabase)을
공유한다.

## 빠른 시작

```bash
cp .env.example .env      # DATABASE_URL 등 채우기 (growlio와 공유하는 Supabase Postgres)
./dev.sh                  # Windows: dev.bat
```

`dev.sh` 는 백엔드(uvicorn `--reload`)와 프론트(Vite dev 서버)를 함께 띄운다 —
`http://localhost:5273` 접속. `dev.sh run` 은 `frontend/dist` 정적 빌드 후 단일 프로세스(8899)로 서빙.

## 개발 문서

- **[CLAUDE.md](CLAUDE.md)** — 기술 스택, 아키텍처(계층 규칙), 실행/커맨드, 환경 변수
- [app/services/CLAUDE.md](app/services/CLAUDE.md) — 서비스 계층 컨벤션
- [app/scheduler/CLAUDE.md](app/scheduler/CLAUDE.md) — 예약 작업 (GitHub Actions 트리거)
- [tests/CLAUDE.md](tests/CLAUDE.md) — 테스트 컨벤션
- [frontend/CLAUDE.md](frontend/CLAUDE.md) — 프론트엔드 컨벤션

## 테스트 / 린트

```bash
pip install -r requirements.txt -r requirements-dev.txt
pre-commit install   # 커밋 시 ruff/oxlint/기본 위생 훅 (.pre-commit-config.yaml)
ruff check . && pytest
cd frontend && npm run lint && npm run test && npm run build
```
