from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import create_access_token, hash_password, verify_password
from ..config import get_settings
from ..deps import get_current_user, get_db
from ..models import Role, User, Workspace, WorkspaceMember
from ..schemas import LoginRequest, MeResponse, MembershipOut, RegisterRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=payload.email, name=payload.name, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()

    workspace = db.query(Workspace).filter(Workspace.name == settings.default_workspace_name).first()
    if not workspace:
        workspace = Workspace(name=settings.default_workspace_name)
        db.add(workspace)
        db.flush()

    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=Role.member))
    db.commit()

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    memberships = (
        db.query(WorkspaceMember, Workspace)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == current_user.id)
        .all()
    )

    items = [
        MembershipOut(workspace_id=membership.workspace_id, workspace_name=workspace.name, role=membership.role)
        for membership, workspace in memberships
    ]
    return MeResponse(id=current_user.id, email=current_user.email, name=current_user.name, workspaces=items)
