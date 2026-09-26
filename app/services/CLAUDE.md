# app/services 컨벤션

이 디렉토리는 비즈니스 로직 계층이다. 루트 [CLAUDE.md](../../CLAUDE.md)의 `routers → services → models` 규칙에 따라, 새 기능은 여기서부터 작성한다.

## 함수 시그니처

- 클래스 없이 모듈 레벨 함수로 작성한다.
- 첫 인자는 항상 `db: Session` (SQLAlchemy 세션).
- 라우터에서 이 함수들만 호출하고, 모델을 직접 쿼리하지 않는다.

## 시간 결정론 패턴

- 시간이 필요한 함수는 `today=`/`now=` 파라미터로 호출부에서 주입받도록 시그니처를 만든다 (예: `recurring_service.generate_due_transactions(db, today=...)`, `notification_service.send_weekly_summary(db, today=...)`).
- **테스트는 항상 이 파라미터에 고정 날짜를 명시적으로 넘겨 검증한다** — 이게 이 패턴의 핵심 목적이다. 자세한 활용법은 [tests/CLAUDE.md](../../tests/CLAUDE.md) 참고.
- 서비스 경계에서 `today = today or today_kst()`처럼 폴백 기본값을 두는 것은 허용한다 — 라우터·스케줄러 호출부가 매번 명시하지 않아도 되게 하는 편의다. 다만 폴백에 의존하면 그 함수는 테스트 불가이므로, 새 함수를 추가할 때 실제 시간 판단(경계·경과월 계산 등)은 반드시 주입값으로 하고 폴백은 "인자 생략 시 오늘"의 얇은 방어로만 둔다.
- 스케줄러 잡(`app/scheduler/jobs.py`)은 합법적 주입 지점이다 — 잡 함수가 `today=today_kst()` / `now=now_kst()`를 명시해 서비스에 넘긴다.
- **시각은 항상 `app/utils/dates.py`의 `now_kst()`/`today_kst()`로 읽는다.** `datetime.now()`/`date.today()`를 직접 호출하지 않는다 — 앱은 naive datetime을 "KST 벽시계"로 취급하는데(`event_calendar_service`가 구글 일정을 KST naive로 저장), 배포 컨테이너 TZ는 UTC라 직접 호출하면 9시간 어긋난다. `render.yaml`이 `TZ=Asia/Seoul`을 주입해 이중으로 방어하지만, 코드에서도 헬퍼를 쓴다.

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

- DB 쓰기는 전혀 없다. 대부분의 함수는 순수 계산 함수로, 입력은 이미 조회된 집계값들이고 출력은 `Insight` dataclass다 — 이 함수들은 파라미터화 테스트로 경계값을 촘촘히 검증한다(`tests/test_coaching_engine.py`).
- 다만 `emergency_fund_context`/`compute_surplus_allocation`/`compute_insights`/`savings_pace_history` 4개는 예외로, `db: Session`을 받아 직접 조회(`savings_product_service.get_emergency_fund_balance`, `transaction_report_service.monthly_trend` 등)까지 겸하는 "DB-aware 래퍼"다 — 호출부(`app/routers/dashboard.py`)가 매번 재조회하지 않도록 조회와 순수 계산을 한데 묶어놓은 것이며, 새 순수 계산 함수를 추가할 때 이 3개까지 순수 함수로 착각하지 않는다.
- 임계값(경고/위험 기준)은 하드코딩하지 않고 `app/config.py`의 `settings`에서 가져온다.
- 예산 경고/위험 %는 가구가 설정 화면에서 바꿀 수 있으므로 예산 상태를 계산하는 곳(계획 화면 라우터, 예산 알림 메일)은 `coaching_settings_service.budget_thresholds(db)`로 꺼내 `budget_vs_actual` 등에 넘긴다 — 인자를 생략하면 env 기본값이 쓰여 화면과 알림 판정이 어긋난다.
- 새 룰 추가 시 순수 계산 함수는 동일하게 파라미터화 테스트로 경계값을 검증한다.
- **"얼마 저축할지"의 원본은 저축·투자 상품의 월 계획**(`savings_product_plan_service.planned_by_product_for_month` — `SavingsProductAnnualPlan` 그리드, 없으면 `monthly_saving_amount`)이다. 목표 페이스(`goal_pace`)·연속 달성(`savings_streak_months`)은 `savings_pace_basis`로 (실적, 목표)를 고른다: 그 달 저축·투자 계획이 있으면 **계획 대비 실제 납입액**(저축상품 연결 거래), 계획이 없는 가구만 목표들의 `monthly_saving_amount` 합 대비 수입−지출로 폴백한다. 목표의 실제 월 계획액도 같은 원본을 따른다(`goal_progress_service.planned_monthly_for_goal` — 상품 연동 목표는 상품 계획 합, `FinancialGoalOut.planned_monthly_amount`, ETA도 이 값으로 계산).

