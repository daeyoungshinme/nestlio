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
- 전용 예외는 `app/errors.py`의 베이스(`InvalidInputError` 400 / `ForbiddenError` 403 / `NotFoundError` 404 / `ConflictError` 409 / `PayloadTooLargeError` 413 / `UnprocessableError` 422 / `UpstreamError` 502 / 그 하위 `ServiceUnavailableError` 503)를 상속한다. `app/exception_handlers.py`가 전역에서 `{"detail": str(exc)}`로 바꾸므로 **라우터는 catch해서 HTTPException으로 다시 던지지 않는다**. 맨 `ValueError`를 도메인 오류로 쓰지 않는다(라우터마다 400/409로 제각각 매핑되던 원인). 상태코드는 `tests/test_exception_handlers.py`가 고정한다.
- 한 함수에 두 방식이 섞여 있다고 자동으로 버그는 아니다 — 라우터까지 대조해 각 분기가 실제로 다른 상태를 구분하는지 본다.

## 라우터에 두지 않는 것

라우터는 입력 파싱·인증·서비스 호출·응답 헤더만 한다. 아래는 서비스에 있다 — 새 엔드포인트도 같은 자리에 둔다.
- 여러 서비스 조합으로 만드는 화면 응답: `dashboard_service`(`build`·`bootstrap`·`build_retrospective`·`yearly_report`), 설정 응답 `settings_service.build_settings_out`
- 저장 직후 best-effort 부수효과(실패해도 응답은 성공): `notification_service.alert_budget_after_transaction_save`·`celebrate_goal_milestone_best_effort`, `notification_inbox_service.log_partner_saving_best_effort` — 실패 시 롤백까지 하므로 라우터는 try/except 없이 부른다
- 기본 조회 기간(`transaction_service.period_or_this_month`·`list_with_totals`), 업로드 디코딩(`transaction_import_service.decode_upload`), 할부 개월 수(`cashflow_plan_service.split_item_for_rest_of_year`), 사용자 자동 미러링·정원(`user_service.ensure_mirrored_user`)

## Google 연동 가드

- Google 연동은 Gmail 알림 메일 발송뿐이다(구글 캘린더 동기화·시트 가져오기는 토큰 유지비 대비 쓰임이 적어 2026-10 제거). `gmail_service`를 부르기 전에 `google_auth.is_connected()`를 확인한다. 미연결이면 `GoogleNotConnectedError`.
- 알림 메일은 `gmail_service.send_email`을 직접 부르지 않고 `notification_service.send_email_best_effort`를 거친다 — 가드 + `GoogleAuthError`/`GmailSendError`를 경고 로그로 흡수해 메일 실패가 인앱 알림이나 예약 잡을 막지 않게 한다. 결과는 `"sent"`/`"skipped"`(미연결·토큰 만료 — 재시도 무의미)/`"failed"`(일시 오류)로 돌려주고, 대부분의 호출부는 무시하고 `notification_log_service.log_sent`를 남긴다. 수신자를 좁힐 땐 `to=`(배우자 일정 알림이 행위자 제외). 제목·본문 문자열은 `email_templates`에서 만든다(텍스트 본문은 인앱 `detail`로도 쓰인다). 사용자가 직접 누른 발송(테스트 메일, 초대장)은 반대로 예외를 라우터까지 올린다.
- 순환 의존·부팅 비용을 피하려고 함수 내부 지연 import를 쓰는 곳이 있다.

## 알림 dedup

