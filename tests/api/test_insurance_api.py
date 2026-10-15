from decimal import Decimal

from app.models.insurance_policy import InsurancePolicy

BODY = {
    "name": "암보험",
    "policy_type": "diagnosis",
    "insured_name": "아이",
    "premium_amount": "1200000",
    "payment_frequency": "yearly",
    "coverages": ["cancer", "surgery"],
}


def test_create_list_update_deactivate(client):
    resp = client.post("/api/v1/insurance-policies", json=BODY)
    assert resp.status_code == 201
    body = resp.json()
    assert Decimal(body["monthly_premium"]) == Decimal("100000")
    assert body["coverages"] == ["cancer", "surgery"]

    assert [p["id"] for p in client.get("/api/v1/insurance-policies").json()] == [body["id"]]

    put = client.put(f"/api/v1/insurance-policies/{body['id']}", json={**BODY, "premium_amount": "60000", "payment_frequency": "monthly"})
    assert put.status_code == 200
    assert Decimal(put.json()["monthly_premium"]) == Decimal("60000")

    assert client.post(f"/api/v1/insurance-policies/{body['id']}/deactivate").status_code == 204
    assert client.get("/api/v1/insurance-policies").json() == []


def test_missing_policy_404(client):
    assert client.put("/api/v1/insurance-policies/999", json=BODY).status_code == 404
    assert client.post("/api/v1/insurance-policies/999/deactivate").status_code == 404


def test_unknown_recurring_link_404(client):
    assert client.post("/api/v1/insurance-policies", json={**BODY, "recurring_expense_id": 999}).status_code == 404


def test_input_validation_422(client):
    assert client.post("/api/v1/insurance-policies", json={**BODY, "policy_type": "pet"}).status_code == 422
    assert client.post("/api/v1/insurance-policies", json={**BODY, "coverages": ["unknown"]}).status_code == 422
    assert client.post("/api/v1/insurance-policies", json={**BODY, "premium_amount": "10000000000"}).status_code == 422
    assert client.post("/api/v1/insurance-policies", json={**BODY, "name": "x" * 101}).status_code == 422


def test_legacy_values_fall_back_on_output(client, seeded_db):
    db = seeded_db["db"]
    db.add(
        InsurancePolicy(
            name="옛 계약", policy_type="pet", premium_amount=10000, payment_frequency="monthly",
            is_renewable=False, coverages=["cancer", "old_tag"], is_active=True, sort_order=0,
        )
    )
    db.commit()

    [policy] = client.get("/api/v1/insurance-policies").json()
    assert policy["policy_type"] == "other"
    assert policy["coverages"] == ["cancer"]
