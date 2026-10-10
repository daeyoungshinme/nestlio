"""notification_inbox_service — 목표 응원(send_goal_cheer)의 저장 형태."""

from datetime import datetime

import pytest

from app.models.notification_log import NotificationLog
from app.models.notification_reaction import NotificationReaction
from app.services import notification_inbox_service


def test_send_goal_cheer_key_fits_column_even_with_microseconds(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    now = datetime(2026, 9, 26, 14, 32, 26, 123456)

    log_id = notification_inbox_service.send_goal_cheer(
        db, user.id, "Spouse 1", goal_id=7, goal_name="내집마련", emoji="💪", message=None, now=now
    )

    log = db.get(NotificationLog, log_id)
    # String(20) 컬럼 — 마이크로초까지 붙이면 26자라 Postgres가 거부한다.
    assert log.year_month == "2026-09-26T14:32:26"
    assert (log.notif_type, log.related_type, log.related_id) == ("goal_cheer", "goal", 7)


def test_send_goal_cheer_trims_message_and_treats_blank_as_none(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    long_id = notification_inbox_service.send_goal_cheer(
        db, user.id, "Spouse 1", goal_id=7, goal_name="내집마련", emoji="🎉", message="  " + "가" * 300 + "  "
    )
    blank_id = notification_inbox_service.send_goal_cheer(
        db, user.id, "Spouse 1", goal_id=7, goal_name="내집마련", emoji="🎉", message="   "
    )

    reactions = {r.notification_log_id: r for r in db.query(NotificationReaction).all()}
    assert reactions[long_id].message == "가" * 200
    assert reactions[blank_id].message is None
    assert db.get(NotificationLog, blank_id).detail == 'Spouse 1님이 "내집마련" 목표에 🎉 응원을 보냈어요'


def test_send_goal_cheer_rejects_unknown_emoji(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    with pytest.raises(notification_inbox_service.InvalidReactionError):
        notification_inbox_service.send_goal_cheer(
            db, user.id, "Spouse 1", goal_id=7, goal_name="내집마련", emoji="🙂", message=None
        )


# --- 배우자 저축 알림(partner_saving) ---------------------------------------------------------------


def _savings_tx(db, user, food, savings_product_id=None):
    from decimal import Decimal

    from app.models.savings_product import SavingsProduct
    from app.models.transaction import Transaction

    if savings_product_id is None:
        product = SavingsProduct(name="ETF", current_balance=Decimal("0"), monthly_saving_amount=Decimal("0"))
        db.add(product)
        db.flush()
        savings_product_id = product.id
    tx = Transaction(
        user_id=user.id,
        category_id=food.id,
        type="expense",
        amount=Decimal("300000"),
        transaction_date=datetime(2026, 10, 8).date(),
        savings_product_id=savings_product_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def test_log_partner_saving_records_inbox_entry_read_by_actor(seeded_db):
    from app.models.notification_read import NotificationRead

    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    tx = _savings_tx(db, user, food)

    log_id = notification_inbox_service.log_partner_saving(db, user.id, "Spouse 1", tx, now=datetime(2026, 10, 8, 9, 0))

    log = db.get(NotificationLog, log_id)
    assert (log.notif_type, log.related_type, log.related_id) == ("partner_saving", "savings_product", tx.savings_product_id)
    assert log.detail == 'Spouse 1님이 "ETF"에 300,000원 저축했어요'
    assert db.query(NotificationRead).filter_by(notification_log_id=log_id, user_id=user.id).count() == 1


def test_log_partner_saving_skips_non_savings_and_disabled(seeded_db):
    from decimal import Decimal

    from app.models.transaction import Transaction
    from app.services import notification_settings_service

    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    plain = Transaction(
        user_id=user.id, category_id=food.id, type="expense", amount=Decimal("1000"), transaction_date=datetime(2026, 10, 8).date()
    )
    db.add(plain)
    db.commit()
    assert notification_inbox_service.log_partner_saving(db, user.id, "Spouse 1", plain) is None

    notification_settings_service.set_prefs(db, {"partner_saving": False}, user.id)
    tx = _savings_tx(db, user, food)
    assert notification_inbox_service.log_partner_saving(db, user.id, "Spouse 1", tx) is None
    assert db.query(NotificationLog).filter_by(notif_type="partner_saving").count() == 0


def test_partner_saving_accepts_reactions(seeded_db):
    db, user, food = seeded_db["db"], seeded_db["user"], seeded_db["food"]
    tx = _savings_tx(db, user, food)
    log_id = notification_inbox_service.log_partner_saving(db, user.id, "Spouse 1", tx)

    notification_inbox_service.add_reaction(db, user.id, log_id, "👏", "멋져!")

    reaction = db.query(NotificationReaction).filter_by(notification_log_id=log_id).one()
    assert (reaction.emoji, reaction.message) == ("👏", "멋져!")