- 같은 알림의 중복 발송은 `NotificationLog`(`notif_type` + 기간 키) 기록으로 막는다. 헬퍼(`already_sent`/`log_sent`, 목표 마일스톤용 `highest_crossed_milestone`/`milestone_already_logged`/`log_milestone`)는 다른 서비스를 import하지 않는 말단 모듈 `notification_log_service.py`에 있다(`notification_service`를 import하면 순환이 되는 모듈도 쓸 수 있게). 새 알림 종류도 이 패턴을 따른다.
- dedup이 없는 "사건" 알림(`goal_cheer`, `partner_saving`)은 `year_month`에 초 단위 ISO 시각을 넣고(String(20)), 행동한 본인에게는 `NotificationRead`로 바로 읽음 처리한다. `partner_saving`은 사용자가 직접 입력한 저축 거래(`POST /transactions`)에서만 남긴다 — 반복거래 자동 생성·CSV 가져오기는 알림함을 덮으므로 제외.

## 모듈 분할 지도

큰 서비스는 책임별로 나뉘어 있다. 의존 방향을 거꾸로 만들면 순환 import가 생긴다.

| 묶음 | 모듈과 책임 | 주의 |
|---|---|---|
| 거래 | `transaction_service`(CRUD, 저축상품 연결 검증, growlio push) · `transaction_report_service`(한 기간 집계·`period_snapshot`, 공용 쿼리 조각) · `transaction_trend_service`(여러 달 시계열·평균, 범위 1회 조회 후 달별 버킷팅) · `transaction_import_service`(CSV import·export) | 아래 "누가 기록했나 vs 누가 썼나" 참고 |
| 일정 | `event_service`(CRUD, 반복 전개 `occurrences_in_range`) · `event_reminder_service`(리마인더, 배우자 알림) | `event_service`는 알림을 모른다 — 생성·수정·삭제 뒤 배우자 알림은 라우터가 `notify_other_spouse_best_effort`로 부른다 |
| 저축상품 | `savings_product_service`(CRUD, `list_products`, `get_emergency_fund_balance`) · `savings_product_plan_service`(연간계획·실적, `PLAN_PRODUCT_TYPES`) · `savings_product_growlio_service`(growlio 동기화) | 상품 목록은 항상 `list_products(db)` 재사용 |
| 목표 | `goal_service`(CRUD, 챌린지 상태 동기화, 자금원 연동, growlio 조회) · `goal_progress_service`(진행률·ETA·`to_out`, 커밋 없음. 목표 여러 개는 `list_out`/`current_amounts`로 — 목표마다 `to_out`/`compute_current_amount`를 돌리면 N+1) | `goal_service` → `goal_progress_service` 단방향 |
| 알림 | `notification_service`(발송·판정) · `notification_inbox_service`(목록·읽음·반응·목표 응원) · `notification_log_service`(dedup) | 앞 둘은 서로 import하지 않음 |
| 코칭 | `coaching_engine`(규칙 기반 `Insight`, `compute_insights`) · `savings_coaching_service`(여유자금 배분, 비상금, 저축 페이스·연속 달성) · `spending_review_service`(절감 점검: 규칙별 월 절감 추정 `SavingOpportunity`, 중복 합산 방지 `merge_opportunities`) | `coaching_engine` → `savings_coaching_service` 단방향. `spending_review_service` → `coaching_engine`(벤치마크 임계값) 단방향. `insurance_review_service`(보험 계약 점검, 해지 권고 안 함) → `insurance_service`·`insurance_target_service`(적정 가입금액 기준)·`spending_review_service`. 보험은 소비 점검 벤치마크에서 빠지므로 `dashboard_service.build_savings_review`가 두 총액을 그냥 더한다 |

