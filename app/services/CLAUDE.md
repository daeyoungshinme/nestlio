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

## "리소스 없음" 처리 방식

- 주 리소스(라우터 path param으로 지정된 id)를 못 찾으면 `None`을 반환하고, 라우터가 `if x is None: raise HTTPException(404)`로 변환하는 것이 기본 규칙이다.
- 요청 바디로 참조된 보조/외부 리소스가 없거나(예: `cashflow_plan_service.link_recurring`의 `recurring_expense_id`), 상태 충돌(이미 연결됨 등)처럼 원인이 다른 404/409를 라우터가 구분해서 응답해야 하는 경우는 전용 예외 클래스를 정의해 raise한다(`notification_service`/`invite_service`가 dedup·보안 민감 플로우에서 주 리소스에도 예외를 쓰는 것은 기존 관례로 유지).
- 한 함수 안에 여러 처리 방식이 섞여 있다고 해서 자동으로 버그는 아니다 — 각 분기가 실제로 다른 HTTP 상태/원인을 구분하고 있는지 라우터 쪽까지 대조해서 판단한다.

## 알림 dedup

- `notification_service`는 동일 알림 중복 발송을 막기 위해 `NotificationLog` 모델(`notif_type` + `year_month` 등의 키)에 발송 기록을 남기고 확인한다.
- 새 알림 종류를 추가할 때도 이 dedup 패턴을 따른다.

## coaching_engine.py

- 순수 계산 함수로만 구성한다 (DB 쓰기, 외부 I/O 없음). 입력은 이미 조회된 집계값들, 출력은 `Insight` dataclass.
- 임계값(경고/위험 기준)은 하드코딩하지 않고 `app/config.py`의 `settings`에서 가져온다.
- 순수 함수이기 때문에 단위 테스트가 촘촘하다 (`tests/test_coaching_engine.py`) — 새 룰 추가 시 동일하게 파라미터화 테스트로 경계값을 검증한다.

## transaction_service.py / transaction_report_service.py / transaction_import_service.py

`transaction_service.py`는 원래 CRUD·집계·CSV import/export를 한 파일에 모두 담고 있었으나(583줄), 책임별로 3개 파일로 분리했다.

- `transaction_service.py`: CRUD(`create_transaction`/`update_transaction`/`delete_transaction`/`get_transaction`/`list_transactions`/`frequent_unique_transactions`)와 저축상품 연결 검증(`_validate_savings_link`), growlio push(`_push_growlio`)만 남는다.
- `transaction_report_service.py`: 기간 집계 함수들(`period_totals`, `totals_by_user`, `category_breakdown`, `monthly_trend`, `trailing_average_by_category`, `trailing_average_savings`, `category_monthly_trend`, `yearly_monthly_breakdown`, `yearly_totals`)이 모여 있다.
- `transaction_import_service.py`: CSV export/import 관련 상수(`CSV_HEADER`, `CSV_TYPE_LABELS`, `CSV_TYPE_BY_LABEL`)와 `export_csv`, `import_rows`, `import_csv`, `import_from_sheet_url`, `import_from_spreadsheet`가 있다. 헤더나 라벨을 바꿀 때는 세 상수를 함께 갱신한다. 행 파싱/생성 로직은 `import_rows(db, rows: list[list[str]], user_id)`에 모여 있고, `import_csv`(CSV 파일 문자열)와 `import_from_sheet_url`/`import_from_spreadsheet`(구글 시트, `google_sheets_service` 경유)는 모두 이미 셀 단위로 분리된 `rows`만 만들어 이 함수에 위임하는 얇은 래퍼다 — 카테고리/구분 매칭이나 skip 처리 로직을 바꿀 때는 `import_rows` 하나만 고치면 세 경로 모두에 반영된다.

## growlio 연동 공통 헬퍼 (growlio_client.py)

`GrowlioNotConfiguredError`/`GrowlioRequestError`/`GrowlioSyncError`는 모두 `growlio_client.py`에 단일 정의되어 있다 — account_service/savings_product_service/real_estate_service는 여기서 import해서 쓰고 새로 정의하지 않는다. 라우터에서 이 예외들을 개별적으로 catch할 필요도 없다 — `app/main.py`가 `growlio_client.register_exception_handlers(app)`로 앱 전역에서 501/502/409로 매핑한다.

가져오기(`import_from_growlio`)·동기화(`sync_*`) 로직을 새로 추가할 때는 아래 공용 헬퍼를 재사용한다:
- `growlio_client.already_linked_growlio_ids(db, model)`: 이미 연동된 growlio 계좌 id 집합 (중복 가져오기 방지)
- `growlio_client.to_decimal_krw(raw)`: growlio 응답의 `*_krw` 필드를 `Decimal`로 변환
- `growlio_client.find_by_growlio_id(items, growlio_id)`: growlio 목록 응답에서 id로 매칭 (단건 동기화용)

각 서비스의 가져오기 루프 본문(생성할 모델 필드)은 도메인마다 달라(Account는 `account_type`, SavingsProduct는 `product_type`/`principal_amount`, RealEstate는 대출 페어링까지) 그대로 두고, 위 3개 헬퍼만 공유한다 — 전체 `import_from_growlio` 함수 자체를 억지로 통합하지 않는다.

**전체 동기화(`sync_all_*`) 패턴**: `account_service.sync_all_accounts`/`savings_product_service.sync_all_from_growlio`/`real_estate_service.sync_all_from_growlio`가 공유하는 규칙 — growlio 목록은 (건별 `sync_account`/`sync_from_growlio`처럼 매번 재호출하지 않고) **1회만 조회**해 연동된 항목 전체에 매칭한다. 배우자 소유 등으로 매칭에 실패한 항목은 예외를 던져 전체를 중단시키지 않고 `{id, name, reason}` 형태로 `failed` 리스트에 담아 나머지 항목 동기화를 계속 진행하며, 반환 타입은 `tuple[동기화된_개수: int, failed: list[dict]]`로 통일한다. 새로운 growlio 연동 리소스 타입에 "전체 동기화"를 추가할 때도 이 시그니처와 부분 실패 처리 방식을 따른다.
