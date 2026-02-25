from apps.api.app.services.ai_service import ai_service


def test_receipt_parse_extracts_items(db_session):
    raw_text = """
Acme Supplies
2 x USB-C Cable
Notebook 5 units 12.50
""".strip()

    extraction = ai_service.parse_receipt(
        db=db_session,
        user_id=1,
        workspace_id=1,
        raw_text=raw_text,
    )

    assert extraction.vendor == "Acme Supplies"
    assert len(extraction.items) >= 1
    assert any(item.name for item in extraction.items)