- `transaction_import_service`: 파싱/생성 로직은 `import_rows(db, rows, user_id)` 하나에 있고 `import_csv`는 CSV 문자열을 `rows`로 나눠 위임하는 얇은 래퍼다 — 매칭/skip 로직은 `import_rows`만 고친다. CSV 헤더·라벨을 바꿀 때는 `CSV_HEADER`/`CSV_TYPE_LABELS`/`CSV_TYPE_BY_LABEL`을 함께 갱신한다. 카테고리 칸이 비었거나 모르는 이름이면 `_infer_category`가 메모로 과거 거래에서 추론하고(정규화 메모 정확 일치 → 포함된 가장 긴 학습 메모, 같은 구분·활성 카테고리만, 최다 건수 → 최근순), 없으면 `_keyword_category`(가맹점 키워드 사전 `app/constants/merchant_keywords.py`, 지출만, 기본 카테고리 이름 기준이라 그 이름이 없는 가구는 무시), 그래도 없으면 업로드 시 고른 `fallback_category_id`(같은 구분일 때만) — 출처는 `auto_categorized[].source`. 명시된 카테고리는 덮어쓰지 않고, 같은 파일 앞 행도 학습하며, 추론한 행은 `auto_categorized`로 알린다. 이어서 같은 날·구분·카테고리에 메모가 비슷한(`_similar_memo` — 정규화 후 같거나 2자 이상 포함, 빈 메모 제외) 행은 금액을 합쳐 한 건으로 만들고(`merged`), 그 결과가 이미 저장된 거래(같은 날·구분·금액, 비슷한 메모)와 겹치면 `DUPLICATE_REASON`으로 건너뛴다 — 같은 CSV 재업로드가 멱등. 날짜·금액은 은행·카드 앱 형식도 받는다(`_parse_date`: `2026.10.26`·`2026/10/26`·`20261026`·뒤에 시각, `_parse_amount`: `12,000원`).
- **누가 기록했나 vs 누가 썼나**: `Transaction.user_id`는 입력한 사람, `Transaction.owner_user_id`는 실제 소비 주체(공통 지출은 `NULL`)다. 배우자가 대신 입력하는 경우가 있어 "부부별 지출" 표시는 `*_by_owner` 계열 집계를 쓴다. 새 집계 함수는 어느 축이 필요한지 먼저 정한다.

## coaching_engine / savings_coaching_service

- DB 쓰기 없음. 대부분 순수 계산 함수(집계값 → `Insight`)라 파라미터화 테스트로 경계값을 촘촘히 검증한다(`tests/test_coaching_engine.py`). 새 룰도 같은 방식으로.
- 예외: `compute_insights`, `emergency_fund_context`, `compute_surplus_allocation`, `savings_pace_history`는 `db`를 받아 직접 조회까지 하는 DB-aware 래퍼다 — 순수 함수로 착각하지 않는다.
- 부부가 바꿀 수 있는 설정값(코칭 임계값 `coaching_settings_service`, 보험 적정 기준 `insurance_target_service`)은 `user_setting_service.get_overrides`/`set_overrides`(키 prefix + `settings` 기본값 폴백, 손상 값도 폴백)로 읽고 쓴다 — 새 설정 묶음도 같은 헬퍼로. `user_settings`는 가구 공유라 key당 한 행(`uq_user_settings_key`)이고 `user_id`는 마지막으로 저장한 사람이다. 심각도 정렬은 `app/constants/severity.severity_rank`, 문구의 금액 표기는 `app/utils/money.format_won`.
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

## 순자산 목표 (FinancialGoal.kind="net_worth")

부부 자산증식 목표. 가구당 하나(`goal_service.NetWorthGoalExistsError` → 409). 진행금액은 `net_worth_service.compute_current`의 순자산, 월 계획액은 모든 저축·투자 상품의 그 달 계획 합(`goal_progress_service.planned_monthly_for_goal`)이라 자금원 연동·월별 목표·수동 진행금액은 생성/수정 시 버린다. 새 kind 분기는 `goal_progress_service`의 `compute_current_amount`/`to_out`/`planned_monthly_for_goal` 세 곳을 함께 본다.

## growlio 연동 (growlio_client.py)

