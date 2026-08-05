"""AI reports and notifications

Revision ID: 003_ai_intelligence
Revises: 002_analytics
"""
from alembic import op
import sqlalchemy as sa
revision, down_revision = "003_ai_intelligence", "002_analytics"
branch_labels = depends_on = None
def upgrade():
    op.create_table("ai_reports", sa.Column("id", sa.Integer, primary_key=True), sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("status", sa.String(32), nullable=False), sa.Column("content", sa.Text), sa.Column("file_path", sa.String(1024)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("completed_at", sa.DateTime(timezone=True)))
    op.create_index("ix_ai_reports_user_id", "ai_reports", ["user_id"])
    op.create_table("notifications", sa.Column("id", sa.Integer, primary_key=True), sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("type", sa.String(64), nullable=False), sa.Column("message", sa.Text, nullable=False), sa.Column("read", sa.Boolean, nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
def downgrade():
    op.drop_table("notifications"); op.drop_table("ai_reports")
