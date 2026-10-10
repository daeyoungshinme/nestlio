# app/services 컨벤션

비즈니스 로직 계층. 루트 [CLAUDE.md](../../CLAUDE.md)의 `routers → services → models` 규칙에 따라 새 기능은 여기서부터 작성한다.

## 함수 시그니처

- 클래스 없이 모듈 레벨 함수. 첫 인자는 항상 `db: Session`.

## 시간 결정론

- 시간이 필요한 함수는 `today=`/`now=` 파라미터로 주입받는다(예: `recurring_service.generate_due_transactions(db, today=...)`). 테스트는 여기에 고정 날짜를 넘긴다 — 이 패턴의 핵심 목적이다.
- `today = today or today_kst()` 같은 폴백은 "인자 생략 시 오늘"의 얇은 방어로만 허용한다. 경계·경과월 계산 등 실제 판단은 주입값으로 한다.
- 시각은 `app/utils/dates.py`의 `now_kst()`/`today_kst()`로만 읽는다. 스케줄러 잡이 합법적 주입 지점이다.

## "리소스 없음" 처리

- 주 리소스(path param id)를 못 찾으면 `None` 반환 → 라우터가 404로 변환하는 게 기본.
- 요청 바디로 참조된 보조 리소스가 없거나 상태 충돌(이미 연결됨 등)처럼 라우터가 404/409를 구분해야 하면 전용 예외 클래스를 raise한다(`notification_service`/`invite_service`가 주 리소스에도 예외를 쓰는 건 기존 관례로 유지).
- 한 함수에 두 방식이 섞여 있다고 자동으로 버그는 아니다 — 라우터까지 대조해 각 분기가 실제로 다른 상태를 구분하는지 본다.

## Google 연동 가드

- `google_calendar_service`/`gmail_service`/`google_sheets_service.read_values`(OAuth)를 부르기 전에 `google_auth.is_connected()`를 확인한다. 미연결이면 `GoogleNotConnectedError`. `google_sheets_service.read_public_csv`는 OAuth를 안 써서 가드가 필요 없다.
- 알림 메일은 `gmail_service.send_email`을 직접 부르지 않고 `notification_service._send_email_best_effort`를 거친다 — 가드 + `GoogleAuthError`/`GmailSendError`를 경고 로그로 흡수해 메일 실패가 인앱 알림이나 예약 잡을 막지 않게 한다. 사용자가 직접 누른 발송(테스트 메일, 초대장)은 반대로 예외를 라우터까지 올린다.
- 순환 의존·부팅 비용을 피하려고 함수 내부 지연 import를 쓰는 곳이 있다.

## 알림 dedup

- 같은 알림의 중복 발송은 `NotificationLog`(`notif_type` + 기간 키) 기록으로 막는다. 헬퍼(`already_sent`/`log_sent`)는 `notification_log_service.py`에 있다(`milestone_service`처럼 `notification_service`를 import하면 순환이 되는 모듈도 쓰기 위해 분리). 새 알림 종류도 이 패턴을 따른다.

## 모듈 분할 지도

큰 서비스는 책임별로 나뉘어 있다. 의존 방향을 거꾸로 만들면 순환 import가 생긴다.

| 묶음 | 모듈과 책임 | 주의 |
|---|---|---|
| 거래 | `transaction_service`(CRUD, 저축상품 연결 검증, growlio push) · `transaction_report_service`(한 기간 집계, 공용 쿼리 조각) · `transaction_trend_service`(여러 달 시계열·평균, 범위 1회 조회 후 달별 버킷팅) · `transaction_import_service`(CSV/시트 import·export) | 아래 "누가 기록했나 vs 누가 썼나" 참고 |
| 일정 | `event_service`(CRUD, 반복 전개 `occurrences_in_range`) · `event_calendar_service`(구글 캘린더) · `event_reminder_service`(리마인더, 배우자 알림) | 뒤 둘이 `event_service`를 import하므로 `event_service`는 이 둘을 함수 본문에서만 지연 import |
| 저축상품 | `savings_product_service`(CRUD, `list_products`, `get_emergency_fund_balance`) · `savings_product_plan_service`(연간계획·실적, `PLAN_PRODUCT_TYPES`) · `savings_product_growlio_service`(growlio 동기화) | 상품 목록은 항상 `list_products(db)` 재사용 |
| 목표 | `goal_service`(CRUD, 챌린지 상태 동기화, 자금원 연동, growlio 조회) · `goal_progress_service`(진행률·ETA·`to_out`, 커밋 없음) | `goal_service` → `goal_progress_service` 단방향 |
| 알림 | `notification_service`(발송·판정) · `notification_inbox_service`(목록·읽음·반응·목표 응원) · `notification_log_service`(dedup) | 앞 둘은 서로 import하지 않음 |
| 코칭 | `coaching_engine`(규칙 기반 `Insight`, `compute_insights`) · `savings_coaching_service`(여유자금 배분, 비상금, 저축 페이스·연속 달성) | `coaching_engine` → `savings_coaching_service` 단방향 |