- 예외(`GrowlioNotConfiguredError`/`GrowlioRequestError`/`GrowlioSyncError`)는 `growlio_client.py`에만 정의한다. `app/errors.py` 베이스를 상속해 전역 핸들러가 501/502/409로 매핑하므로 라우터에서 catch하지 않는다.
- 가져오기·동기화 로직은 공용 헬퍼를 재사용한다: `already_linked_growlio_ids(db, model)`(중복 가져오기 방지), `to_decimal_krw(raw)`, `find_by_growlio_id(items, id)`. 도메인마다 다른 가져오기 루프 본문은 통합하지 않는다.
- 받아 쓰는 값: 계좌 평가액·원금(`fetch_account_balances` — 투자 상품은 `invested_amount_krw`를 `principal_amount`로, 원금 없는 응답이면 기존 유지), 부동산 시세·대출(`fetch_real_estate_items`), 투자목표 설정(`fetch_investment_goal`, 목표 폼 프리필), 수익률 KPI(`fetch_performance`)·목표 달성 가능성(`fetch_goal_feasibility`) — 뒤 둘은 `goal_service.fetch_growlio_insight`가 묶는다. 목표에 growlio 계좌가 연동돼 있으면 `fetch_account_performance`(그 계좌들만의 XIRR → `eta_with_actual_return_year_month`)와 `fetch_net_deposits`(증권사에서 growlio로 직접 들어온 월 순입금, nestlio push 분 제외, 최근 6개월)도 더한다 — 둘 다 best-effort라 구버전 growlio(404)면 그 필드만 비운다. 복리 ETA(`goal_progress_service.compute_eta_with_return`)는 growlio 없이 nestlio가 계산한다.
- **전체 동기화(`sync_all_*`)**: `account_service.sync_all_accounts`/`savings_product_growlio_service.sync_all_from_growlio`/`real_estate_service.sync_all_from_growlio` 공통 규칙 — growlio 목록은 **1회만** 조회해 매칭하고, 매칭 실패(배우자 소유 등)는 전체를 중단하지 않고 `{id, name, reason}`을 `failed`에 담는다. 반환은 `tuple[int, list[dict]]`. 새 리소스 타입도 이 시그니처를 따른다.
- **입출금 반영 아웃박스(`growlio_push_service`, `GrowlioPushQueue`)**: 저축·투자 거래 저장/수정/삭제의 growlio 반영은 큐 행을 **거래와 같은 커밋으로** 세션에 올리고(`stage` — 따로 커밋하면 그 사이 실패 시 반영이 영영 빠진다) 커밋 뒤 바로 보내 본다(`send_staged`). 실패·토큰 없음이면 남겨 두고, `GET /dashboard/bootstrap`·`GET /net-worth` 응답 후 `flush_pending`이 호출자·공동 소유 행을 재전송한다(잔액 새로고침보다 **먼저** 등록 — BackgroundTasks는 등록 순. 두 작업 등록은 `net_worth_service.schedule_background_refresh` 한 곳에서만 한다). growlio에 `external_ref="nestlio:q{id}"`로 보내 growlio가 중복 기록을 막으므로 재전송이 안전하다. 행은 거래·상품과 FK로 묶지 않는다(삭제돼도 반영할 동작은 남아야 함). `MAX_ATTEMPTS` 넘게 실패한 행은 더 보내지 않고 `last_error`에 원인을 남긴다.
- **기회주의적 갱신(`net_worth_service.refresh_stale_growlio_links`)**: 스케줄러엔 사용자 JWT가 없어 예약 동기화가 불가능하므로, `auto_sync_enabled`이고 `STALE_GROWLIO_LINK_AFTER`(12h)보다 오래된 SavingsProduct/Loan 연동(호출자·공동 소유만)이 있으면 `GET /net-worth`·`GET /dashboard/bootstrap` 응답 후 `BackgroundTasks`로 `sync_all_from_growlio(auto_sync_only=True, owner_user_id=호출자)`를 돌린다. 자체 `SessionLocal()`을 열고 절대 raise하지 않는다. **은행 계좌(`sync_all_accounts`)는 돌리지 않는다** — `initial_balance`를 역산 재기준하므로 수동 동기화 전용이다(`models/account.py` 주석).
