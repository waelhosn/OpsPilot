from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

try:
    # Local package import path (e.g., `uvicorn apps.api.main:app`)
    from .app.config import get_settings
    from .app.deps import get_current_user, get_db
    from .app.database import init_db
    from .app.models import User, Workspace, WorkspaceMember
    from .app.routers import auth, events, inventory, workspaces
    from .app.schemas import MeResponse, MembershipOut
except ImportError:
    # Vercel project-root import path (e.g., `from main import app`)
    from app.config import get_settings
    from app.deps import get_current_user, get_db
    from app.database import init_db
    from app.models import User, Workspace, WorkspaceMember
    from app.routers import auth, events, inventory, workspaces
    from app.schemas import MeResponse, MembershipOut

app = FastAPI(title="AI Engineering Assessment API", version="1.0.0")
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins(),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type"],
    max_age=600,
)


@app.on_event("startup")
def startup() -> None:
    # Keep metadata imports loaded; DB schema should be created via Alembic.
    init_db()


@app.get("/")
def health() -> dict:
    return {"status": "ok", "service": "api"}


@app.get("/me", response_model=MeResponse)
def me_alias(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
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


app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(inventory.router)
app.include_router(events.router)
