# 아카이브된 마이그레이션 (2026-09-01 스쿼시 이전)

`9e12ea51685e_initial_schema` … `b8f2a1c9e4d7_drop_annual_savings_goals` 까지 51개
단일 선형 체인. `migrations/versions/bdba3c3b3277_squashed_baseline.py` 하나로 접었다.

Alembic은 `versions/` 하위 디렉토리를 스캔하지 않으므로(`recursive_version_locations`
미설정) 이 파일들은 체인에서 완전히 빠져 있다. **참고용 히스토리**로만 남긴다 —
`alembic.ini` 에 `recursive_version_locations = true` 를 켜지 말 것(head가 2개가 된다).

과거 특정 리비전으로 되돌려 디버깅해야 하면 이 디렉토리의 파일을 임시로 `versions/` 로
옮기고 `down_revision` 을 수동으로 이어 붙인다.

## 스쿼시 이전 리비전으로 스탬프된 오래된 DB

베이스라인(`bdba3c3b3277`)은 `down_revision = None` 이라 구 리비전 ID(`9e12ea51685e` …
`b8f2a1c9e4d7`)에서 이어지는 경로가 없다. `household.alembic_version` 이 아직 구 리비전으로
스탬프돼 있는 DB(오래 살아 있던 로컬 개발 DB 등)는 `alembic upgrade head` 가
`Can't locate revision '...'` 로 실패한다. 운영 Supabase DB 는 2026-09-01 에
`alembic stamp bdba3c3b3277 --purge` 로 이미 정리됐고(`--purge` 는 해석 불가능한 구 행을
지우기 위함), 그런 로컬 DB 도 같은 명령 한 번이면 된다. 롤백은 이전 이미지 재배포 +
`alembic stamp b8f2a1c9e4d7 --purge`.
