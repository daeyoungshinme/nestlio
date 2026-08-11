# app/services 컨벤션

이 디렉토리는 비즈니스 로직 계층이다. 루트 [CLAUDE.md](../../CLAUDE.md)의 `routers → services → models` 규칙에 따라, 새 기능은 여기서부터 작성한다.

## 함수 시그니처

- 클래스 없이 모듈 레벨 함수로 작성한다.
- 첫 인자는 항상 `db: Session` (SQLAlchemy 세션).
- 라우터에서 이 함수들만 호출하고, 모델을 직접 쿼리하지 않는다.

## 시간 결정론 패턴

- `datetime.now()`/`date.today()`를 서비스 내부에서 직접 호출하지 않는다.
- 시간이 필요한 함수는 `today=` 같은 파라미터로 호출부에서 명시적으로 주입받는다 (예: `recurring_service.generate_due_transactions(db, today=...)`, `notification_service.send_weekly_summary(db, today=...)`).
- 이 패턴은 테스트에서 고정 날짜를 넘겨 결정론적으로 검증하기 위한 것이므로 새 함수 추가 시에도 유지한다. 자세한 테스트 활용법은 [tests/CLAUDE.md](../../tests/CLAUDE.md) 참고.

## Google 연동 가드 (google_auth / gmail_service / google_calendar_service / google_sheets_service)

- `google_calendar_service`/`gmail_service`/`google_sheets_service.read_values`(OAuth 경로)를 호출하기 전에 반드시 `google_auth.is_connected()`로 연결 여부를 확인한다. `google_sheets_service.read_public_csv`(공개 링크 경로)는 OAuth를 쓰지 않으므로 이 가드가 필요 없다.
- 순환 의존/불필요한 부팅 비용을 피하기 위해 지연 import(함수 내부 import)를 쓰는 경우가 있다.
- 연결되지 않은 상태에서 호출되면 `GoogleNotConnectedError`를 던지므로, 호출부에서 이를 인지하고 가드 없이 직접 호출하지 않는다.

## 알림 dedup

- `notification_service`는 동일 알림 중복 발송을 막기 위해 `NotificationLog` 모델(`notif_type` + `year_month` 등의 키)에 발송 기록을 남기고 확인한다.
- 새 알림 종류를 추가할 때도 이 dedup 패턴을 따른다.

## coaching_engine.py

- 순수 계산 함수로만 구성한다 (DB 쓰기, 외부 I/O 없음). 입력은 이미 조회된 집계값들, 출력은 `Insight` dataclass.
- 임계값(경고/위험 기준)은 하드코딩하지 않고 `app/config.py`의 `settings`에서 가져온다.
- 순수 함수이기 때문에 단위 테스트가 촘촘하다 (`tests/test_coaching_engine.py`) — 새 룰 추가 시 동일하게 파라미터화 테스트로 경계값을 검증한다.

## transaction_service.py의 CSV/리포트 로직

- CSV export/import 관련 상수(`CSV_HEADER`, `CSV_TYPE_LABELS`, `CSV_TYPE_BY_LABEL`)가 파일 상단에 있다. 헤더나 라벨을 바꿀 때는 세 상수를 함께 갱신한다.
- 행 파싱/생성 로직은 `import_rows(db, rows: list[list[str]], user_id)`에 모여 있다. `import_csv`(CSV 파일 문자열)와 `import_from_sheet_url`/`import_from_spreadsheet`(구글 시트, `google_sheets_service` 경유)는 모두 이미 셀 단위로 분리된 `rows`만 만들어 이 함수에 위임하는 얇은 래퍼다 — 카테고리/구분 매칭이나 skip 처리 로직을 바꿀 때는 `import_rows` 하나만 고치면 세 경로 모두에 반영된다.
- 기간 집계 함수들(`period_totals`, `category_breakdown`, `monthly_trend`, `trailing_average_by_category` 등)도 이 파일에 모여 있다.