## transaction_service.py / transaction_report_service.py / transaction_import_service.py

`transaction_service.py`는 원래 CRUD·집계·CSV import/export를 한 파일에 모두 담고 있었으나(583줄), 책임별로 3개 파일로 분리했다.

- `transaction_service.py`: CRUD(`create_transaction`/`update_transaction`/`delete_transaction`/`get_transaction`/`list_transactions`/`frequent_unique_transactions`)와 저축상품 연결 검증(`_validate_savings_link`), growlio push(`_push_growlio`)만 남는다.
- `transaction_report_service.py`: 기간 집계 함수들(`period_totals`, `totals_by_owner`, `category_breakdown`/`category_breakdown_by_owner`, `owner_spending_detail`, `rank_owner_contributions`, `monthly_trend`, `trailing_average_by_category`, `trailing_average_by_section`, `category_monthly_trend`, `yearly_monthly_breakdown`, `yearly_totals`)이 모여 있다. `Transaction.user_id`(누가 "기록했는지" — `category_breakdown(user_id=...)`)와 `*_by_owner`(`Transaction.owner_user_id`, 실제 소비 주체 — 공통 지출은 `NULL`)는 서로 다른 축이다: 배우자가 서로 대신 입력해주는 경우가 있어 "부부별 지출" 표시(대시보드/연간리포트)는 `user_id`가 아니라 `by_owner` 계열을 쓴다. 새 집계 함수를 추가할 때 어느 축이 필요한지 먼저 확인한다.
- `transaction_import_service.py`: CSV export/import 관련 상수(`CSV_HEADER`, `CSV_TYPE_LABELS`, `CSV_TYPE_BY_LABEL`)와 `export_csv`, `import_rows`, `import_csv`, `import_from_sheet_url`, `import_from_spreadsheet`가 있다. 헤더나 라벨을 바꿀 때는 세 상수를 함께 갱신한다. 행 파싱/생성 로직은 `import_rows(db, rows: list[list[str]], user_id)`에 모여 있고, `import_csv`(CSV 파일 문자열)와 `import_from_sheet_url`/`import_from_spreadsheet`(구글 시트, `google_sheets_service` 경유)는 모두 이미 셀 단위로 분리된 `rows`만 만들어 이 함수에 위임하는 얇은 래퍼다 — 카테고리/구분 매칭이나 skip 처리 로직을 바꿀 때는 `import_rows` 하나만 고치면 세 경로 모두에 반영된다.

## event_service.py / event_calendar_service.py / event_reminder_service.py

`event_service.py`는 원래 CRUD·구글 캘린더 연동·리마인더를 한 파일에 모두 담고 있었으나(426줄), 책임별로 3개 파일로 분리했다(`transaction_service`/`savings_product_service`의 분할과 동일한 동기).

