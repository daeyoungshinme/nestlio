from decimal import Decimal


def test_get_net_worth_aggregates_current_state(client):
    client.post("/api/v1/accounts", json={"name": "주거래통장", "account_type": "bank", "initial_balance": "1000000"})
    client.post(
        "/api/v1/savings-products",
        json={"name": "적금", "current_balance": "2000000", "monthly_saving_amount": "300000"},
    )
    client.post(
        "/api/v1/loans",
        json={
            "name": "신용대출",
            "balance": "500000",
            "monthly_payment": "50000",
            "origination_year_month": None,
            "term_months": None,
            "interest_rate": None,
            "repayment_method": None,
        },
    )

    resp = client.get("/api/v1/net-worth")

    assert resp.status_code == 200
    body = resp.json()
    assert Decimal(body["current"]["net_worth"]) == Decimal("2500000")
    assert body["history"] == []
