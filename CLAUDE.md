# nestlio

부부 전용 가계부 웹앱. UI 문구는 한국어. FastAPI JSON API(`/api/v1`) + React/TypeScript SPA(`frontend/`). growlio(자산관리 앱, `d:\project\growlio`)와 디자인 시스템·인증·Supabase 프로젝트·Postgres를 공유한다.

하위 문서 — 해당 디렉토리를 건드릴 때 먼저 읽는다:
- [app/services/CLAUDE.md](app/services/CLAUDE.md) — 서비스 계층 컨벤션, 모듈 분할, growlio 연동, 계획 데이터 모델
- [app/scheduler/CLAUDE.md](app/scheduler/CLAUDE.md) — 예약 작업(GitHub Actions 트리거)
- [tests/CLAUDE.md](tests/CLAUDE.md) — 픽스처, 시간 결정론, mocking 범위
- [frontend/CLAUDE.md](frontend/CLAUDE.md) — 프론트 구조, 라우트, 절대 규칙

## 기술 스택

- **백엔드**: FastAPI, 서버사이드 렌더링 없음. SQLAlchemy 2.0(`Mapped`/`mapped_column`, 동기 세션), Alembic(`migrations/`), pydantic-settings(`app/config.py`)
- **프론트엔드**: React + TypeScript + Vite + Tailwind. 반응형 웹만 지원(Capacitor·서비스워커 없음)
- **인증**: 프론트가 `@supabase/supabase-js`로 직접 로그인해 JWT를 받고, 백엔드는 `app/dependencies.py`에서 JWKS(`PyJWKClient`)로 서명만 검증한다. 백엔드엔 로그인 엔드포인트·세션 쿠키가 없다(`Authorization: Bearer`만)
- **예약 작업**: in-process 스케줄러가 아니라 GitHub Actions(`.github/workflows/scheduled-jobs.yml`)가 `POST /internal/jobs/{job_name}`을 호출한다(Render 무료 티어가 15분 미사용 시 슬립)
- **외부 연동**: Gmail(알림 메일 발송만 — 구글 캘린더·시트 연동은 2026-10 제거), growlio 자산 API(`app/services/growlio_client.py` — 사용자 JWT를 그대로 전달, 별도 API 키 없음). growlio 연동은 **읽기전용이 아니다** — 저축/투자 거래 입력 시 growlio 계좌에 입출금을 쓰는 `push_transaction`이 있다(실패분은 `growlio_push_service` 아웃박스가 재전송)
- **배포**: Render 무료 웹서비스 1개(`render.yaml`). FastAPI가 `frontend/dist`를 정적 서빙하는 단일 프로세스. 디스크가 휘발성이라 부부 사진은 Supabase Storage, Google OAuth 토큰은 Postgres(`household.google_oauth_tokens`)에 저장한다

## 아키텍처 규칙

- 계층: `app/routers` → `app/services` → `app/models`. 라우터는 서비스 함수만 호출하고 모델을 직접 쿼리/수정하지 않는다.
- 라우터: `Depends(get_current_user)`로 인증, `response_model=`로 응답 스키마 명시, DB 세션은 `Depends(get_db)`. 없는 리소스 404, 잘못된 상태 전이 409.
- 설정: `app/config.py`의 모듈 전역 `settings` 하나를 import해서 쓴다. 코칭엔진 임계값(저축률·고정비 비율·예산 경고/위험 %·벤치마크 등)도 여기가 기본값이고, 부부가 설정 화면에서 바꾼 값이 우선한다.
- models: `app.database.Base` 상속, 모든 테이블은 `household` 스키마. 자주 조인되는 관계는 `lazy="joined"`.
- 날짜: 월/연 경계는 `app/utils/dates.py` 헬퍼(`month_bounds`, `year_bounds`, `shift_month`, `advance_due_date` 등)로만 계산한다. 현재 시각은 `now_kst()`/`today_kst()` — `datetime.now()`/`date.today()` 직접 호출 금지(앱은 naive datetime을 KST 벽시계로 취급하는데 컨테이너는 UTC).
- 금액: 항상 `Decimal`(float 금지). 나눗셈으로 만든 금액(평균 등)은 `app/utils/money.py`의 `whole_won()`으로 원 단위 반올림한다 — 소수가 남으면 `Numeric(12,2)` 저장값과 제안값이 영원히 달라진다.

### schemas (`app/schemas/`)

- 출력 모델은 `ConfigDict(from_attributes=True)`.
- 입력(`*In`) 필드 타입은 저장 컬럼에 맞춘다: `KrwAmount`=`Numeric(12,2)`, `KrwBalance`=`Numeric(14,2)`(둘 다 음수 불가), `SignedKrwBalance`=마이너스가 정상인 계좌 잔액, `Pct`=`Numeric(5,2)`, `String(N)` 컬럼은 `bounded_str(N)`. 이유: Postgres는 범위 초과 시 500(DataError)을 내지만 테스트용 SQLite는 무시하므로 스키마에서 422로 막아야 한다. `KrwAmount` 등은 빈 문자열(비운 `<input type="number">`)을 0으로 받는다. 누락은 `tests/test_schemas_krw_amount.py::test_every_input_decimal_and_str_field_is_bounded`가 잡는다.
- 자유텍스트 컬럼을 출력에서 `Literal`로 좁힐 때는 `app/schemas/transaction.py`의 `PaymentMethodOut` 패턴(미지 값 → `"other"` 폴백 `BeforeValidator`)을 출력 타입에만 쓴다. 입력은 순수 `Literal`로 엄격하게. 안 그러면 기존 레거시 행 때문에 응답 직렬화가 500으로 터진다.
- 스키마를 바꾸면 `cd frontend && npm run generate:api-types`로 `frontend/src/types/api.generated.ts`를 갱신해 함께 커밋한다(CI `api-types-drift`). 상세는 [frontend/CLAUDE.md](frontend/CLAUDE.md).

