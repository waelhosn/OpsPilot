"""Initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-02-24 00:00:00
"""

import os
from typing import Sequence, Union

from alembic import op
from passlib.context import CryptContext
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

role_enum = sa.Enum("admin", "member", name="role", native_enum=False)
inventory_status_enum = sa.Enum(
    "in_stock", "low_stock", "ordered", "discontinued", name="inventorystatus", native_enum=False
)
event_attendance_enum = sa.Enum(
    "upcoming", "attending", "maybe", "declined", name="eventattendance", native_enum=False
)


def _seed_bootstrap_admin() -> None:
    bind = op.get_bind()

    workspace_name = os.getenv("DEFAULT_WORKSPACE_NAME", "OpsPilot Team").strip() or "OpsPilot Team"
    admin_email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@opspilot.local").strip().lower()
    admin_name = os.getenv("BOOTSTRAP_ADMIN_NAME", "OpsPilot Admin").strip() or "OpsPilot Admin"
    provided_hash = os.getenv("BOOTSTRAP_ADMIN_PASSWORD_HASH", "").strip()
    if provided_hash:
        admin_password_hash = provided_hash
    else:
        admin_password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "Admin@123456")
        admin_password_hash = pwd_context.hash(admin_password)

    workspace_id = bind.execute(
        sa.text("SELECT id FROM workspaces WHERE name = :name ORDER BY id LIMIT 1"),
        {"name": workspace_name},
    ).scalar()
    if workspace_id is None:
        bind.execute(sa.text("INSERT INTO workspaces (name) VALUES (:name)"), {"name": workspace_name})
        workspace_id = bind.execute(
            sa.text("SELECT id FROM workspaces WHERE name = :name ORDER BY id LIMIT 1"),
            {"name": workspace_name},
        ).scalar()

    user_id = bind.execute(
        sa.text("SELECT id FROM users WHERE email = :email ORDER BY id LIMIT 1"),
        {"email": admin_email},
    ).scalar()
    if user_id is None:
        bind.execute(
            sa.text(
                """
                INSERT INTO users (email, name, password_hash)
                VALUES (:email, :name, :password_hash)
                """
            ),
            {"email": admin_email, "name": admin_name, "password_hash": admin_password_hash},
        )
        user_id = bind.execute(
            sa.text("SELECT id FROM users WHERE email = :email ORDER BY id LIMIT 1"),
            {"email": admin_email},
        ).scalar()

    membership_id = bind.execute(
        sa.text(
            """
            SELECT id
            FROM workspace_members
            WHERE workspace_id = :workspace_id AND user_id = :user_id
            ORDER BY id
            LIMIT 1
            """
        ),
        {"workspace_id": workspace_id, "user_id": user_id},
    ).scalar()

    if membership_id is None:
        bind.execute(
            sa.text(
                """
                INSERT INTO workspace_members (workspace_id, user_id, role)
                VALUES (:workspace_id, :user_id, :role)
                """
            ),
            {"workspace_id": workspace_id, "user_id": user_id, "role": "admin"},
        )
    else:
        bind.execute(
            sa.text("UPDATE workspace_members SET role = :role WHERE id = :membership_id"),
            {"role": "admin", "membership_id": membership_id},
        )


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_workspaces_id", "workspaces", ["id"], unique=False)

    op.create_table(
        "workspace_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", role_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_workspace_members_workspace_id", "workspace_members", ["workspace_id"], unique=False)
    op.create_index("ix_workspace_members_user_id", "workspace_members", ["user_id"], unique=False)
    _seed_bootstrap_admin()

    op.create_table(
        "inventory_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=128), nullable=False, server_default="general"),
        sa.Column("quantity", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unit", sa.String(length=50), nullable=False, server_default="units"),
        sa.Column("low_stock_threshold", sa.Float(), nullable=False, server_default="1"),
        sa.Column("status", inventory_status_enum, nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_inventory_items_id", "inventory_items", ["id"], unique=False)
    op.create_index("ix_inventory_items_workspace_id", "inventory_items", ["workspace_id"], unique=False)
    op.create_index("ix_inventory_items_normalized_name", "inventory_items", ["normalized_name"], unique=False)

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("start_at", sa.DateTime(), nullable=False),
        sa.Column("end_at", sa.DateTime(), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", event_attendance_enum, nullable=False),
        sa.Column("invite_message", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_events_id", "events", ["id"], unique=False)
    op.create_index("ix_events_workspace_id", "events", ["workspace_id"], unique=False)
    op.create_index("ix_events_start_at", "events", ["start_at"], unique=False)
    op.create_index("ix_events_end_at", "events", ["end_at"], unique=False)
    op.create_index("ix_events_created_by", "events", ["created_by"], unique=False)

    op.create_table(
        "event_invites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("events.id"), nullable=False),
        sa.Column("invited_user_email", sa.String(length=255), nullable=False),
        sa.Column("invited_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", event_attendance_enum, nullable=False),
        sa.Column("invited_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_event_invites_id", "event_invites", ["id"], unique=False)
    op.create_index("ix_event_invites_event_id", "event_invites", ["event_id"], unique=False)
    op.create_index("ix_event_invites_invited_user_email", "event_invites", ["invited_user_email"], unique=False)

    op.create_table(
        "ai_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("workspace_id", sa.Integer(), nullable=False),
        sa.Column("feature", sa.String(length=100), nullable=False),
        sa.Column("prompt_version", sa.String(length=50), nullable=False, server_default="v1"),
        sa.Column("model", sa.String(length=100), nullable=False, server_default="mock"),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_ai_runs_id", "ai_runs", ["id"], unique=False)
    op.create_index("ix_ai_runs_user_id", "ai_runs", ["user_id"], unique=False)
    op.create_index("ix_ai_runs_workspace_id", "ai_runs", ["workspace_id"], unique=False)
    op.create_index("ix_ai_runs_feature", "ai_runs", ["feature"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_runs_feature", table_name="ai_runs")
    op.drop_index("ix_ai_runs_workspace_id", table_name="ai_runs")
    op.drop_index("ix_ai_runs_user_id", table_name="ai_runs")
    op.drop_index("ix_ai_runs_id", table_name="ai_runs")
    op.drop_table("ai_runs")

    op.drop_index("ix_event_invites_invited_user_email", table_name="event_invites")
    op.drop_index("ix_event_invites_event_id", table_name="event_invites")
    op.drop_index("ix_event_invites_id", table_name="event_invites")
    op.drop_table("event_invites")

    op.drop_index("ix_events_created_by", table_name="events")
    op.drop_index("ix_events_end_at", table_name="events")
    op.drop_index("ix_events_start_at", table_name="events")
    op.drop_index("ix_events_workspace_id", table_name="events")
    op.drop_index("ix_events_id", table_name="events")
    op.drop_table("events")

    op.drop_index("ix_inventory_items_normalized_name", table_name="inventory_items")
    op.drop_index("ix_inventory_items_workspace_id", table_name="inventory_items")
    op.drop_index("ix_inventory_items_id", table_name="inventory_items")
    op.drop_table("inventory_items")

    op.drop_index("ix_workspace_members_user_id", table_name="workspace_members")
    op.drop_index("ix_workspace_members_workspace_id", table_name="workspace_members")
    op.drop_table("workspace_members")

    op.drop_index("ix_workspaces_id", table_name="workspaces")
    op.drop_table("workspaces")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")
