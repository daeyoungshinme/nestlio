# 아카이브된 마이그레이션 (2026-09-01 스쿼시 이전)

`9e12ea51685e_initial_schema` … `b8f2a1c9e4d7_drop_annual_savings_goals` 까지 51개
단일 선형 체인. `migrations/versions/bdba3c3b3277_squashed_baseline.py` 하나로 접었다.

Alembic은 `versions/` 하위 디렉토리를 스캔하지 않으므로(`recursive_version_locations`
미설정) 이 파일들은 체인에서 완전히 빠져 있다. **참고용 히스토리**로만 남긴다 —
`alembic.ini` 에 `recursive_version_locations = true` 를 켜지 말 것(head가 2개가 된다).

과거 특정 리비전으로 되돌려 디버깅해야 하면 이 디렉토리의 파일을 임시로 `versions/` 로
옮기고 `down_revision` 을 수동으로 이어 붙인다.
