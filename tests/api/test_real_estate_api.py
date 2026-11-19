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


def test_sync_all_updates_property_and_paired_mortgage(client):
    """전체 동기화는 부동산 시세와 짝 담보대출 잔액을 함께 갱신하고, growlio 목록은 한 번만 조회한다."""
    item = {
        "id": "growlio-re-1",
        "name": "서울 아파트",
        "market_value_krw": 800000000.0,
        "mortgage_balance_krw": 200000000.0,
        "net_equity_krw": 600000000.0,
    }
    target = "app.services.real_estate_service.growlio_client.fetch_real_estate_items"
    with patch(target, return_value=[item]):
        [imported] = client.post(
            "/api/v1/real-estate/growlio-import", json={"growlio_account_ids": ["growlio-re-1"]}
        ).json()

    moved = {**item, "market_value_krw": 850000000.0, "mortgage_balance_krw": 190000000.0}
    with patch(target, return_value=[moved]) as fetch:
        resp = client.post("/api/v1/real-estate/sync-all")

    assert resp.status_code == 200
    assert resp.json() == {"synced_count": 1, "failed": []}
    fetch.assert_called_once()
    products = {p["id"]: p for p in client.get("/api/v1/savings-products").json()}
    assert products[imported["savings_product"]["id"]]["current_balance"] == "850000000.00"
    loans = {loan["id"]: loan for loan in client.get("/api/v1/loans").json()}
    assert loans[imported["loan"]["id"]]["balance"] == "190000000.00"


def test_sync_all_reports_property_missing_from_growlio(client):
    item = {"id": "growlio-re-1", "name": "서울 아파트", "market_value_krw": 800000000.0, "mortgage_balance_krw": 0}
    target = "app.services.real_estate_service.growlio_client.fetch_real_estate_items"
    with patch(target, return_value=[item]):
        [imported] = client.post(
            "/api/v1/real-estate/growlio-import", json={"growlio_account_ids": ["growlio-re-1"]}
        ).json()
    with patch(target, return_value=[]):
        resp = client.post("/api/v1/real-estate/sync-all")

    assert resp.status_code == 200
    body = resp.json()
    assert body["synced_count"] == 0
    assert [f["id"] for f in body["failed"]] == [imported["savings_product"]["id"]]
