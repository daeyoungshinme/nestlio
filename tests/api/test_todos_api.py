import uuid
from unittest.mock import patch

import pytest

from app.dependencies import get_current_user
from app.main import app
from app.models.notification_log import NotificationLog
from app.models.user import User

BASE = "/api/v1/todos"


@pytest.fixture()
def spouse2(seeded_db):
    db = seeded_db["db"]
    user = User(email="spouse2@example.com", display_name="Spouse 2")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def as_spouse2(client, spouse2):
    """이후 요청을 spouse2가 보낸 것으로 바꾼다(client 픽스처가 override를 정리한다)."""
    app.dependency_overrides[get_current_user] = lambda: spouse2
    return client


def _todo_logs(db):
    return db.query(NotificationLog).filter_by(notif_type="todo").all()


def test_create_returns_201_with_creator_and_shared_assignee(client):
    resp = client.post(BASE, json={"title": "  분리수거  ", "due_date": "2026-07-10"})

    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "분리수거"
    assert body["due_date"] == "2026-07-10"
    assert body["frequency"] == "once"
    assert body["creator"]["email"] == "spouse1@example.com"
    assert body["assignee"] is None
    assert body["completed_at"] is None
    assert body["completer"] is None
    assert body["is_important"] is False


def test_is_important_round_trips(client):
    todo_id = client.post(BASE, json={"title": "보험 갱신", "is_important": True}).json()["id"]
    assert client.get(f"{BASE}?status=open").json()[0]["is_important"] is True

    resp = client.put(f"{BASE}/{todo_id}", json={"title": "보험 갱신", "is_important": False})
    assert resp.json()["is_important"] is False


@pytest.mark.parametrize(
    "payload",
    [
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 201},
        {"title": "ok", "memo": "x" * 1001},
        {"title": "ok", "frequency": "daily", "due_date": "2026-07-10"},
        {"title": "반복인데 기한 없음", "frequency": "weekly"},
    ],
)
def test_create_invalid_returns_422(client, payload):
    assert client.post(BASE, json=payload).status_code == 422


def test_create_unknown_assignee_returns_400(client):
    resp = client.post(BASE, json={"title": "ok", "assignee_id": str(uuid.uuid4())})

    assert resp.status_code == 400
    assert resp.json()["detail"] == "담당자를 찾을 수 없습니다."


def test_list_filters_by_status_and_rejects_unknown(client):
    done_id = client.post(BASE, json={"title": "끝남"}).json()["id"]
    open_id = client.post(BASE, json={"title": "진행 중"}).json()["id"]
    client.patch(f"{BASE}/{done_id}/complete", json={"completed": True})

    assert [t["id"] for t in client.get(BASE).json()] == [open_id]
    assert [t["id"] for t in client.get(BASE, params={"status": "done"}).json()] == [done_id]
    assert client.get(BASE, params={"status": "x"}).status_code == 422


def test_missing_todo_returns_404(client):
    assert client.put(f"{BASE}/999", json={"title": "x"}).status_code == 404
    assert client.patch(f"{BASE}/999/complete", json={"completed": True}).status_code == 404
    assert client.delete(f"{BASE}/999").status_code == 404


