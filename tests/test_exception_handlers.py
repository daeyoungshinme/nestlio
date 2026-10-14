"""app/exception_handlers.py — 도메인 예외(app/errors.py)의 HTTP 매핑.

라우터마다 try/except로 하던 변환을 앱 전역 한 곳으로 옮겼다. 핸들러가 빠지면 아래 오류가 전부 500이 되고,
예외 클래스의 부모를 잘못 바꾸면 상태코드가 조용히 달라지므로 기존 응답 코드를 여기서 고정한다.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.exception_handlers import register_exception_handlers
from app.services import (
    annual_plan_service,
    cashflow_plan_service,
    couple_photo_service,
    gmail_service,
    goal_service,
    google_auth,
    growlio_client,
    invite_service,
    notification_inbox_service,
    transaction_service,
    user_service,
)


@pytest.mark.parametrize(
    ("error_cls", "expected_status"),
    [
        (growlio_client.GrowlioNotConfiguredError, 501),
        (growlio_client.GrowlioRequestError, 502),
        (growlio_client.GrowlioSyncError, 409),
        (invite_service.HouseholdFullError, 409),
        (invite_service.InviteNotFoundError, 404),
        (invite_service.InviteExpiredError, 409),
        (invite_service.InviteAlreadyAcceptedError, 409),
        (invite_service.InviteEmailMismatchError, 403),
        (notification_inbox_service.NotificationNotFoundError, 404),
        (notification_inbox_service.InvalidReactionError, 422),
        (user_service.CannotRemoveSelfError, 400),
        (goal_service.MonthlyTargetNotFoundError, 404),
        (goal_service.DuplicateFundingSourceProductError, 409),
        (goal_service.NetWorthGoalExistsError, 409),
        (annual_plan_service.PlanAlreadyExistsError, 409),
        (cashflow_plan_service.RecurringExpenseNotFoundError, 404),
        (cashflow_plan_service.AlreadyLinkedError, 409),
        (transaction_service.InvalidSavingsLinkError, 400),
        (couple_photo_service.InvalidPhotoError, 400),
        (couple_photo_service.PhotoStorageError, 502),
        (gmail_service.GmailSendError, 502),
        (google_auth.GoogleAuthError, 409),
        (google_auth.GoogleNotConnectedError, 409),
    ],
)
def test_domain_errors_map_to_status_with_detail(error_cls, expected_status):
    app = FastAPI()
    register_exception_handlers(app)
    error = error_cls("사용자에게 보여줄 문구")

    @app.get("/boom")
    def boom():
        raise error

    resp = TestClient(app).get("/boom")
    assert resp.status_code == expected_status
    assert resp.json() == {"detail": "사용자에게 보여줄 문구"}
