"""user_settings_household_key

user_settings는 부부 공유 설정(key/value)인데 unique가 (user_id, key)라, 두 사람이 같은 key 행을 따로 가질 수 있었다
(조회는 아무 행이나 .first()로 읽어 값이 흔들린다). key당 한 행만 남기고 unique를 (key)로 바꾼다.
남길 행은 가장 나중에 만든 것(id 최대) — 테이블에 수정 시각이 없어 삽입 순서를 최신 저장으로 본다.
user_id는 이제 "마지막으로 저장한 사람"이다(app/models/user_setting.py).

downgrade는 unique만 되돌린다. 지운 중복 행은 복구하지 않는다.

Revision ID: 9d4e7a1c3b52
Revises: f2c6a8d4e7b1
Create Date: 2026-10-17 12:00:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = "9d4e7a1c3b52"
down_revision: Union[str, None] = "f2c6a8d4e7b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM household.user_settings AS older
        USING household.user_settings AS newer
        WHERE older.key = newer.key AND older.id < newer.id
        """
    )
    with op.batch_alter_table("user_settings", schema="household") as batch_op:
        batch_op.drop_constraint("uq_user_setting_key", type_="unique")
        batch_op.create_unique_constraint("uq_user_settings_key", ["key"])


def downgrade() -> None:
    with op.batch_alter_table("user_settings", schema="household") as batch_op:
        batch_op.drop_constraint("uq_user_settings_key", type_="unique")
        batch_op.create_unique_constraint("uq_user_setting_key", ["user_id", "key"])
