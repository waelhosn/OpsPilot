"""Add vendor column to inventory items

Revision ID: 0002_add_inventory_vendor
Revises: 0001_initial_schema
Create Date: 2026-02-26 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0002_add_inventory_vendor"
down_revision: Union[str, Sequence[str], None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inventory_items", sa.Column("vendor", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory_items", "vendor")