- `event_service.py`: CRUD(`create_event`/`update_event`/`delete_event`/`get_event`/`set_completed`)와 반복일정 전개(`occurrences_in_range`), `to_out_dict`, `ImportedEventReadOnlyError`만 남는다.
- `event_calendar_service.py`: 구글 캘린더 연동(`import_from_google`/`sync_to_google`/`remove_from_google`/`_parse_google_event`)이 모여 있다.
- `event_reminder_service.py`: 리마인더(`send_due_reminders`/`_due_occurrences`/`_already_notified_pairs`/`_log_notified`/`_send_reminder_email`)와 배우자 알림(`notify_other_spouse`)이 모여 있다. `_due_occurrences`는 `event_service.occurrences_in_range`를 그대로 재사용한다.
- `event_service.create_event`/`update_event`/`delete_event`는 저장 직후 `event_calendar_service.sync_to_google`/`remove_from_google`과 `event_reminder_service.notify_other_spouse`를 호출해야 하는데, 이 두 모듈이 반대로 `event_service.occurrences_in_range`를 참조하므로 core가 이 둘을 모듈 상단에서 import하면 순환 의존이 생긴다 — 위 "Google 연동 가드" 절의 지연 import 관례를 그대로 가져와 `create_event`/`update_event`/`delete_event` 함수 본문에서만 import한다.
- 테스트 파일은 나누지 않았다(`tests/CLAUDE.md`에 명시) — `tests/test_event_service.py` 하나가 세 모듈을 모두 다룬다.

## savings_product_service.py / savings_product_plan_service.py / savings_product_growlio_service.py

`savings_product_service.py`는 원래 CRUD·연간계획 집계·growlio 동기화를 한 파일에 모두 담고 있었으나(501줄), 책임별로 3개 파일로 분리했다(`transaction_service`의 3분할과 동일한 동기).

- `savings_product_service.py`: CRUD(`create_product`/`update_product`/`deactivate_product`/`adjust_balance`/`set_growlio_link`)와 조회(`list_products`, `get_emergency_fund_balance`)만 남는다.
- `savings_product_plan_service.py`: 연간계획/실적 집계 함수들(`get_annual_plan`/`upsert_annual_plan`/`compute_plan_summary`/`compute_annual_plan_summary`/`actuals_for_month`/`actuals_for_year`/`trailing_average_actuals`)이 모여 있다. `PLAN_PRODUCT_TYPES`(부동산 제외 저축/투자 두 타입) 상수도 여기 있다.
- `savings_product_growlio_service.py`: growlio 연동 함수들(`list_growlio_accounts`/`sync_from_growlio`/`sync_all_from_growlio`/`import_from_growlio`)이 모여 있다.
- 세 파일 모두 상품 목록 조회가 필요하면 `savings_product_service.list_products(db)`를 그대로 재사용한다 — 별도 쿼리를 새로 만들지 않는다.
- 테스트 파일은 나누지 않았다(`tests/CLAUDE.md`에 명시) — `tests/test_savings_product_service.py`가 세 모듈을 모두 다룬다.

## goal_service.py / goal_progress_service.py

`goal_service.py`는 원래 CRUD·챌린지 동기화·진행률/ETA 계산을 한 파일에 모두 담고 있었으나(454줄), 책임별로 2개 파일로 분리했다(`transaction_service`/`savings_product_service`의 분할과 동일한 동기이지만, growlio 연동이 `fetch_growlio_goal_settings` 단일 함수뿐이라 3분할은 하지 않았다).

- `goal_service.py`: CRUD(`create_goal`/`update_goal`/`delete_goal`/`list_goals`/`get_goal`/`update_monthly_target_achieved`), 챌린지 상태 동기화(`sync_challenge_statuses`, `_apply_challenge_completion`), 연동 관리(`_apply_funding_sources`, `_sync_funding_product_monthly_amount`), `fetch_growlio_goal_settings`, 예외 클래스(`MonthlyTargetNotFoundError`, `DuplicateFundingSourceProductError`)만 남는다.
- `goal_progress_service.py`: 진행률/ETA 계산 함수들(`funding_source_breakdown`/`current_amount_from_breakdown`/`compute_current_amount`/`compute_linked_monthly_achieved`/`compute_progress_pct`/`effective_status`/`compute_months_remaining`/`compute_suggested_monthly_amount`/`compute_eta_year_month`/`compute_ahead_behind_months`/`to_out`)이 모여 있다. 순수하게 읽기 전용이라 DB를 쓰지 않는다(`compute_current_amount` 등이 조회는 하지만 커밋하지 않음).
- `goal_service.py`가 `_apply_challenge_completion`(완료 판정)에서 `goal_progress_service.compute_current_amount`를 호출하는 단방향 의존이다 — `goal_progress_service`는 `goal_service`를 참조하지 않는다.
- 테스트 파일은 나누지 않았다(`tests/CLAUDE.md`에 명시) — `tests/test_goal_service.py`/`tests/test_financial_plan_services.py`가 두 모듈을 모두 다룬다.

