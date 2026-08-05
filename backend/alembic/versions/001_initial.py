"""initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-08-04
"""
from alembic import op
import sqlalchemy as sa
revision = "001_initial"
down_revision = None
branch_labels = depends_on = None
def upgrade():
    op.create_table("users", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("github_id", sa.Integer(), nullable=False, unique=True), sa.Column("login", sa.String(255), nullable=False, unique=True), sa.Column("name", sa.String(255)), sa.Column("avatar_url", sa.String(2048)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_users_github_id", "users", ["github_id"]); op.create_index("ix_users_login", "users", ["login"])
    op.create_table("github_accounts", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True), sa.Column("access_token", sa.Text(), nullable=False), sa.Column("scope", sa.String(255)))
    op.create_table("repositories", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("github_id", sa.Integer(), nullable=False), sa.Column("name", sa.String(255), nullable=False), sa.Column("full_name", sa.String(512), nullable=False), sa.Column("html_url", sa.String(2048), nullable=False), sa.Column("description", sa.Text()), sa.Column("is_private", sa.Boolean(), nullable=False), sa.Column("language", sa.String(64)), sa.Column("stars", sa.Integer(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True)), sa.UniqueConstraint("user_id", "github_id", name="uq_repository_user_github"))
    op.create_index("ix_repositories_user_id", "repositories", ["user_id"])
    op.create_table("sync_jobs", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("status", sa.String(32), nullable=False), sa.Column("error", sa.Text()), sa.Column("started_at", sa.DateTime(timezone=True)), sa.Column("completed_at", sa.DateTime(timezone=True)))
    op.create_index("ix_sync_jobs_user_id", "sync_jobs", ["user_id"])
def downgrade():
    op.drop_table("sync_jobs"); op.drop_table("repositories"); op.drop_table("github_accounts"); op.drop_table("users")
