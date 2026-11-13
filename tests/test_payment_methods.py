"""결제수단 상수(app/constants/payment_methods.py)가 서로, 그리고 CSV 규칙과 어긋나지 않는지."""

from app.constants.payment_methods import PAYMENT_METHOD_BY_CARD_TYPE, PAYMENT_METHOD_LABELS, PAYMENT_METHODS
from app.services import transaction_import_service


def test_every_payment_method_has_a_csv_label():
    assert set(PAYMENT_METHOD_LABELS) == set(PAYMENT_METHODS)


def test_card_types_and_csv_alias_rules_map_to_known_methods():
    assert set(PAYMENT_METHOD_BY_CARD_TYPE.values()) <= set(PAYMENT_METHODS)
    assert {method for _, method in transaction_import_service._PAYMENT_METHOD_RULES} <= set(PAYMENT_METHODS)
