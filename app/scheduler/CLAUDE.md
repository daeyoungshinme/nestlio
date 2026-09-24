# app/scheduler 컨벤션

잡 본문은 in-process 스케줄러가 아니라 **외부 트리거**(GitHub Actions 예약 워크플로)가 `app/routers/internal_jobs.py`의 `POST /internal/jobs/{job_name}`을 호출해 실행한다. Render 무료 웹서비스는 15분 미사용 시 슬립하므로 인프로세스 스케줄러(APScheduler)를 유지할 수 없어 이 구조로 전환했다.

## 구조

- `jobs.py`: 잡 본문 (실제 로직은 `app/services`에 위임) — 트리거 방식이 바뀌어도 이 파일은 그대로 재사용된다. 시각은 `app/utils/dates.py`의 `now_kst()`/`today_kst()`로 읽어 서비스에 명시 주입한다(`datetime.now()`/`date.today()` 직접 호출 금지 — 컨테이너 TZ가 UTC라 KST 가정과 9시간 어긋난다. `render.yaml`의 `TZ=Asia/Seoul`이 이중 방어).
- `app/routers/internal_jobs.py`: `job_name → callable` 매핑(`JOB_REGISTRY`), `X-Internal-Job-Secret` 헤더 검증(`settings.internal_job_secret`), `POST /internal/jobs/{job_name}` 엔드포인트.
- `.github/workflows/scheduled-jobs.yml`: GitHub Actions `schedule:` cron (UTC 기준, KST = UTC+9로 환산)이 `curl`로 위 엔드포인트를 호출한다. 요일/말일 조건이 필요한 잡(주간·월간)은 워크플로 스텝 안에서 셸로 분기한다.

## 등록된 잡

| id (JOB_REGISTRY 키) | 스케줄 (KST) | 호출 |
|---|---|---|
| `daily-due-date-check` | 매일 07:00 | `recurring_service.generate_due_transactions` + 캘린더 동기화 |
| `weekly-summary-email` | 매주 월 08:00 | `notification_service.send_weekly_summary(db, today=today_kst())` |
| `monthly-summary-email` | 매월 1일 08:00 | `notification_service.send_monthly_summary(db, today=today_kst())` |
| `daily-threshold-safety-net` | 매일 20:00 | `notification_service.check_all_categories_threshold` + `goal_service.sync_challenge_statuses` + `check_all_goal_milestones` (실시간 체크 누락 대비 백스톱, 저장 이벤트 없이 연동 잔액만 자연 증가한 챌린지 상태 전환 포함) |
| `monthly-net-worth-snapshot` | 매월 1일 08:05 | `net_worth_service.record_snapshot` (순자산 추이 차트용 월별 스냅샷 기록) |
| `event-reminder-check` | 15분 간격 | `event_reminder_service.send_due_reminders` (일정 시작 전 리마인더 이메일) |

## 세션 패턴

- 외부 HTTP 호출로 트리거되므로 요청 스코프 `get_db()`가 없다. 새 잡은 기본적으로 **`@_job("실패 로그 문구")` 데코레이터**를 쓴다 — 자체 `SessionLocal()`을 열어 `db` 하나를 넘기고, 예외는 로그를 남긴 뒤 **다시 던지며**(엔드포인트가 500 → GitHub Actions가 실패로 표시), `finally`에서 세션을 닫는다.
- 여러 단계를 독립적으로 돌리고 실패를 모아 한 번에 보고해야 하는 잡(`daily_threshold_safety_net`)만 직접 세션을 관리한다. 이때 실패한 단계 뒤에는 `db.rollback()`을 해야 다음 단계가 `PendingRollbackError`로 연쇄 실패하지 않는다.
- 테스트는 `tests/test_scheduler_jobs.py` — `conftest.py`가 `app.scheduler.jobs.SessionLocal`을 테스트 DB로 돌린다.

## Google 연동 가드

- `daily_due_date_check`의 캘린더 동기화와 `event_reminder_check`는 `jobs.py` 안에서 직접 `google_auth.is_connected()`를 확인한 뒤에만 Google API를 호출한다.
- `weekly_summary_email`/`monthly_summary_email`/`daily_threshold_safety_net`은 `jobs.py`에는 가드가 없다 — 대신 한 단계 아래 `notification_service`의 각 send 함수(`send_weekly_summary`/`send_monthly_summary`/threshold·milestone 체크)가 내부적으로 `is_connected()`를 확인해, 미연결 상태여도 인앱 알림(`NotificationLog`)은 항상 남기고 실제 이메일 발송만 건너뛴다.
- 결과적으로 연동 안 된 상태에서도 앱이 정상 동작한다는 목표는 동일하지만, 가드 위치는 잡마다 다르다 — 새 잡을 추가할 때 어느 계층에서 가드할지 확인한다.

## 보안

- `/internal/jobs/*`는 인증된 사용자 대상 API가 아니라 외부 크론이 호출하는 공개 URL이므로, `INTERNAL_JOB_SECRET` 환경변수와 `X-Internal-Job-Secret` 헤더를 `hmac.compare_digest`로 비교해 검증한다. 시크릿이 설정되지 않았으면 전부 401로 거부한다(fail-closed).
- 알 수 없는 `job_name`은 404로 응답한다 — 임의 코드 실행 표면이 되지 않도록 `JOB_REGISTRY`에 등록된 이름만 허용한다.

## 새 잡 추가 체크리스트

1. `jobs.py`에 `@_job(...)` 함수 작성, 외부 연동은 `is_connected()` 가드. 예외는 삼키지 말고 전파한다(실패가 Actions에 보여야 함) — 한 항목 실패가 나머지를 막으면 안 되는 루프만 항목 단위로 잡고 롤백한다.
2. **멱등하게** 만든다 — curl이 `--retry 2 --retry-all-errors --max-time 170`이라 느리거나 부분 실패(500)한 잡은 첫 실행이 아직 도는 중에 다시 호출될 수 있다. 기존 잡은 `notification_log_service.already_sent`/스냅샷 upsert/`next_due_date` 전진으로 중복을 막는다.
3. `app/routers/internal_jobs.py`의 `JOB_REGISTRY`에 `"job-name": job_function` 추가
4. `.github/workflows/scheduled-jobs.yml`에 필요한 cron 트리거(UTC 환산)와 curl 스텝 추가. 요일/날짜 조건은 `TZ=Asia/Seoul date`로 KST 기준 판정한다(cron이 밀려 UTC 자정을 넘겨도 흔들리지 않게). `concurrency.group`이 cron별로 나뉘어 있으니 새 cron도 자동으로 자기 그룹을 갖는다.

## 운영 주의

- GitHub은 **60일간 저장소 활동이 없으면 예약(schedule) 워크플로를 자동 비활성화**한다 — 모든 잡이 조용히 멈춘다. 오래 커밋이 없었다면 Actions 탭에서 "nestlio scheduled jobs"가 활성 상태인지 확인한다.
