from apps.api.app.config import get_settings
from apps.api.app.models import Role, User, Workspace, WorkspaceMember
from apps.api.app.routers.auth import register
from apps.api.app.schemas import RegisterRequest


def test_register_assigns_member_role(db_session):
    settings = get_settings()

    register(
        RegisterRequest(
            email="member1@example.com",
            name="Member One",
            password="strong-password-123",
        ),
        db_session,
    )

    user = db_session.query(User).filter(User.email == "member1@example.com").first()
    assert user is not None

    workspace = db_session.query(Workspace).filter(Workspace.name == settings.default_workspace_name).first()
    assert workspace is not None

    membership = (
        db_session.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace.id, WorkspaceMember.user_id == user.id)
        .first()
    )
    assert membership is not None
    assert membership.role == Role.member

