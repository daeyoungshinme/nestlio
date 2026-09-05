# nestlio

부부 전용 가계부 웹앱. UI 문구는 한국어. FastAPI JSON API 백엔드 + React/TypeScript SPA 프론트엔드(`frontend/`)로 분리된 구조이며, growlio(자산관리 앱)와 디자인 시스템·인증 방식을 공유한다.

## 기술 스택

- **백엔드**: FastAPI (JSON API, `/api/v1` 프리픽스) — 서버사이드 템플릿 렌더링 없음
- **프론트엔드**: React + TypeScript + Vite + Tailwind CSS (`frontend/`) — growlio의 디자인 시스템/컴포넌트 컨벤션을 따른다. 반응형 웹만 지원 (Capacitor/PWA 오프라인 캐싱 없음)
- **DB/ORM**: SQLAlchemy 2.0 (`Mapped`/`mapped_column` 스타일, 동기 세션), Alembic 마이그레이션 (`migrations/`)
- **설정**: pydantic-settings (`app/config.py`)
- **인증**: growlio와 동일 — 프론트엔드가 `@supabase/supabase-js`로 직접 로그인해 Supabase JWT를 발급받고, 백엔드는 `app/dependencies.py`에서 JWKS(`PyJWKClient`)로 서명만 검증한다. 백엔드에는 로그인 엔드포인트가 없다 (세션 쿠키 없음, `Authorization: Bearer <token>` 헤더만 사용)
- **스케줄링**: 예약 작업은 in-process 스케줄러가 아니라 GitHub Actions 예약 워크플로(`.github/workflows/scheduled-jobs.yml`)가 `POST /internal/jobs/{job_name}`을 호출해 실행한다 (Render 무료 웹서비스가 15분 미사용 시 슬립하기 때문). 상세는 [app/scheduler/CLAUDE.md](app/scheduler/CLAUDE.md)
- **외부 연동**: Google Calendar / Gmail API, growlio 자산 API(`app/services/growlio_client.py` — 사용자의 Supabase JWT를 그대로 전달해 호출, 별도 서비스 API 키 없음). 계좌·부동산(+담보대출) 잔액 동기화(`account_service`/`savings_product_service`/`real_estate_service`)와 재무목표 프리필(`goal_service`)은 읽기전용이지만, 저축/투자 내역 입력 시 growlio 계좌 입출금에도 반영하는 쓰기 호출(`push_transaction`, `transaction_service`)이 있다 — "읽기전용"으로 단정하지 않는다. 잔액 동기화는 자산현황 화면의 "전체 동기화" 버튼 + `auto_sync_enabled` 연동이 오래됐을 때 `GET /net-worth` 응답 후 백그라운드로 도는 기회주의적 갱신(`net_worth_service.refresh_stale_growlio_links`, 스케줄러엔 사용자 JWT가 없어서)으로 이뤄진다.

## 아키텍처

계층 규칙: `app/routers` → `app/services` → `app/models`