## notification_service.py / notification_inbox_service.py

`notification_service.py`는 원래 발송/알림 판정 로직과 인박스(읽음/반응) 로직을 한 파일에 모두 담고 있었으나(425줄), 책임별로 2개 파일로 분리했다(`goal_service`와 동일한 2분할 동기 — growlio류 연동이 없어 이쪽도 3분할 대상이 아니다).

- `notification_service.py`: 이메일 발송/알림 판정 로직(`send_weekly_summary`/`send_monthly_summary`/`check_and_alert_budget_threshold`/`check_and_celebrate_goal_milestone`/`check_all_goal_milestones`/`check_all_categories_threshold`/`check_savings_pace_reminder` — 월말 3일 전 이번 달 저축·투자 계획 미달분 알림, 월 1회 dedup)만 남는다. 위 "알림 dedup" 절이 설명하는 `NotificationLog` 기반 dedup 헬퍼(`already_sent`/`log_sent`)는 `notification_log_service.py`로 분리돼 있다 — `milestone_service`(목표 달성 축하, 마일스톤 값을 기간 키로 사용)도 같은 헬퍼를 쓰므로, `notification_service`를 import하면 순환 의존이 되는 모듈에서도 쓸 수 있게 따로 뒀다.
- `notification_inbox_service.py`(신규): 알림 목록/읽음/반응 CRUD(`list_notifications`/`add_reaction`/`remove_reaction`/`unread_count`/`mark_read`/`mark_all_read`)와 목표 응원(`send_goal_cheer` — `goal_cheer` 알림 + 보낸 사람 리액션 + 본인 읽음 처리), `REACTION_EMOJIS` 상수, 예외 클래스(`NotificationError`, `NotificationNotFoundError`, `InvalidReactionError`)가 모여 있다.
- 두 모듈 사이에 의존 관계는 없다(서로 import하지 않음) — 알림을 "발송"하는 것과 발송된 알림을 "조회/읽음 처리"하는 것은 완전히 분리된 관심사다.
- 테스트 파일은 나누지 않았다(`tests/CLAUDE.md`에 명시) — `tests/test_notification_service.py`가 두 모듈을 모두 다룬다.

## growlio 연동 공통 헬퍼 (growlio_client.py)

`GrowlioNotConfiguredError`/`GrowlioRequestError`/`GrowlioSyncError`는 모두 `growlio_client.py`에 단일 정의되어 있다 — account_service/savings_product_growlio_service/real_estate_service는 여기서 import해서 쓰고 새로 정의하지 않는다. 라우터에서 이 예외들을 개별적으로 catch할 필요도 없다 — `app/main.py`가 `growlio_client.register_exception_handlers(app)`로 앱 전역에서 501/502/409로 매핑한다.

growlio에서 받아 쓰는 값: 계좌 평가액·원금(`fetch_account_balances` — 투자 상품 동기화/가져오기 시 `invested_amount_krw`를 `principal_amount`로 채워 수익·수익률이 계산된다, `savings_product_growlio_service._apply_balance`. 원금이 없는 응답이면 기존 원금 유지), 부동산 시세·대출(`fetch_real_estate_items`), 투자목표 설정(`fetch_investment_goal`, 목표 폼 프리필 — 목표 수익률은 `FinancialGoal.expected_annual_return_pct`로), 수익률 KPI(`fetch_performance`)와 목표 달성 가능성 역산(`fetch_goal_feasibility`) — 뒤의 둘은 `goal_service.fetch_growlio_insight` → `GET /financial-goals/{id}/growlio-insight`가 목표 상세 "투자 수익을 반영하면?" 카드에 묶어 준다. 목표의 복리 ETA(`goal_progress_service.compute_eta_with_return`, 50년 상한)는 growlio 호출 없이 nestlio가 계산한다.

