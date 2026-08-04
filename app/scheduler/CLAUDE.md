# app/scheduler 컨벤션

APScheduler(`AsyncIOScheduler`) 기반 백그라운드 잡. `app/main.py`의 `lifespan`에서 `start_scheduler()`/`stop_scheduler()`로 앱 시작/종료에 맞춰 구동된다.

## 구조

- `setup.py`: 스케줄러 인스턴스 생성, 잡 등록(`add_job`), 시작/종료
- `jobs.py`: 잡 본문 (실제 로직은 `app/services`에 위임)

## 영속화

- job store는 `SQLAlchemyJobStore`로 `data/scheduler_jobs.db`(앱 DB와 별개 파일)에 저장된다.
- 모든 `add_job` 호출에 `id`와 `replace_existing=True`를 지정한다 — 재시작 시 중복 등록을 막고, cron 스케줄 자체를 변경했을 때도 새 정의로 덮어써지도록 하기 위함이다. 새 잡을 추가할 때도 반드시 `id`와 `replace_existing=True`를 지정한다.

## 등록된 cron 잡

| id | 스케줄 | 호출 |
|---|---|---|
| `daily_due_date_check` | 매일 07:00 | `recurring_service.generate_due_transactions` + 캘린더 동기화 |
| `weekly_summary_email` | 매주 월 08:00 | `notification_service.send_weekly_summary` |
| `monthly_summary_email` | 매월 1일 08:00 | `notification_service.send_monthly_summary` |
| `daily_threshold_safety_net` | 매일 20:00 | `notification_service.check_all_categories_threshold` + `check_all_goal_milestones` (실시간 체크 누락 대비 백스톱) |
| `monthly_net_worth_snapshot` | 매월 1일 08:05 | `net_worth_service.record_snapshot` (순자산 추이 차트용 월별 스냅샷 기록) |
| `event_reminder_check` | 15분 간격 (`interval`) | `event_service.send_due_reminders` (일정 시작 전 리마인더 이메일 — "N분/일 전" 단위라 daily cron으로는 부족해 유일하게 interval 트리거 사용) |

## 세션 패턴

- 각 잡 함수는 요청 스코프 `get_db()`가 아니라 **자체적으로 `SessionLocal()`을 열고 `finally`에서 닫는다**. 새 잡을 추가할 때도 이 패턴을 따른다.

## Google 연동 가드

- `daily_due_date_check`의 캘린더 동기화, `weekly_summary_email`/`monthly_summary_email`/`daily_threshold_safety_net`은 모두 `google_auth.is_connected()`를 먼저 확인한 뒤에만 Google API를 호출한다 (연동 안 된 상태에서도 앱이 정상 동작해야 하므로).

## 새 잡 추가 체크리스트

1. `jobs.py`에 함수 작성 — 자체 DB 세션 열고 닫기, 외부 연동은 `is_connected()` 가드
2. 잡 내부 예외가 스케줄러 전체를 죽이지 않도록 처리 (필요 시 try/except)
3. `setup.py`의 `start_scheduler()`에 `id`, cron 인자, `replace_existing=True`로 등록
