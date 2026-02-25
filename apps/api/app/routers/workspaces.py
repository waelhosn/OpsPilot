from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, require_membership
from ..models import Role, User, Workspace, WorkspaceMember
from ..schemas import (
    WorkspaceCreateRequest,
    WorkspaceMemberInviteRequest,
    WorkspaceMemberOut,
    WorkspaceMemberRoleUpdateByEmailRequest,
    WorkspaceMemberRoleUpdateRequest,
    WorkspaceOut,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.post("", response_model=WorkspaceOut)
def create_workspace(
    payload: WorkspaceCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceOut:
    _ = payload, current_user, db
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Workspace creation is disabled in single-team mode",
    )


@router.post("/{workspace_id}/members/invite")
def invite_member(
    workspace_id: int,
    payload: WorkspaceMemberInviteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_membership(db, current_user.id, workspace_id, admin_only=True)

    invited_user = db.query(User).filter(User.email == payload.email).first()
    if not invited_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User with this email must register first",
        )

    existing = (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == invited_user.id)
        .first()
    )
    if existing:
        if existing.role != Role.admin:
            existing.role = Role.member
        db.commit()
        return {
            "message": "Existing member already linked",
            "member": {"name": invited_user.name, "email": invited_user.email, "role": existing.role.value},
        }

    membership = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=invited_user.id,
        role=Role.member,
    )
    db.add(membership)
    db.commit()
    return {
        "message": "Member added",
        "member": {"name": invited_user.name, "email": invited_user.email, "role": Role.member.value},
    }


@router.post("/{workspace_id}/invite_member")
def invite_member_alias(
    workspace_id: int,
    payload: WorkspaceMemberInviteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return invite_member(workspace_id, payload, current_user, db)


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberOut])
def list_members(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WorkspaceMemberOut]:
    require_membership(db, current_user.id, workspace_id, admin_only=True)

    rows = (
        db.query(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .filter(WorkspaceMember.workspace_id == workspace_id)
        .order_by(User.name.asc(), User.email.asc())
        .all()
    )
    return [
        WorkspaceMemberOut(name=user.name, email=user.email, role=membership.role, joined_at=membership.created_at)
        for membership, user in rows
    ]


@router.patch("/{workspace_id}/members/by-email")
def update_member_role_by_email(
    workspace_id: int,
    payload: WorkspaceMemberRoleUpdateByEmailRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return update_member_role(
        workspace_id=workspace_id,
        user_id=user.id,
        payload=WorkspaceMemberRoleUpdateRequest(role=payload.role),
        current_user=current_user,
        db=db,
    )


@router.patch("/{workspace_id}/members/{user_id}")
def update_member_role(
    workspace_id: int,
    user_id: int,
    payload: WorkspaceMemberRoleUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _ = user_id, payload
    require_membership(db, current_user.id, workspace_id, admin_only=True)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Role updates are disabled: users are members by default and the bootstrap admin is fixed",
    )
