# tests 컨벤션

## pytest 설정

- `pyproject.toml` `[tool.pytest.ini_options]`: `--strict-markers`(오타 마커 = 에러), `filterwarnings = ["error", ...]`(deprecation 경고도 에러, 서드파티 알려진 경고만 화이트리스트). 커버리지 게이트·`pytest-randomly`는 없다.
- `conftest.py`가 `sys.path`를 조작해 `app`을 임포트한다.

## DB 픽스처

- `db_session`: 테스트마다 새 in-memory SQLite 엔진(롤백 방식이 아니라 별도 엔진). `schema_translate_map={"household": None}`으로 스키마를 떼고, `poolclass=StaticPool`을 쓴다 — TestClient는 sync 라우터를 워커 스레드에서 돌리는데 기본 풀은 스레드마다 별도 연결(= 빈 DB)을 준다.
- `seeded_db`: spouse1 유저 1명 + 카테고리 4개(food/variable, rent/fixed, events/irregular, 수입 salary/fixed)를 시드하고 `{db, user, food, rent, events, salary}`를 반환. **대부분의 테스트가 이걸 쓴다.**
- SQLite는 `VARCHAR(n)` 길이를 강제하지 않으므로 `conftest.py`의 `before_insert`/`before_update` 리스너가 `String(n)` 초과를 `AssertionError`로 잡는다.
- **자체 `SessionLocal()`을 여는 코드**(스케줄러 잡, `google_auth`, `refresh_stale_growlio_links` 같은 백그라운드 작업)는 `conftest.py`의 autouse 픽스처가 테스트 DB로 돌린다. 그런 모듈을 새로 만들면 그 픽스처에 추가한다 — 빠지면 로컬 `.env`의 **운영 DB에 붙는다**(TestClient는 `BackgroundTasks`까지 실행한다). 함수 안에서 `from app.database import SessionLocal`로 늦게 import하는 곳은 `app.database.SessionLocal` 패치로 잡힌다.

## 라우터/HTTP 테스트 (`tests/api/`)

- `test_<router>_api.py`: 라우터 파일 1:1. `client` 픽스처는 `app.dependency_overrides`로 `get_db` → `seeded_db` 세션, `get_current_user` → `seeded_db` 유저로 바꿔 "이미 인증된 요청"을 가정한다. 스키마 직렬화·상태 코드·404/409를 여기서 검증한다.
- JWKS 인증 체인 자체(헤더 파싱 → 토큰 검증 → 유저 조회/미러링, 401/403 경로)는 `tests/test_dependencies.py`에서만 본다 — `app.dependencies.verify_supabase_token`을 monkeypatch한다.
- `tests/api/test_internal_jobs_api.py`는 `JOB_REGISTRY`를 스텁으로 바꿔 인증/라우팅만, 실제 잡 본문은 `test_scheduler_jobs.py`가 본다.

## 시간 결정론

- 테스트에서 `datetime.now()`/`date.today()`를 쓰지 않는다. 서비스의 `today=`/`now=` 파라미터에 고정 날짜를 넘긴다([app/services/CLAUDE.md](../app/services/CLAUDE.md)). freezegun 등은 쓰지 않는다.

## Mocking

- `unittest.mock.patch`만 쓴다(`pytest-mock`, `responses` 등 새 라이브러리를 들이지 않는다). 대상: Gmail 발송(`app.services.notification_service.gmail_service.send_email`), Google Calendar/OAuth, growlio HTTP, Supabase Storage.

## 파일 조직

- 원칙은 서비스 모듈 1:1(`test_<module>.py`). 새 서비스 모듈을 만들면 전용 테스트 파일도 만든다.
- 예외 — 모듈을 분할하면서 테스트 파일은 나누지 않은 곳:
  - `test_transaction_service.py`: `transaction_service` + `transaction_report_service` + `transaction_trend_service`
  - `test_csv_and_accounts.py`: `account_service` + `transaction_import_service` + 연간 집계(`transaction_trend_service`)
  - `test_event_service.py`: `event_service` + `event_calendar_service` + `event_reminder_service`
  - `test_savings_product_service.py`: `savings_product_*` 세 모듈
  - `test_coaching_engine.py`: `coaching_engine` + `savings_coaching_service`
- `loan_service`/`google_sheets_service`는 전용 파일 없이 다른 테스트에서 간접 커버된다.