def test_spouse_can_edit_complete_and_delete_each_others_todos(client, seeded_db, spouse2, as_spouse2):
    # seeded user가 만든 할일을 spouse2 세션으로 다룬다
    from app.services import todo_service

    todo = todo_service.create_todo(seeded_db["db"], created_by=seeded_db["user"].id, title="서로의 할일")

    updated = as_spouse2.put(f"{BASE}/{todo.id}", json={"title": "고침", "assignee_id": str(spouse2.id)})
    assert updated.status_code == 200
    assert updated.json()["title"] == "고침"
    assert updated.json()["assignee"]["id"] == str(spouse2.id)

    completed = as_spouse2.patch(f"{BASE}/{todo.id}/complete", json={"completed": True})
    assert completed.status_code == 200
    assert completed.json()["completer"]["id"] == str(spouse2.id)

    assert as_spouse2.delete(f"{BASE}/{todo.id}").status_code == 204
    assert as_spouse2.get(BASE, params={"status": "done"}).json() == []


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
def test_notification_flow_across_crud(mock_connected, mock_send, client, seeded_db, spouse2):
    db = seeded_db["db"]

    created = client.post(BASE, json={"title": "세금 신고", "assignee_id": str(spouse2.id)}).json()
    assert [c.args[0] for c in mock_send.call_args_list] == ["[Nestlio] 새 할일이 등록되었습니다: 세금 신고"]
    assert mock_send.call_args.kwargs["to"] == [spouse2.email]
    assert len(_todo_logs(db)) == 1

    # 담당이 그대로인 수정은 조용하다
    client.put(f"{BASE}/{created['id']}", json={"title": "세금 신고 준비", "assignee_id": str(spouse2.id)})
    assert mock_send.call_count == 1
    assert len(_todo_logs(db)) == 1

    # 완료는 알림함에만, 같은 요청을 반복하면 다시 남지 않는다
    client.patch(f"{BASE}/{created['id']}/complete", json={"completed": True})
    client.patch(f"{BASE}/{created['id']}/complete", json={"completed": True})
    assert mock_send.call_count == 1
    assert len(_todo_logs(db)) == 2

    # 완료 취소는 조용하다
    client.patch(f"{BASE}/{created['id']}/complete", json={"completed": False})
    assert len(_todo_logs(db)) == 2

    # 삭제는 알림함에만
    assert client.delete(f"{BASE}/{created['id']}").status_code == 204
    assert mock_send.call_count == 1
    assert _todo_logs(db)[-1].detail == "Spouse 1님이 할일을 삭제했어요: 세금 신고 준비"


def test_each_completes_requires_shared_todo(client, spouse2):
    resp = client.post(BASE, json={"title": "운동", "assignee_id": str(spouse2.id), "each_completes": True})
    assert resp.status_code == 422


def test_each_completes_flow_and_partner_inbox(client, seeded_db, spouse2, as_spouse2):
    db = seeded_db["db"]
    created = client.post(BASE, json={"title": "건강검진", "each_completes": True}).json()
    assert created["each_completes"] is True
    assert created["completions"] == []
    logs_before = len(_todo_logs(db))

    # spouse1 몫만 체크 — 진행 중에 남고 배우자 알림함에 남는다
    app.dependency_overrides[get_current_user] = lambda: seeded_db["user"]
    partial = client.patch(f"{BASE}/{created['id']}/complete", json={"completed": True}).json()
    assert partial["completed_at"] is None
    assert [c["user"]["id"] for c in partial["completions"]] == [str(seeded_db["user"].id)]
    assert _todo_logs(db)[-1].detail == "Spouse 1님이 할일에서 자기 몫을 완료했어요: 건강검진"
    assert [t["id"] for t in client.get(BASE).json()] == [created["id"]]

    # spouse2가 체크하면 완료
    app.dependency_overrides[get_current_user] = lambda: spouse2
    done = client.patch(f"{BASE}/{created['id']}/complete", json={"completed": True}).json()
    assert done["completed_at"] is not None
    assert done["completer"]["id"] == str(spouse2.id)
    assert _todo_logs(db)[-1].detail == "Spouse 2님이 할일을 완료했어요: 건강검진"
    assert len(_todo_logs(db)) == logs_before + 2
    assert client.get(BASE).json() == []


@patch("app.services.notification_service.gmail_service.send_email")
@patch("app.services.notification_service.is_connected", return_value=True)
def test_recurring_next_occurrence_leaves_no_extra_notification(mock_connected, mock_send, client, seeded_db, spouse2):
    db = seeded_db["db"]
    created = client.post(
        BASE,
        json={"title": "분리수거", "due_date": "2026-07-01", "frequency": "weekly", "assignee_id": str(spouse2.id)},
    ).json()
    assert len(_todo_logs(db)) == 1

    client.patch(f"{BASE}/{created['id']}/complete", json={"completed": True})

    # 완료 알림 1건만 늘고, 다음 회차 생성은 알리지 않는다
    assert mock_send.call_count == 1
    assert len(_todo_logs(db)) == 2
    open_items = client.get(BASE).json()
    assert len(open_items) == 1
    assert open_items[0]["id"] != created["id"]
    assert open_items[0]["frequency"] == "weekly"


@patch("app.services.notification_service.gmail_service.send_email", side_effect=RuntimeError("boom"))
@patch("app.services.notification_service.is_connected", return_value=True)
def test_mail_failure_does_not_block_save(mock_connected, mock_send, client, spouse2):
    resp = client.post(BASE, json={"title": "저장은 성공", "assignee_id": str(spouse2.id)})

    assert resp.status_code == 201
    assert client.get(BASE).json()[0]["title"] == "저장은 성공"
