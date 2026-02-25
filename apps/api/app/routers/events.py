from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, get_workspace_id, require_membership
from ..models import Event, EventInvite, User
from ..schemas import (
    EventDescriptionRequest,
    EventDescriptionResponse,
    EventCreate,
    EventDraft,
    EventInviteCreateRequest,
    EventInviteOut,
    EventInviteRespondRequest,
    EventOut,
    EventUpdate,
    InviteMessageRequest,
    InviteMessageResponse,
    NLCreateRequest,
    SuggestAlternativesRequest,
)
from ..services.ai_service import ai_service

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventOut])
def list_events(
    query: str | None = Query(default=None),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    location: str | None = Query(default=None),
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EventOut]:
    require_membership(db, current_user.id, workspace_id)

    q = db.query(Event).filter(Event.workspace_id == workspace_id)
    if query:
        like = f"%{query.lower()}%"
        q = q.filter(func.lower(Event.title).like(like))
    if location:
        q = q.filter(func.lower(Event.location).like(f"%{location.lower()}%"))
    if date_from:
        try:
            parsed_from = datetime.fromisoformat(date_from)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid 'from' datetime") from exc
        q = q.filter(Event.start_at >= parsed_from)
    if date_to:
        try:
            parsed_to = datetime.fromisoformat(date_to)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid 'to' datetime") from exc
        q = q.filter(Event.start_at <= parsed_to)

    return q.order_by(Event.start_at.asc()).all()


@router.post("", response_model=EventOut)
def create_event(
    payload: EventCreate,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventOut:
    require_membership(db, current_user.id, workspace_id)

    if payload.end_at <= payload.start_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_at must be after start_at")

    event = Event(
        workspace_id=workspace_id,
        title=payload.title,
        start_at=payload.start_at,
        end_at=payload.end_at,
        location=payload.location or "",
        description=payload.description or "",
        status=payload.status,
        created_by=current_user.id,
    )
    db.add(event)
    db.flush()

    for email in payload.invitees:
        invited_user = db.query(User).filter(User.email == str(email)).first()
        db.add(
            EventInvite(
                event_id=event.id,
                invited_user_email=str(email),
                invited_user_id=invited_user.id if invited_user else None,
            )
        )

    db.commit()
    db.refresh(event)
    return event


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: int,
    payload: EventUpdate,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventOut:
    require_membership(db, current_user.id, workspace_id)

    event = db.query(Event).filter(Event.id == event_id, Event.workspace_id == workspace_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    updates = payload.model_dump(exclude_unset=True)
    invitees = updates.pop("invitees", None)
    for key, value in updates.items():
        setattr(event, key, value)

    if event.end_at <= event.start_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_at must be after start_at")

    if invitees is not None:
        requested_by_lower: dict[str, str] = {}
        for email in invitees:
            requested_by_lower[str(email).lower()] = str(email)

        existing_invites = db.query(EventInvite).filter(EventInvite.event_id == event.id).all()
        existing_by_lower = {invite.invited_user_email.lower(): invite for invite in existing_invites}

        for lower_email, invite in existing_by_lower.items():
            if lower_email not in requested_by_lower:
                db.delete(invite)

        for lower_email, raw_email in requested_by_lower.items():
            if lower_email in existing_by_lower:
                continue
            invited_user = db.query(User).filter(User.email == raw_email).first()
            db.add(
                EventInvite(
                    event_id=event.id,
                    invited_user_email=raw_email,
                    invited_user_id=invited_user.id if invited_user else None,
                )
            )

    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}")
def delete_event(
    event_id: int,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_membership(db, current_user.id, workspace_id)

    event = db.query(Event).filter(Event.id == event_id, Event.workspace_id == workspace_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    db.query(EventInvite).filter(EventInvite.event_id == event.id).delete()
    db.delete(event)
    db.commit()
    return {"message": "Event deleted", "id": event_id}


@router.post("/{event_id}/invite", response_model=EventInviteOut)
def invite_to_event(
    event_id: int,
    payload: EventInviteCreateRequest,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventInviteOut:
    require_membership(db, current_user.id, workspace_id)

    event = db.query(Event).filter(Event.id == event_id, Event.workspace_id == workspace_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    invited_user = db.query(User).filter(User.email == str(payload.email)).first()
    invite = EventInvite(
        event_id=event_id,
        invited_user_email=str(payload.email),
        invited_user_id=invited_user.id if invited_user else None,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.get("/{event_id}/invites", response_model=list[EventInviteOut])
def list_event_invites(
    event_id: int,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EventInviteOut]:
    require_membership(db, current_user.id, workspace_id)

    event = db.query(Event).filter(Event.id == event_id, Event.workspace_id == workspace_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    return (
        db.query(EventInvite)
        .filter(EventInvite.event_id == event_id)
        .order_by(EventInvite.invited_at.desc())
        .all()
    )


@router.post("/invites/respond", response_model=EventInviteOut)
def respond_invite(
    payload: EventInviteRespondRequest,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventInviteOut:
    require_membership(db, current_user.id, workspace_id)

    invite = (
        db.query(EventInvite)
        .join(Event, Event.id == EventInvite.event_id)
        .filter(
            EventInvite.id == payload.invite_id,
            Event.workspace_id == workspace_id,
            or_(EventInvite.invited_user_id == current_user.id, EventInvite.invited_user_email == current_user.email),
        )
        .first()
    )
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    invite.status = payload.status
    db.commit()
    db.refresh(invite)
    return invite


@router.post("/invites/accept", response_model=EventInviteOut)
def accept_invite_alias(
    payload: EventInviteRespondRequest,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventInviteOut:
    return respond_invite(payload, workspace_id, current_user, db)


@router.post("/nl-create", response_model=EventDraft)
def nl_create(
    payload: NLCreateRequest,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventDraft:
    require_membership(db, current_user.id, workspace_id)
    return ai_service.create_event_draft(db, current_user.id, workspace_id, payload.prompt)


@router.post("/suggest-alternatives")
def suggest_alternatives(
    payload: SuggestAlternativesRequest,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_membership(db, current_user.id, workspace_id)

    overlapping_events = (
        db.query(Event)
        .filter(
            Event.workspace_id == workspace_id,
            and_(Event.start_at < payload.end_at, Event.end_at > payload.start_at),
        )
        .order_by(Event.start_at.asc())
        .all()
    )

    suggestions = ai_service.suggest_event_alternatives(
        db,
        current_user.id,
        workspace_id,
        payload.start_at,
        payload.end_at,
        overlapping_events,
    )

    return {
        "has_conflict": bool(overlapping_events),
        "conflicts": [EventOut.model_validate(ev).model_dump() for ev in overlapping_events],
        "suggestions": [s.model_dump() for s in suggestions],
    }


@router.post("/generate-description", response_model=EventDescriptionResponse)
def generate_event_description(
    payload: EventDescriptionRequest,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventDescriptionResponse:
    require_membership(db, current_user.id, workspace_id)
    return ai_service.generate_event_description(
        db,
        current_user.id,
        workspace_id,
        title=payload.title,
        start_at=payload.start_at,
        end_at=payload.end_at,
        location=payload.location or "",
        description=payload.description or "",
    )


@router.post("/generate-invite-message", response_model=InviteMessageResponse)
def generate_invite_message(
    payload: InviteMessageRequest,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InviteMessageResponse:
    require_membership(db, current_user.id, workspace_id)
    return ai_service.generate_invite_message(
        db,
        current_user.id,
        workspace_id,
        title=payload.title,
        start_at=payload.start_at,
        end_at=payload.end_at,
        location=payload.location or "",
        description=payload.description or "",
    )