- `transaction_import_service`: 파싱/생성 로직은 `import_rows(db, rows, user_id)` 하나에 있고 CSV·구글 시트 경로는 `rows`만 만들어 위임하는 래퍼다 — 매칭/skip 로직은 `import_rows`만 고친다. CSV 헤더·라벨을 바꿀 때는 `CSV_HEADER`/`CSV_TYPE_LABELS`/`CSV_TYPE_BY_LABEL`을 함께 갱신한다.
- **누가 기록했나 vs 누가 썼나**: `Transaction.user_id`는 입력한 사람, `Transaction.owner_user_id`는 실제 소비 주체(공통 지출은 `NULL`)다. 배우자가 대신 입력하는 경우가 있어 "부부별 지출" 표시는 `*_by_owner` 계열 집계를 쓴다. 새 집계 함수는 어느 축이 필요한지 먼저 정한다.

## coaching_engine / savings_coaching_service

- DB 쓰기 없음. 대부분 순수 계산 함수(집계값 → `Insight`)라 파라미터화 테스트로 경계값을 촘촘히 검증한다(`tests/test_coaching_engine.py`). 새 룰도 같은 방식으로.
- 예외: `compute_insights`, `emergency_fund_context`, `compute_surplus_allocation`, `savings_pace_history`는 `db`를 받아 직접 조회까지 하는 DB-aware 래퍼다 — 순수 함수로 착각하지 않는다.
- 임계값은 하드코딩하지 않고 `settings`에서. 예산 경고/위험 %는 가구가 바꿀 수 있으므로 예산 상태를 계산하는 곳(계획 화면, 예산 알림 메일)은 `coaching_settings_service.budget_thresholds(db)`를 꺼내 `budget_vs_actual` 등에 넘긴다 — 생략하면 env 기본값이 쓰여 화면과 알림 판정이 어긋난다.
- **"얼마 저축할지"의 원본은 저축·투자 상품의 월 계획**(`savings_product_plan_service.planned_by_product_for_month` — `SavingsProductAnnualPlan` 그리드, 없으면 `monthly_saving_amount`). `savings_pace_basis`가 (실적, 목표)를 고른다: 그 달 상품 계획이 있으면 계획 대비 실제 납입액(저축상품 연결 거래), 없는 가구만 목표들의 `monthly_saving_amount` 합 대비 수입−지출로 폴백. 목표의 월 계획액도 같은 원본(`goal_progress_service.planned_monthly_for_goal`)이고, 목표 저장은 연동 상품의 계획액을 건드리지 않는다.

## 계획 원본은 연간계획 하나 (annual_plan_service ↔ cashflow_plan_service)

현금흐름 계획(수입/고정/변동/비정기)의 원본은 `AnnualPlanItem` + `AnnualPlanItemMonthlyTarget` 하나뿐이다(구 월간 테이블 `CashflowPlanItem`은 삭제됨). 저축·투자는 이 모델이 아니라 `SavingsProduct` + `SavingsProductAnnualPlan`이 원본이다.

- `cashflow_plan_service`는 연간계획을 **한 달 단면으로 읽고 쓰는** 얇은 서비스다. `list_items(db, ym)`은 그 달 target이 있는 항목을 `MonthPlanItem`(id = `AnnualPlanItem.id`)으로 준다. `upsert_item`은 항목 정보는 모든 달 공통으로, 금액은 **그 달 target만** 바꾼다(`annual_plan_service.set_month_target`, 기간 밖이면 start/end_month 확장). `delete_month`는 그 달 target만 지우고 마지막 달이면 항목째 삭제.
- 할부(`split_item_into_months`)는 남은 달에 target을 나눈 항목 **하나**다. 회차는 등록 시 고정한 `installment_start_month` 기준(`installment_no_for(ym)`) — `start_month`는 달 삭제/추가로 움직이므로 회차 기준이 아니다. 해를 넘기면 `ValueError`.
- 반복거래 연동(`recurring_expense_id`) 항목은 금액·카테고리가 반복거래 값으로 read-through된다(`AnnualPlanItem.amount_for`/`effective_category*`). **SQL 집계는 이 파이썬 프로퍼티를 거치지 않으므로** `plan_targets.EFFECTIVE_TARGET_AMOUNT`/`EFFECTIVE_CATEGORY_ID`와 `plan_targets.join_recurring(query)`를 반드시 함께 쓴다(`budget_service.get_budgets_for_month`, `annual_plan_service._section_monthly_targets`/`category_budgets_for_year`).
- `copy_from_previous_month` 중복 판정은 `_budget_line_key`(카테고리 항목은 `(section, category_id)`, 자유 텍스트는 `(section, name)`). 1월로 복사할 때는 올해의 같은 항목(`_item_key`)을 찾거나 새로 만든다.

