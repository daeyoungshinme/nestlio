def _even_targets(year: int, monthly: str) -> list[dict]:
    return [{"year_month": f"{year}-{month:02d}", "target_amount": monthly} for month in range(1, 13)]


def test_list_annual_savings_goals_empty(client):
    resp = client.get("/api/v1/external/annual-savings-goals")

    assert resp.status_code == 200
    assert resp.json() == []


def test_list_annual_savings_goals_returns_target_fields_only(client):
    client.put(
        "/api/v1/annual-savings-goals/2026",
        json={"monthly_targets": _even_targets(2026, "1000000")},
    )

    resp = client.get("/api/v1/external/annual-savings-goals")

    assert resp.status_code == 200
    [goal] = resp.json()
    assert goal["year"] == 2026
    assert goal["target_amount_krw"] == "12000000.00"
    assert goal["monthly_target_krw"] == "1000000.00"
    # 진행률/달성률 등 nestlio 화면 전용 필드는 이 외부용 스키마에 없다
    assert "net_savings_ytd" not in goal
    assert "monthly_targets" not in goal