가져오기(`import_from_growlio`)·동기화(`sync_*`) 로직을 새로 추가할 때는 아래 공용 헬퍼를 재사용한다:
- `growlio_client.already_linked_growlio_ids(db, model)`: 이미 연동된 growlio 계좌 id 집합 (중복 가져오기 방지)
- `growlio_client.to_decimal_krw(raw)`: growlio 응답의 `*_krw` 필드를 `Decimal`로 변환
- `growlio_client.find_by_growlio_id(items, growlio_id)`: growlio 목록 응답에서 id로 매칭 (단건 동기화용)

각 서비스의 가져오기 루프 본문(생성할 모델 필드)은 도메인마다 달라(Account는 `account_type`, SavingsProduct는 `product_type`/`principal_amount`, RealEstate는 대출 페어링까지) 그대로 두고, 위 3개 헬퍼만 공유한다 — 전체 `import_from_growlio` 함수 자체를 억지로 통합하지 않는다.

**전체 동기화(`sync_all_*`) 패턴**: `account_service.sync_all_accounts`/`savings_product_growlio_service.sync_all_from_growlio`/`real_estate_service.sync_all_from_growlio`가 공유하는 규칙 — growlio 목록은 (건별 `sync_account`/`sync_from_growlio`처럼 매번 재호출하지 않고) **1회만 조회**해 연동된 항목 전체에 매칭한다. 배우자 소유 등으로 매칭에 실패한 항목은 예외를 던져 전체를 중단시키지 않고 `{id, name, reason}` 형태로 `failed` 리스트에 담아 나머지 항목 동기화를 계속 진행하며, 반환 타입은 `tuple[동기화된_개수: int, failed: list[dict]]`로 통일한다. 새로운 growlio 연동 리소스 타입에 "전체 동기화"를 추가할 때도 이 시그니처와 부분 실패 처리 방식을 따른다.

**기회주의적 갱신(`net_worth_service.refresh_stale_growlio_links`)**: `auto_sync_enabled`인데 `last_synced_at`이 `STALE_GROWLIO_LINK_AFTER`(12h)보다 오래된 SavingsProduct/Loan 연동(호출자 소유 또는 공동 소유만 — 배우자 항목은 호출자 JWT로 매칭되지 않아 영원히 stale로 남으므로 제외)이 있으면, `GET /net-worth`·`GET /dashboard/bootstrap` 응답 후 FastAPI `BackgroundTasks`로 저축/투자·부동산 `sync_all_from_growlio`를 `auto_sync_only=True, owner_user_id=<호출자>`로 조용히 실행한다. 자동 동기화를 끈 항목(짝 대출 포함)의 직접 입력 잔액은 덮어쓰지 않고, **은행 계좌(`sync_all_accounts`)는 돌리지 않는다** — 계좌 동기화는 `initial_balance`를 역산 재기준하므로 사용자가 누르는 수동 동기화 전용이다(`models/account.py` 주석). 스케줄러에는 사용자 Supabase JWT가 없어(app/scheduler/CLAUDE.md) 예약 작업으로는 growlio 잔액 동기화를 못 하기 때문에 택한 방식이다. fire-and-forget이라 절대 raise하지 않고(요청 스코프 세션이 응답 후 닫히므로 자체 `SessionLocal()`을 연다), growlio 미설정/접속 실패면 조용히 중단한다.

## 연간계획류 공용 헬퍼 (plan_targets.py)

`AnnualPlanItem`/`SavingsProductAnnualPlan`/`FinancialGoal` 도메인 모두 "부모 엔티티 + 월별 target 테이블" 구조를 갖고 있어, `annual_plan_service`/`savings_product_service`/`goal_service`/`cashflow_plan_service`/`budget_service`가 `app/services/plan_targets.py`의 아래 헬퍼를 공유한다 — growlio 연동 공용 헬퍼(`growlio_client.py`)와 같은 원칙으로, 도메인별 upsert/CRUD 골격 자체는 억지로 통합하지 않고 정말 동일한 조각만 뽑았다. (편집 가능한 가구 공동 "연간 순저축 목표" `AnnualSavingsGoal`은 제거됐다 — "얼마 저축할지" 모델 중복을 줄이면서 연간계획 `AnnualPlanItem`의 "저축 가능액(계획 수입 − 계획 지출)"과 `SavingsProductAnnualPlan`로 일원화. growlio가 읽던 `/external/annual-savings-goals`도 소비자가 없어 라우터째 삭제.)

