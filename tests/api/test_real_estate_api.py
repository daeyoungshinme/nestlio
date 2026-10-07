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


def test_growlio_import_creates_property_and_paired_mortgage(client, seeded_db):
    item = {
        "id": "growlio-re-1",
        "name": "서울 아파트",
        "market_value_krw": 800000000.0,
        "mortgage_balance_krw": 200000000.0,
        "net_equity_krw": 600000000.0,
    }
    with patch("app.services.real_estate_service.growlio_client.fetch_real_estate_items", return_value=[item]):
        resp = client.post("/api/v1/real-estate/growlio-import", json={"growlio_account_ids": ["growlio-re-1"]})

    assert resp.status_code == 200
    [result] = resp.json()
    assert result["savings_product"]["product_type"] == "real_estate"
    assert result["savings_product"]["growlio_account_id"] == "growlio-re-1"
    assert result["loan"] is not None


def test_growlio_unconfigured_maps_to_501_not_500(client):
    from app.services import growlio_client

    with patch(
        "app.services.real_estate_service.growlio_client.fetch_real_estate_items",
        side_effect=growlio_client.GrowlioNotConfiguredError("growlio 연동이 설정되지 않았어요"),
    ):
        resp = client.get("/api/v1/real-estate/growlio-accounts")

    assert resp.status_code == 501
