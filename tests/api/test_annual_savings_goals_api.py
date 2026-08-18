def _even_targets(year: int, monthly: str) -> list[dict]:
    return [{"year_month": f"{year}-{month:02d}", "target_amount": monthly} for month in range(1, 13)]


def test_upsert_and_get_goal(client):
    resp = client.put(
        "/api/v1/annual-savings-goals/2026",
        json={"monthly_targets": _even_targets(2026, "1000000")},
    )
    assert resp.status_code == 200
    assert resp.json()["year"] == 2026
    assert resp.json()["target_amount_krw"] == "12000000.00"

    get_resp = client.get("/api/v1/annual-savings-goals/2026")
    assert get_resp.status_code == 200
    assert get_resp.json()["monthly_target_krw"] == "1000000.00"
    assert len(get_resp.json()["monthly_targets"]) == 12


def test_get_goal_includes_progress_fields(client):
    """거래내역이 없으면 진행률 필드가 전부 0/None으로 내려온다 (계산 자체는
    tests/test_annual_savings_goal_service.py의 compute_progress 케이스가 상세 검증)."""
    from decimal import Decimal

    client.put("/api/v1/annual-savings-goals/2026", json={"monthly_targets": _even_targets(2026, "1000000")})

    resp = client.get("/api/v1/annual-savings-goals/2026")

    body = resp.json()
    assert Decimal(body["net_savings_ytd"]) == Decimal("0")
    assert Decimal(body["annual_achievement_pct"]) == Decimal("0")
    assert Decimal(body["current_month_savings"]) == Decimal("0")


def test_get_goal_not_found(client):
    resp = client.get("/api/v1/annual-savings-goals/1999")
    assert resp.status_code == 404


def test_list_goals(client):
    client.put("/api/v1/annual-savings-goals/2025", json={"monthly_targets": _even_targets(2025, "800000")})
    client.put("/api/v1/annual-savings-goals/2026", json={"monthly_targets": _even_targets(2026, "1000000")})

    resp = client.get("/api/v1/annual-savings-goals")

    assert resp.status_code == 200
    assert [g["year"] for g in resp.json()] == [2026, 2025]


def test_delete_goal(client):
    client.put("/api/v1/annual-savings-goals/2026", json={"monthly_targets": _even_targets(2026, "1000000")})

    resp = client.delete("/api/v1/annual-savings-goals/2026")

    assert resp.status_code == 204
    assert client.get("/api/v1/annual-savings-goals/2026").status_code == 404


def test_external_endpoint_exposes_goals_read_only(client):
    """growlio가 사용자 JWT를 그대로 전달해 호출하는 읽기전용 엔드포인트 — client 픽스처가
    get_current_user를 오버라이드하므로 '이미 인증된 호출자'를 가정해 응답 모양만 검증한다."""
    client.put("/api/v1/annual-savings-goals/2026", json={"monthly_targets": _even_targets(2026, "1000000")})

    resp = client.get("/api/v1/external/annual-savings-goals")

    assert resp.status_code == 200
    assert resp.json() == [
        {
            "year": 2026,
            "target_amount_krw": "12000000.00",
            "monthly_target_krw": "1000000.00",
        }
    ]