- `apply_monthly_targets(parent, monthly_targets, target_cls)`: year_month로 기존 월별 target 행을 매칭해 갱신/생성하고 빠진 월은 delete-orphan으로 삭제한다. `GoalMonthlyTarget.achieved_amount`처럼 target_amount 외의 컬럼이 있어도 기존 행은 그대로 재사용하므로 건드리지 않는다.
- `elapsed_months(year, today)`: 그 해의 몇 월까지 실적을 집계할 수 있는지.
- `budget_status(section, pct)` / `savings_status(pct)`: `utils/plan_status.status_from_pct`를 감싸는 임계값 판정 래퍼 — `budget_status`는 section이 `"income"`일 때만 invert(annual_plan_service/cashflow_plan_service가 공유), `savings_status`는 항상 invert(savings_product_plan_service 전용).

새 "부모 + 월별 target" 도메인을 추가할 때도 이 4개를 먼저 재사용할 수 있는지 확인한다.

## 계획 원본은 연간계획 하나 (annual_plan_service ↔ cashflow_plan_service)

현금흐름 계획(수입/고정/변동/비정기)의 원본은 `AnnualPlanItem` + `AnnualPlanItemMonthlyTarget` 하나뿐이다. 구 월간 테이블 `CashflowPlanItem`은 2026-09 마이그레이션 `0db19c3552b1`로 연간계획에 흡수·삭제됐다 — 조회 시점 폴백으로만 이어져 있어 한 번 저장한 달이 연간계획과 끊기고, `budget_service`가 월간 행만 읽어 연간계획에만 있는 카테고리 예산이 예산 경고·코칭에서 0으로 빠지는 문제가 있었다.

- `cashflow_plan_service`는 연간계획을 **한 달 단면으로 읽고 쓰는** 얇은 서비스다. `list_items(db, ym)`은 그 달 target이 있는 연간 항목을 `MonthPlanItem`(id = `AnnualPlanItem.id`)으로 돌려준다. `upsert_item`은 항목 정보(이름·섹션·카테고리·소유자)는 모든 달 공통으로, 금액은 **그 달 target만** 바꾼다(`annual_plan_service.set_month_target` — 적용 기간 밖의 달이면 start/end_month를 넓힌다). id 없이 저장하면 그 달에만 금액이 있는 새 항목이 된다. `delete_month`는 그 달 target만 지우고 마지막 달이면 항목째 삭제한다.
- 할부(`split_item_into_months`)는 남은 달에 target을 나눠 가진 항목 **하나**다(`installment_total`/`installment_total_amount`, 회차는 `installment_no_for(ym)`으로 계산). 한 해를 넘기면 `ValueError` — 라우터가 그 해 남은 달 수만 넘긴다.
- 반복거래 연동(`recurring_expense_id`)은 항목 단위다. 연동되면 target이 있는 모든 달의 금액·카테고리가 반복거래 값으로 read-through된다(`AnnualPlanItem.amount_for`/`effective_category*`). **SQL 집계는 이 파이썬 프로퍼티를 거치지 않으므로** `plan_targets.EFFECTIVE_TARGET_AMOUNT`/`EFFECTIVE_CATEGORY_ID` 식과 `plan_targets.join_recurring(query)`를 반드시 함께 쓴다(`budget_service.get_budgets_for_month`, `annual_plan_service._section_monthly_targets`/`category_budgets_for_year`).
- `copy_from_previous_month`의 중복 판정은 `_budget_line_key`(카테고리 태깅 항목은 `(section, category_id)` "카테고리당 한 줄", 자유 텍스트는 `(section, name)`)다. 1월로 복사할 때(전월이 작년)는 올해의 같은 항목(`_item_key` = `(section, category_id, name)`)을 찾아 쓰거나 새로 만든다.
- 저축·투자는 이 모델에 포함하지 않는다 — `SavingsProduct` + `SavingsProductAnnualPlan`(`savings_product_plan_service`)이 원본이다.
