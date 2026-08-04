# nestlio

부부 전용 가계부 웹앱. UI 문구는 한국어. FastAPI JSON API 백엔드 + React/TypeScript SPA 프론트엔드(`frontend/`)로 분리된 구조이며, growlio(자산관리 앱)와 디자인 시스템·인증 방식을 공유한다.

## 기술 스택

- **백엔드**: FastAPI (JSON API, `/api/v1` 프리픽스) — 서버사이드 템플릿 렌더링 없음
- **프론트엔드**: React + TypeScript + Vite + Tailwind CSS (`frontend/`) — growlio의 디자인 시스템/컴포넌트 컨벤션을 따른다. 반응형 웹만 지원 (Capacitor/PWA 오프라인 캐싱 없음)
- **DB/ORM**: SQLAlchemy 2.0 (`Mapped`/`mapped_column` 스타일, 동기 세션), Alembic 마이그레이션 (`migrations/`)
- **설정**: pydantic-settings (`app/config.py`)
- **인증**: growlio와 동일 — 프론트엔드가 `@supabase/supabase-js`로 직접 로그인해 Supabase JWT를 발급받고, 백엔드는 `app/dependencies.py`에서 JWKS(`PyJWKClient`)로 서명만 검증한다. 백엔드에는 로그인 엔드포인트가 없다 (세션 쿠키 없음, `Authorization: Bearer <token>` 헤더만 사용)
- **스케줄링**: APScheduler — 상세는 [app/scheduler/CLAUDE.md](app/scheduler/CLAUDE.md). 웹/인증 계층과 완전히 분리되어 있음 (자체 DB 세션 사용)
- **외부 연동**: Google Calendar / Gmail API

## 아키텍처

계층 규칙: `app/routers` → `app/services` → `app/models`

- 라우터는 서비스 함수만 호출한다. 모델을 직접 쿼리/수정하지 않는다.
- 모든 라우터는 `Depends(get_current_user)`(`app/dependencies.py`)로 인증하고 Pydantic `response_model`(`app/schemas/`)로 JSON을 직렬화한다. HTML/템플릿 렌더링은 없다.
- 서비스 계층의 상세 컨벤션(함수 시그니처, Google 연동 가드, 결정론적 시간 처리 등)은 [app/services/CLAUDE.md](app/services/CLAUDE.md) 참고.
- DB 세션은 `app/database.py`의 `get_db()` 의존성으로 요청 스코프에서 얻는다 (`Depends(get_db)`).
- 설정값은 `app/config.py`의 모듈 전역 `settings` 인스턴스 하나를 어디서든 import해서 쓴다. 코칭엔진 임계값(저축률, 고정비 비율, 예산 경고/위험 %, 재량지출/부채 비율 등)도 여기 있다.
- 부부 전용 앱이라 로컬 `users`는 최대 2명으로 제한된다. 공개 회원가입 폼은 없고, 계정은 (1) 최초 1명은 앱 밖에서 수동 준비되거나 (2) 이미 등록된 사용자가 `app/services/invite_service.py`로 배우자를 초대해 늘어난다 — 초대 수락 시(`accept_invite`) 표시 이름과 함께 `User` 행이 즉시 생성된다. 그 외의 경우(초대 없이 유효한 Supabase JWT로 처음 접근) 첫 인증된 요청 시 Supabase 사용자를 로컬 `User` 행으로 미러링한다 (`app/dependencies.py`의 `get_current_user`) — 이 자동 미러링에는 허용 목록이 없다는 점에 유의(같은 Supabase 프로젝트를 쓰는 growlio 계정도 통과됨), 초대 기능은 이 부분을 바꾸지 않는다.

## 디렉토리별 컨벤션 (routers / schemas / models / utils)

- **routers**: 모든 라우터가 `Depends(get_current_user)`로 인증 확인, `response_model=`으로 응답 스키마를 명시한다. 없는 리소스는 `HTTPException(404)`, 잘못된 상태 전이는 `HTTPException(409)` 등으로 표현한다.
- **schemas** (`app/schemas/`): 리소스별 Pydantic 요청/응답 모델. ORM 객체를 그대로 반환해도 되도록 출력 모델은 `ConfigDict(from_attributes=True)`를 쓴다.
- **models**: SQLAlchemy 2.0 스타일로 `app.database.Base` 상속. 자주 조인되는 관계는 `lazy="joined"`로 선언 (예: `Transaction.user`/`category`/`account`).
- **utils**: 날짜 연산은 반드시 `app/utils/dates.py`의 헬퍼(`month_bounds`, `year_bounds`, `shift_month`, `advance_due_date` 등)를 재사용한다. 직접 `timedelta` 연산으로 월/연 경계를 계산하지 않는다.
- **금액**: 항상 `Decimal` 사용 (float 금지).

## 실행 / 커맨드

- 로컬 프론트엔드만 실행: `cd frontend && npm run dev` (Vite, 5273 포트, `/api` 요청을 8899로 프록시)
- 개발(소스 수정 즉시 반영, HMR): `dev.sh` 인자 없이 실행 (Windows: `dev.bat`) — 백엔드(uvicorn `--reload`)와 프론트(Vite dev 서버)를 동시에 띄운다. `http://localhost:5273`으로 접속하면 프론트/백엔드 코드 수정이 재빌드·재기동 없이 바로 반영된다.
- 배포 스냅샷 실행: `dev.sh run` (Windows: `dev.bat run`) — `frontend/dist`를 정적 빌드한 뒤 uvicorn 단일 프로세스(8899 포트)로 서빙한다. 프론트 수정 시 재빌드가 필요하다 (구 `run.sh`/`run.bat`은 이 모드로 통합됨).
- 테스트: `pytest` (pytest 설정 파일 없음, 기본 옵션으로 동작 — 상세 컨벤션은 [tests/CLAUDE.md](tests/CLAUDE.md))
- 마이그레이션: Alembic (`alembic.ini`, `migrations/`) — 모델 변경 시 리비전 생성 필요
- 배포: FastAPI가 `frontend/dist`(빌드된 SPA)를 정적 파일로 서빙하는 단일 프로세스 구조 (growlio의 nginx 분리 구조와 다른, nestlio 규모에 맞춘 의도적 단순화)

## 환경 변수

`.env.example` 참고. 주요 그룹:
- DB: `DATABASE_URL`
- Supabase(growlio와 공유, 로그인/JWT 검증용): `SUPABASE_PROJECT_URL`, `SUPABASE_ANON_KEY`
- CORS: `CORS_ORIGINS` (프론트엔드 오리진 목록)
- 프론트엔드 오리진(배우자 초대 이메일의 가입 링크 조립용): `APP_BASE_URL`
- 알림: `NOTIFY_EMAIL_TO`
- 코칭엔진 임계값(0-100 %): `SAVINGS_RATE_*`, `FIXED_COST_RATIO_*`, `BUDGET_*_PCT`, `DISCRETIONARY_RATIO_WARN`, `DEBT_RATIO_WARN`

Google OAuth 관련 파일(`data/token.json`, `data/client_secret.json`)은 `.gitignore` 처리되어 있으며 `scripts/google_auth_setup.py`로 최초 설정한다.

프론트엔드 전용 컨벤션(디렉토리 구조, growlio 디자인 시스템 이식 규칙 등)은 [frontend/CLAUDE.md](frontend/CLAUDE.md) 참고.
