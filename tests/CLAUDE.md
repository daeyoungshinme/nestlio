# tests 컨벤션

## pytest 설정

- `pytest.ini`/`pyproject.toml`/`setup.cfg` 등 pytest 설정 파일이 없다 — 기본 옵션으로 동작한다. 새로 설정을 추가하려면 왜 필요한지 먼저 확인한다.
- `conftest.py`에서 `sys.path`를 직접 조작해 `app` 패키지를 임포트한다.

## DB 픽스처

- `db_session`: 테스트마다 새로운 in-memory SQLite 엔진(`sqlite:///:memory:`)을 만들어 격리를 보장한다. 트랜잭션 롤백 방식이 아니라 아예 별도 엔진이다.
- `seeded_db`: `db_session` 위에 spouse1 유저 1명 + 카테고리 3개(food/variable, rent/fixed, events/irregular)를 시드한 뒤 `{db, user, food, rent, events}` dict를 반환한다. **대부분의 테스트는 이 픽스처를 사용한다.**

## 라우터/HTTP 테스트 (`tests/api/`)

FastAPI가 JSON API로 전환되면서 (Jinja2/HTMX 서버 렌더링 제거) 라우터 자체의 스키마 직렬화·상태 코드·404/409 처리를 검증할 곳이 필요해졌다 — 서비스 계층 단위 테스트만으로는 커버되지 않는 영역이다. 기존 "라우터 테스트 없음" 컨벤션에서 벗어난 의도적 결정이다.

- `tests/api/test_<router>_api.py`: 라우터 파일 1:1 대응. `client` 픽스처(`tests/conftest.py`)를 사용한다.
- `client` 픽스처는 `get_db`를 `seeded_db`의 세션으로, `get_current_user`를 `seeded_db`의 유저로 `app.dependency_overrides`를 통해 대체한다 — 실제 Supabase JWT를 만들 필요 없이 "이미 인증된 요청"을 가정하고 라우터 로직만 검증한다.
- `tests/test_dependencies.py`: `app/dependencies.py`의 JWKS 인증 체인(헤더 파싱 → 토큰 검증 → 유저 조회/미러링, 401 경로들) 자체를 검증하는 유일한 곳. `app.dependencies.verify_supabase_token`을 monkeypatch해서 실제 Supabase JWKS 엔드포인트를 호출하지 않는다.
- SQLite `:memory:` + `TestClient`를 함께 쓸 때는 `poolclass=StaticPool`이 필수다 (`db_session` 픽스처 참고) — TestClient가 sync 라우터를 워커 스레드에서 실행하는데, SQLite `:memory:`의 기본 풀은 스레드마다 별도 연결(= 별도 빈 DB)을 주기 때문에 `check_same_thread=False`만으로는 부족하다.

## 시간 결정론

- `datetime.now()`/`date.today()`를 테스트에서 직접 쓰지 않는다. 서비스 함수의 `today=` 파라미터(참고: [app/services/CLAUDE.md](../app/services/CLAUDE.md))에 고정 날짜를 명시적으로 넘겨서 검증한다.
- freezegun 등 시간 mock 라이브러리는 쓰지 않는다.

## Mocking 범위

- `unittest.mock.patch`로 **Gmail 발송만** mock한다 (`app.services.notification_service.gmail_service.send_email`).
- Google Calendar/OAuth(`google_calendar_service.py`, `google_auth.py`)는 테스트가 아직 없다 — 알려진 공백이며, 추가할 때는 기존처럼 `unittest.mock`만 사용하고 새 mocking 라이브러리(`pytest-mock`, `responses` 등)를 임의로 들여오지 않는다.

## 파일 조직

- 원칙은 서비스 파일 1:1 대응(`test_budget_service.py`, `test_transaction_service.py` 등)이지만 예외가 있다 — `transaction_service.py`가 CRUD/집계/CSV 세 서비스(`transaction_service`/`transaction_report_service`/`transaction_import_service`)로 분리된 뒤에도 테스트 파일은 나누지 않았다: `test_transaction_service.py`가 CRUD와 집계(`transaction_report_service`) 테스트를 함께 다루고, `test_csv_and_accounts.py`는 `account_service`와 CSV/시트 가져오기(`transaction_import_service`), 연간 집계(`transaction_report_service`) 테스트를 함께 다룬다.
- 아직 전용 테스트 파일이 없는 서비스: `category_service`, `couple_photo_service`, `user_setting_service`, `google_auth`, `google_calendar_service`, `milestone_service`. 새 테스트 파일을 만들 때 이 목록을 참고해 무분별하게 파일을 늘리지 않는다. (`loan_service`/`google_sheets_service`처럼 전용 파일은 없지만 다른 서비스 테스트 안에서 간접적으로 커버되는 경우는 이 목록에 넣지 않는다 — 진짜 공백만 추적한다.)