- 라우터는 서비스 함수만 호출한다. 모델을 직접 쿼리/수정하지 않는다.
- 모든 라우터는 `Depends(get_current_user)`(`app/dependencies.py`)로 인증하고 Pydantic `response_model`(`app/schemas/`)로 JSON을 직렬화한다. HTML/템플릿 렌더링은 없다.
- 서비스 계층의 상세 컨벤션(함수 시그니처, Google 연동 가드, 결정론적 시간 처리 등)은 [app/services/CLAUDE.md](app/services/CLAUDE.md) 참고.
- DB 세션은 `app/database.py`의 `get_db()` 의존성으로 요청 스코프에서 얻는다 (`Depends(get_db)`).
- 설정값은 `app/config.py`의 모듈 전역 `settings` 인스턴스 하나를 어디서든 import해서 쓴다. 코칭엔진 임계값(저축률, 고정비 비율, 예산 경고/위험 %, 재량지출/부채 비율, 표준 카테고리별 지출 벤치마크 등)도 여기 있다.
- 부부 전용 앱이라 로컬 `users`는 최대 2명(`app/services/user_service.py`의 `MAX_HOUSEHOLD_USERS`)으로 제한된다. 공개 회원가입 폼은 없지만, 인증된(Supabase JWT가 유효한) 요청이면 인원 상한에 도달하기 전까지는 첫 요청에서 바로 Supabase 사용자가 로컬 `User` 행으로 자동 미러링된다(`app/dependencies.py`의 `get_current_user`) — growlio처럼 같은 Supabase 프로젝트를 공유하는 계정도 이 두 자리 안에서는 초대 없이 로그인만으로 등록된다. 상한에 도달한 뒤에는 더 이상 새 계정이 생기지 않고 403이 반환된다. `app/services/invite_service.py`의 배우자 초대는 여전히 쓸 수 있지만 필수 경로는 아니다 — 표시 이름을 미리 지정해 초대장을 보내는 보조 수단으로, 초대 수락 시(`accept_invite`) 요청자의 검증된 JWT(`sub`/`email`)와 초대 이메일이 일치해야 표시 이름과 함께 `User` 행이 생성된다(클라이언트가 body로 보낸 `user_id`는 신뢰하지 않는다).

## 디렉토리별 컨벤션 (routers / schemas / models / utils)

- **routers**: 모든 라우터가 `Depends(get_current_user)`로 인증 확인, `response_model=`으로 응답 스키마를 명시한다. 없는 리소스는 `HTTPException(404)`, 잘못된 상태 전이는 `HTTPException(409)` 등으로 표현한다.
- **schemas** (`app/schemas/`): 리소스별 Pydantic 요청/응답 모델. ORM 객체를 그대로 반환해도 되도록 출력 모델은 `ConfigDict(from_attributes=True)`를 쓴다. 사용자가 지울 수 있는 금액 입력 필드(`*In` 스키마의 `target_amount` 등)는 `Decimal` 대신 `app/schemas/common.py`의 `KrwAmount`를 쓴다 — `<input type="number">`를 비우면 `e.target.value`가 빈 문자열로 전송되는데 `Decimal`은 이를 파싱하지 못해 422가 나므로, 빈 문자열을 0으로 취급하는 `BeforeValidator`가 붙어 있다.
- **models**: SQLAlchemy 2.0 스타일로 `app.database.Base` 상속. 자주 조인되는 관계는 `lazy="joined"`로 선언 (예: `Transaction.user`/`category`/`account`).
- **utils**: 날짜 연산은 반드시 `app/utils/dates.py`의 헬퍼(`month_bounds`, `year_bounds`, `shift_month`, `advance_due_date` 등)를 재사용한다. 직접 `timedelta` 연산으로 월/연 경계를 계산하지 않는다.
- **금액**: 항상 `Decimal` 사용 (float 금지).

## 실행 / 커맨드

