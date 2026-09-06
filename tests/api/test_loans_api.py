def test_create_and_list_loans(client, seeded_db):
    user = seeded_db["user"]
    resp = client.post(
        "/api/v1/loans",
        json={
            "name": "전세자금대출",
            "balance": "50000000",
            "monthly_payment": "300000",
            "owner_user_id": str(user.id),
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "전세자금대출"
    assert body["owner_user_id"] == str(user.id)

    list_resp = client.get("/api/v1/loans")
    assert list_resp.status_code == 200
    assert any(loan["id"] == body["id"] for loan in list_resp.json())


def test_update_loan_404_when_missing(client):
    resp = client.put(
        "/api/v1/loans/99999",
        json={
            "name": "x",
            "balance": "0",
            "monthly_payment": "0",
            "origination_year_month": None,
            "term_months": None,
            "interest_rate": None,
            "repayment_method": None,
        },
    )
    assert resp.status_code == 404


def test_deactivate_loan_excludes_it_from_default_list(client):
    create_resp = client.post(
        "/api/v1/loans", json={"name": "마이너스통장", "balance": "1000000", "monthly_payment": "0"}
    )
    loan_id = create_resp.json()["id"]

    resp = client.post(f"/api/v1/loans/{loan_id}/deactivate")
    assert resp.status_code == 204

    list_resp = client.get("/api/v1/loans")
    assert all(loan["id"] != loan_id for loan in list_resp.json())


def test_deactivate_loan_404_when_missing(client):
    assert client.post("/api/v1/loans/99999/deactivate").status_code == 404
