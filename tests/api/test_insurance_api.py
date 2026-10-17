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


def test_riders_roundtrip_and_limits(client):
    rider = {"name": "암진단", "coverage": "cancer", "coverage_amount": "30000000", "premium": "40000"}
    resp = client.post("/api/v1/insurance-policies", json={**BODY, "premium_amount": "60000", "payment_frequency": "monthly", "riders": [rider]})
    assert resp.status_code == 201
    body = resp.json()
    assert body["riders"][0]["coverage"] == "cancer"
    assert Decimal(body["riders_monthly_premium"]) == Decimal("40000")
    assert Decimal(body["main_monthly_premium"]) == Decimal("20000")

    assert client.post("/api/v1/insurance-policies", json={**BODY, "riders": [rider] * 41}).status_code == 422
    assert client.post("/api/v1/insurance-policies", json={**BODY, "riders": [{**rider, "coverage": "pet"}]}).status_code == 422
    assert client.post("/api/v1/insurance-policies", json={**BODY, "riders": [{**rider, "coverage_amount": "1000000000000"}]}).status_code == 422


def test_legacy_rider_coverage_falls_back_to_other(client, seeded_db):
    from app.models.insurance_rider import InsuranceRider

    db = seeded_db["db"]
    policy = InsurancePolicy(name="옛", policy_type="other", premium_amount=10000, payment_frequency="monthly",
                             is_renewable=False, coverages=[], is_active=True, sort_order=0)
    policy.riders = [InsuranceRider(name="옛 특약", coverage="old_tag", premium=1000, is_renewable=False, sort_order=0)]
    db.add(policy)
    db.commit()

    [out] = client.get("/api/v1/insurance-policies").json()
    assert out["riders"][0]["coverage"] == "other"


def test_rider_update_keeps_fields_not_sent(client, seeded_db):
    """프론트가 보내지 않는 end_date를 다른 필드 수정 때 지우지 않는다(기존 특약은 보낸 필드만 갱신)."""
    from datetime import date

    from app.models.insurance_rider import InsuranceRider

    rider = {"name": "암진단", "coverage": "cancer", "premium": "40000", "end_date": "2040-05-01"}
    body = client.post("/api/v1/insurance-policies", json={**BODY, "riders": [rider]}).json()
    rider_id = body["riders"][0]["id"]

    put = client.put(
        f"/api/v1/insurance-policies/{body['id']}",
        json={**BODY, "riders": [{"id": rider_id, "name": "암진단", "coverage": "cancer", "premium": "45000"}]},
    )

    assert put.status_code == 200
    [out] = put.json()["riders"]
    assert out["end_date"] == "2040-05-01"
    assert Decimal(out["premium"]) == Decimal("45000")
    assert seeded_db["db"].get(InsuranceRider, rider_id).end_date == date(2040, 5, 1)


def test_legacy_payment_frequency_falls_back_to_monthly(client, seeded_db):
    db = seeded_db["db"]
    db.add(
        InsurancePolicy(
            name="옛 계약", policy_type="other", premium_amount=10000, payment_frequency="quarterly",
            is_renewable=False, coverages=[], is_active=True, sort_order=0,
        )
    )
    db.commit()

    [policy] = client.get("/api/v1/insurance-policies").json()
    assert policy["payment_frequency"] == "monthly"
    assert Decimal(policy["monthly_premium"]) == Decimal("10000")