- 로컬 프론트엔드만 실행: `cd frontend && npm run dev` (Vite, 5273 포트, `/api` 요청을 8899로 프록시)
- 개발(소스 수정 즉시 반영, HMR): `dev.sh` 인자 없이 실행 (Windows: `dev.bat`) — 백엔드(uvicorn `--reload`)와 프론트(Vite dev 서버)를 동시에 띄운다. `http://localhost:5273`으로 접속하면 프론트/백엔드 코드 수정이 재빌드·재기동 없이 바로 반영된다.
- 배포 스냅샷 실행: `dev.sh run` (Windows: `dev.bat run`) — `frontend/dist`를 정적 빌드한 뒤 uvicorn 단일 프로세스(8899 포트)로 서빙한다. 프론트 수정 시 재빌드가 필요하다 (구 `run.sh`/`run.bat`은 이 모드로 통합됨).
- 의존성 설치: 런타임은 `pip install -r requirements.txt`, 테스트/개발은 여기에 `-r requirements-dev.txt`를 더한다 (`pytest` 등 테스트 전용 의존성은 프로덕션 이미지에 넣지 않는다)
- 테스트: `pytest` (pytest 설정 파일 없음, 기본 옵션으로 동작 — 상세 컨벤션은 [tests/CLAUDE.md](tests/CLAUDE.md))
- 마이그레이션: Alembic (`alembic.ini`, `migrations/`) — 모델 변경 시 리비전 생성 필요. 배포는 `alembic upgrade head`(`render.yaml`)라 체인이 깨지면 배포 전체가 실패하므로, `tests/test_migrations.py`가 Postgres 없이도 CI에서 head 1개·down_revision 연결·base 1개를 가드한다. 2026-09-01에 51개 선형 체인을 단일 베이스라인(`bdba3c3b3277_squashed_baseline`) 하나로 스쿼시했고, 구 리비전 파일은 `migrations/versions/_archive/`에 참고용으로만 남아 있다(Alembic이 스캔하지 않음 — 자세한 건 그 디렉토리의 `README.md`). 스키마 무결성(구 체인 == 베이스라인 == 모델) 전체 검증은 `scripts/verify_migration_squash.py`(pgserver 필요).
- 배포: FastAPI가 `frontend/dist`(빌드된 SPA)를 정적 파일로 서빙하는 단일 프로세스 구조 (growlio의 nginx/Render+Vercel 분리 구조와 다른, nestlio 규모에 맞춘 의도적 단순화). Render 무료 웹서비스 1개로 배포한다 (`render.yaml` 참고) — DB는 별도로 마련할 필요 없이 growlio와 공유하는 Supabase Postgres를 그대로 쓴다. Render 무료 티어는 디스크가 완전히 휘발성이라 부부 사진은 Supabase Storage에, 구글 OAuth 토큰은 Postgres에 저장한다(아래 참고). 15분 미사용 시 슬립하므로 예약 작업은 인프로세스 스케줄러 대신 GitHub Actions가 트리거한다([app/scheduler/CLAUDE.md](app/scheduler/CLAUDE.md)).

## 환경 변수

`.env.example` 참고. 주요 그룹:
- DB: `DATABASE_URL`
- Supabase(growlio와 공유, JWT 검증용): `SUPABASE_PROJECT_URL`
- CORS: `CORS_ORIGINS` (프론트엔드 오리진 목록)
- 프론트엔드 오리진(배우자 초대 이메일의 가입 링크 조립용): `APP_BASE_URL`
- 알림: `NOTIFY_EMAIL_TO`
- 코칭엔진 임계값(0-100 %): `SAVINGS_RATE_*`, `FIXED_COST_RATIO_*`, `BUDGET_*_PCT`, `DISCRETIONARY_RATIO_WARN`, `DEBT_RATIO_WARN`, `BENCHMARK_*_WARN_PCT`(표준 카테고리별 지출 벤치마크, 설정 화면에서 부부가 직접 조정 가능)
- growlio 연동(계좌·부동산 잔액 조회/동기화, 저축·투자 거래 입출금 반영, 재무목표 프리필): `GROWLIO_API_BASE_URL` — 비어 있으면 연동 기능 전체가 꺼진다
- 부부 사진 저장용 Supabase Storage: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `MAX_UPLOAD_SIZE_MB` — 백엔드가 `/media/couple-photo`에서 프록시로 서빙한다(`app/services/couple_photo_service.py`, `app/main.py`). 둘 중 하나라도 비어 있으면 "사진 없음"으로 동작한다.
- 예약 작업 인증: `INTERNAL_JOB_SECRET` — GitHub Actions가 `/internal/jobs/{job_name}` 호출 시 `X-Internal-Job-Secret` 헤더로 보낸다.
- Google OAuth: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` — 토큰 자체는 파일이 아니라 Postgres `household.google_oauth_tokens`에 저장되며(재배포/재시작에도 유지), `scripts/google_auth_setup.py`로 최초 1회 로컬에서 연결한다.

프론트엔드 전용 컨벤션(디렉토리 구조, growlio 디자인 시스템 이식 규칙 등)은 [frontend/CLAUDE.md](frontend/CLAUDE.md) 참고.