### 가구(사용자) 모델

- 로컬 `users`는 최대 2명(`user_service.MAX_HOUSEHOLD_USERS`). 공개 가입 폼은 없지만, 유효한 Supabase JWT로 들어온 요청이면 정원이 찰 때까지 `get_current_user`가 로컬 `User` 행을 자동 미러링한다(같은 Supabase 프로젝트의 growlio 계정도 로그인만으로 등록됨). 정원이 차면 403.
- 배우자 초대(`invite_service`)는 표시 이름을 미리 정하는 보조 경로다. `accept_invite`는 body의 `user_id`가 아니라 검증된 JWT의 `sub`/`email`을 초대 이메일과 대조한다.
- 배우자 제거(`user_service.remove_user`)는 소프트 삭제(`removed_at`/`removed_by_id`) — 12개 테이블(+ `users.removed_by_id` 자기참조)이 `users.id`를 FK로 참조한다. 본인은 제거 불가(`CannotRemoveSelfError`). 제거된 계정의 요청은 401이 아니라 **403 + `user_service.REMOVED_USER_DETAIL`** 로 거부한다(401이면 프론트가 `refreshSession()` 재시도에 성공해 로그아웃되지 않음). `frontend/src/api/client.ts`가 이 문자열을 정확히 매칭하므로 **문구를 바꾸면 프론트도 같이 바꾼다**.

## 커맨드

| 목적 | 커맨드 |
|---|---|
| 의존성 | `pip install -r requirements.txt -r requirements-dev.txt` (테스트 전용 의존성은 dev 파일에만) |
| 개발 서버 | `dev.sh` / `dev.bat` (인자 없이) — uvicorn `--reload`(8899) + Vite(5273), `http://localhost:5273` 접속. HMR |
| 배포 스냅샷 | `dev.sh run` — `frontend/dist` 빌드 후 uvicorn 단일 프로세스(8899) |
| 프론트만 | `cd frontend && npm run dev` (`/api` → 8899 프록시) |
| 테스트 | `pytest` |
| 린트 | `ruff check .` (미사용 import·bugbear·import 정렬만, 포매터 전면 재정렬 안 함) |
| pre-commit | `pre-commit install` (ruff `--fix`, oxlint, 위생 훅) |

- `dev.sh`도 Windows(Git Bash) 전용이다. 8899/5273이 사용 중이면(대개 이미 떠 있는 사용자의 개발 서버) **기존 프로세스를 죽이지 않고** 다음 빈 포트로 넘어간다 — 실제 포트는 스크립트 출력으로 확인한다.
- 마이그레이션/시드는 `dev.sh migrate`로만 돈다. 로컬 `DATABASE_URL`은 대개 **운영과 공유하는 Supabase Postgres**라, 기본 실행은 `alembic upgrade head`/`scripts/seed_data.py`를 건너뛴다(머지 안 된 마이그레이션이 운영에 적용되는 사고 방지). 운영 DB는 배포(`render.yaml`)가 head로 맞춘다.
- pytest 설정(`pyproject.toml`)은 `--strict-markers`, `filterwarnings=["error", ...]`(deprecation 경고 = 에러).

## CI (`.github/workflows/ci.yml`)

백엔드: `ruff check` · `pip check` · `pip-audit` · `pytest`. `migration-drift`: `scripts/check_migration_drift.py`(임베디드 Postgres)로 모델 == 마이그레이션 head. `api-types-drift`: 스키마 ↔ `api.generated.ts`. 프론트: `npm audit --omit=dev --audit-level=high`(게이트), raw `emerald-`/`indigo-` 색상 grep 가드, `npm run lint`/`test`/`build`/`check:bundle-size`.

## 마이그레이션

- 모델을 바꾸면 Alembic 리비전을 만든다. 배포가 `alembic upgrade head`라 체인이 깨지면 배포 전체가 실패한다 — `tests/test_migrations.py`가 head 1개·base 1개·`down_revision` 연결을, CI `migration-drift`가 리비전 누락을 가드한다.
- 체인은 2026-09-01에 단일 베이스라인 `bdba3c3b3277_squashed_baseline`으로 스쿼시됐다(이전 리비전은 git 히스토리에만 있음).

## 환경 변수

전체 목록은 `.env.example`. 알아둘 것만:
- `DATABASE_URL` — 로컬도 Supabase Postgres가 필요하다. `config.py`의 SQLite 기본값은 `household` 스키마 때문에 동작하지 않는다(테스트는 `tests/conftest.py`가 `schema_translate_map={"household": None}`으로 우회).
- `TZ=Asia/Seoul` — 날짜 경계의 이중 방어(코드는 `now_kst()`로 1차 방어).
- `APP_ENV=production`(또는 Render의 `RENDER`)이면 필수 시크릿 누락 시 부팅 실패(`config.validate_startup`).
- `GROWLIO_API_BASE_URL` — 비면 growlio 연동 전체가 꺼진다.
- `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_STORAGE_BUCKET` — 둘 중 하나라도 비면 부부 사진 "없음"으로 동작(`couple_photo_service`, `/media/couple-photo` 프록시).
- `INTERNAL_JOB_SECRET` — `/internal/jobs/*`의 `X-Internal-Job-Secret` 헤더 값.
- `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` — 최초 연결은 로컬에서 `scripts/google_auth_setup.py` 1회 실행(토큰 만료·revoke 시에도 재실행).
- 코칭 임계값(`SAVINGS_RATE_*`, `BUDGET_*_PCT` 등)은 기본값을 환경별로 바꿀 때만 `.env`에 넣는다(`render.yaml`엔 두지 않는다).
