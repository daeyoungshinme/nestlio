from app.services import category_service


def test_create_and_update_category(db_session):
    category = category_service.create_category(db_session, "외식비", "variable", "#f97316")

    updated = category_service.update_category(db_session, category.id, "외식/배달비", "variable", "#fb923c")

    assert updated.name == "외식/배달비"
    assert updated.color == "#fb923c"


def test_deactivate_category_excluded_by_default_but_visible_with_active_only_false(db_session):
    category = category_service.create_category(db_session, "임시카테고리", "variable", "#94a3b8")

    category_service.deactivate_category(db_session, category.id)

    active = category_service.list_categories(db_session, active_only=True)
    assert all(c.id != category.id for c in active)

    everything = category_service.list_categories(db_session, active_only=False)
    assert any(c.id == category.id for c in everything)