### plan_targets.py 공용 헬퍼

"부모 엔티티 + 월별 target 테이블" 도메인(`AnnualPlanItem`/`SavingsProductAnnualPlan`/`FinancialGoal`)이 공유한다. 도메인별 CRUD 골격은 억지로 통합하지 않고 동일한 조각만 뽑았다. 새 도메인도 먼저 이것들을 재사용할 수 있는지 본다.
- `apply_monthly_targets(parent, monthly_targets, target_cls)`: year_month로 매칭해 갱신/생성, 빠진 월은 delete-orphan. 기존 행을 재사용하므로 `achieved_amount` 같은 다른 컬럼은 보존된다.
- `elapsed_months(year, today)`: 그 해 몇 월까지 실적을 집계할 수 있는지.
- `budget_status(section, pct)`(income일 때만 invert) / `savings_status(pct)`(항상 invert): `utils/plan_status.status_from_pct` 래퍼.

## growlio 연동 (growlio_client.py)

- 예외(`GrowlioNotConfiguredError`/`GrowlioRequestError`/`GrowlioSyncError`)는 `growlio_client.py`에만 정의한다. `app/main.py`의 `register_exception_handlers`가 전역에서 501/502/409로 매핑하므로 라우터에서 catch하지 않는다.
- 가져오기·동기화 로직은 공용 헬퍼를 재사용한다: `already_linked_growlio_ids(db, model)`(중복 가져오기 방지), `to_decimal_krw(raw)`, `find_by_growlio_id(items, id)`. 도메인마다 다른 가져오기 루프 본문은 통합하지 않는다.
- 받아 쓰는 값: 계좌 평가액·원금(`fetch_account_balances` — 투자 상품은 `invested_amount_krw`를 `principal_amount`로, 원금 없는 응답이면 기존 유지), 부동산 시세·대출(`fetch_real_estate_items`), 투자목표 설정(`fetch_investment_goal`, 목표 폼 프리필), 수익률 KPI(`fetch_performance`)·목표 달성 가능성(`fetch_goal_feasibility`) — 뒤 둘은 `goal_service.fetch_growlio_insight`가 묶는다. 복리 ETA(`goal_progress_service.compute_eta_with_return`)는 growlio 없이 nestlio가 계산한다.
- **전체 동기화(`sync_all_*`)**: `account_service.sync_all_accounts`/`savings_product_growlio_service.sync_all_from_growlio`/`real_estate_service.sync_all_from_growlio` 공통 규칙 — growlio 목록은 **1회만** 조회해 매칭하고, 매칭 실패(배우자 소유 등)는 전체를 중단하지 않고 `{id, name, reason}`을 `failed`에 담는다. 반환은 `tuple[int, list[dict]]`. 새 리소스 타입도 이 시그니처를 따른다.
- **기회주의적 갱신(`net_worth_service.refresh_stale_growlio_links`)**: 스케줄러엔 사용자 JWT가 없어 예약 동기화가 불가능하므로, `auto_sync_enabled`이고 `STALE_GROWLIO_LINK_AFTER`(12h)보다 오래된 SavingsProduct/Loan 연동(호출자·공동 소유만)이 있으면 `GET /net-worth`·`GET /dashboard/bootstrap` 응답 후 `BackgroundTasks`로 `sync_all_from_growlio(auto_sync_only=True, owner_user_id=호출자)`를 돌린다. 자체 `SessionLocal()`을 열고 절대 raise하지 않는다. **은행 계좌(`sync_all_accounts`)는 돌리지 않는다** — `initial_balance`를 역산 재기준하므로 수동 동기화 전용이다(`models/account.py` 주석).
