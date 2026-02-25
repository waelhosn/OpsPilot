from apps.api.app.services.ai_service import ai_service


def test_event_nl_create_returns_valid_draft(db_session):
    prompt = "Team standup tomorrow 10am for 15 minutes invite sara@example.com"

    draft = ai_service.create_event_draft(
        db=db_session,
        user_id=1,
        workspace_id=1,
        prompt=prompt,
    )

    assert draft.title
    assert draft.end_at > draft.start_at
    assert "sara@example.com" in draft.invitees


def test_event_nl_fallback_preserves_explicit_noon_time():
    prompt = "i have a standup meeting tomorrow at 12pm with wael@gmail.com"

    draft = ai_service._event_draft_fallback(prompt)  # deterministic parser path

    assert draft.start_at.hour == 12
    assert draft.start_at.minute == 0
    assert draft.end_at.hour == 13
    assert draft.end_at.minute == 0
    assert "wael@gmail.com" in draft.invitees


def test_event_nl_create_overrides_model_time_with_explicit_prompt_time(db_session, monkeypatch):
    prompt = "i have a standup meeting tomorrow at 12pm with wael@gmail.com"

    def fake_model_json(_: str) -> dict:
        return {
            "title": "Standup Meeting",
            "start_at": "2030-01-01T14:00:00Z",
            "end_at": "2030-01-01T15:00:00Z",
            "location": "",
            "description": "",
            "invitees": ["wael@gmail.com"],
        }

    monkeypatch.setattr(ai_service, "_call_model_for_json", fake_model_json)

    draft = ai_service.create_event_draft(
        db=db_session,
        user_id=1,
        workspace_id=1,
        prompt=prompt,
    )

    assert draft.start_at.hour == 12
    assert draft.start_at.minute == 0
    assert draft.end_at.hour == 13
    assert draft.end_at.minute == 0
    assert "wael@gmail.com" in draft.invitees
