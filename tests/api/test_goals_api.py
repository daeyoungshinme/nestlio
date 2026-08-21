def test_create_and_list_goal(client, seeded_db):
    resp = client.post(
        "/api/v1/financial-goals",
        json={"priority": 1, "name": "내집마련", "required_amount": "100000000", "monthly_saving_amount": "500000"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "goal"
    assert body["name"] == "내집마련"

    list_resp = client.get("/api/v1/financial-goals")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


def test_update_goal_not_found(client, seeded_db):
    resp = client.put(
        "/api/v1/financial-goals/999",
        json={"priority": 1, "name": "x", "target_age": None, "required_amount": "1", "monthly_saving_amount": "0"},
    )
    assert resp.status_code == 404


def test_create_and_list_challenge(client, seeded_db):
    resp = client.post(
        "/api/v1/financial-goals",
        json={
            "kind": "challenge",
            "name": "외식비 줄이기",
            "description": "이번 달 외식비 30만원 이하로",
            "required_amount": "300000",
            "start_date": "2026-08-01",
            "target_date": "2026-08-31",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "challenge"
    assert body["status"] == "active"
    assert body["effective_status"] == "active"

    list_resp = client.get("/api/v1/financial-goals")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


def test_update_challenge_progress_reaching_target_succeeds(client, seeded_db):
    created = client.post(
        "/api/v1/financial-goals",
        json={
            "kind": "challenge",
            "name": "외식비 줄이기",
            "required_amount": "300000",
            "start_date": "2026-08-01",
            "target_date": "2026-08-31",
        },
    ).json()

    resp = client.put(
        f"/api/v1/financial-goals/{created['id']}",
        json={
            "priority": 1,
            "name": "외식비 줄이기",
            "target_age": None,
            "required_amount": "300000",
            "monthly_saving_amount": "0",
            "current_amount": "300000",
            "start_date": "2026-08-01",
            "target_date": "2026-08-31",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "succeeded"
    assert body["progress_pct"] == "100"


def test_create_goal_with_monthly_targets_keeps_required_amount_as_sent(client, seeded_db):
    """kind="goal"은 monthly_targets 합계로 required_amount를 덮어쓰지 않는다 — 월별 계획은
    필요금액을 나눈 페이스 참고치일 뿐, 필요금액은 사용자가 직접 정한 값 그대로다."""
    resp = client.post(
        "/api/v1/financial-goals",
        json={
            "kind": "goal",
            "name": "여행자금",
            "required_amount": "300000",
            "monthly_saving_amount": "0",
            "target_date": "2026-10-31",
            "monthly_targets": [
                {"year_month": "2026-09", "target_amount": "150000"},
                {"year_month": "2026-10", "target_amount": "150000"},
            ],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["required_amount"] == "300000.00"
    assert [mt["year_month"] for mt in body["monthly_targets"]] == ["2026-09", "2026-10"]
    assert all(mt["is_auto_computed"] is False for mt in body["monthly_targets"])


def test_update_monthly_target_achieved(client, seeded_db):
    created = client.post(
        "/api/v1/financial-goals",
        json={
            "kind": "goal",
            "name": "명절비용",
            "required_amount": "100000",
            "monthly_saving_amount": "0",
            "target_date": "2026-09-30",
            "monthly_targets": [{"year_month": "2026-09", "target_amount": "100000"}],
        },
    ).json()

    resp = client.patch(
        f"/api/v1/financial-goals/{created['id']}/monthly-targets/2026-09",
        json={"achieved_amount": "100000"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["current_amount"] == "100000.00"
    assert body["progress_pct"] == "100"
    assert body["monthly_targets"][0]["is_achieved"] is True


def test_update_monthly_target_achieved_month_not_found(client, seeded_db):
    created = client.post(
        "/api/v1/financial-goals",
        json={
            "kind": "goal",
            "name": "명절비용",
            "required_amount": "100000",
            "monthly_saving_amount": "0",
            "target_date": "2026-09-30",
            "monthly_targets": [{"year_month": "2026-09", "target_amount": "100000"}],
        },
    ).json()

    resp = client.patch(
        f"/api/v1/financial-goals/{created['id']}/monthly-targets/2026-12",
        json={"achieved_amount": "1000"},
    )

    assert resp.status_code == 404


def test_update_monthly_target_achieved_goal_not_found(client, seeded_db):
    resp = client.patch(
        "/api/v1/financial-goals/999/monthly-targets/2026-09",
        json={"achieved_amount": "1000"},
    )
    assert resp.status_code == 404


def test_link_savings_product_already_linked_to_another_goal_returns_409(client, seeded_db):
    product = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "0", "product_type": "savings"},
    ).json()
    client.post(
        "/api/v1/financial-goals",
        json={
            "priority": 1,
            "name": "여행자금",
            "required_amount": "5000000",
            "monthly_saving_amount": "200000",
            "funding_sources": [{"type": "savings_product", "id": product["id"]}],
        },
    )

    resp = client.post(
        "/api/v1/financial-goals",
        json={
            "priority": 1,
            "name": "내집마련",
            "required_amount": "100000000",
            "monthly_saving_amount": "500000",
            "funding_sources": [{"type": "savings_product", "id": product["id"]}],
        },
    )

    assert resp.status_code == 409


def test_linking_savings_product_syncs_its_monthly_plan_amount(client, seeded_db):
    product = client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "0", "monthly_saving_amount": "50000", "product_type": "savings"},
    ).json()

    client.post(
        "/api/v1/financial-goals",
        json={
            "priority": 1,
            "name": "여행자금",
            "required_amount": "5000000",
            "monthly_saving_amount": "200000",
            "funding_sources": [{"type": "savings_product", "id": product["id"]}],
        },
    )

    updated_product = client.get("/api/v1/savings-products").json()[0]
    assert updated_product["monthly_saving_amount"] == "200000.00"
    assert updated_product["linked_goal_id"] is not None


def test_delete_goal(client, seeded_db):
    created = client.post(
        "/api/v1/financial-goals",
        json={"priority": 1, "name": "여행자금", "required_amount": "5000000", "monthly_saving_amount": "200000"},
    ).json()

    resp = client.delete(f"/api/v1/financial-goals/{created['id']}")

    assert resp.status_code == 204
    assert client.get("/api/v1/financial-goals").json() == []
