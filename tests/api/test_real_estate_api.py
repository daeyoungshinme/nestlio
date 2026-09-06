from unittest.mock import patch


def test_list_growlio_real_estate_proxies_items(client):

    with patch(
        "app.services.real_estate_service.growlio_client.fetch_real_estate_items",
        return_value=[
            {
                "id": "growlio-re-1",
                "name": "서울 아파트",
                "market_value_krw": 800000000.0,
                "mortgage_balance_krw": 200000000.0,
                "net_equity_krw": 600000000.0,
            }
        ],
    ):
        resp = client.get("/api/v1/real-estate/growlio-accounts")

    assert resp.status_code == 200
    assert [item["id"] for item in resp.json()] == ["growlio-re-1"]


def test_sync_real_estate_404_when_missing(client):

    resp = client.post("/api/v1/real-estate/99999/sync")

    assert resp.status_code == 404
