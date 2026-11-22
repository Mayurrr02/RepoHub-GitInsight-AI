"""repository intelligence and ai assistant schema

Revision ID: 006_repository_intelligence
Revises: 005_api_keys
Create Date: 2026-11-23
"""
from alembic import op
import sqlalchemy as sa

revision = "006_repository_intelligence"
down_revision = "005_api_keys"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Extend existing tables with new Phase 1 columns
    with op.batch_alter_table("repositories") as batch_op:
        batch_op.add_column(sa.Column("default_branch", sa.String(255), server_default="main", nullable=True))

    with op.batch_alter_table("commits") as batch_op:
        batch_op.add_column(sa.Column("parent_shas", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("author_name", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("author_email", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("committer_name", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("committer_email", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("additions", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("deletions", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("total_changes", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("files_changed_count", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("commit_url", sa.String(2048), nullable=True))

    with op.batch_alter_table("pull_requests") as batch_op:
        batch_op.add_column(sa.Column("title", sa.String(512), nullable=True))
        batch_op.add_column(sa.Column("body", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("base_branch", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("head_branch", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("base_sha", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("head_sha", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("additions", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("deletions", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("changed_files_count", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("merge_commit_sha", sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("labels", sa.Text(), nullable=True))

    with op.batch_alter_table("issues") as batch_op:
        batch_op.add_column(sa.Column("number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("title", sa.String(512), nullable=True))
        batch_op.add_column(sa.Column("body", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("author_login", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("labels", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table("reviews") as batch_op:
        batch_op.add_column(sa.Column("body", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("commit_sha", sa.String(64), nullable=True))

    with op.batch_alter_table("ai_reports") as batch_op:
        batch_op.add_column(
            sa.Column(
                "repository_id",
                sa.Integer(),
                sa.ForeignKey("repositories.id", name="fk_ai_reports_repository_id", ondelete="CASCADE"),
                nullable=True,
            )
        )

    # 2. Create Branches table
    op.create_table(
        "branches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("commit_sha", sa.String(64), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("is_protected", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("repository_id", "name", name="uq_branch_repository_name"),
    )
    op.create_index("ix_branches_repository_id", "branches", ["repository_id"])

    # 3. Create CommitFileChanges table
    op.create_table(
        "commit_file_changes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("commit_id", sa.Integer(), sa.ForeignKey("commits.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("additions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("deletions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("changes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("patch", sa.Text(), nullable=True),
        sa.Column("previous_filename", sa.String(1024), nullable=True),
        sa.Column("blob_sha", sa.String(64), nullable=True),
    )
    op.create_index("ix_commit_file_changes_commit_id", "commit_file_changes", ["commit_id"])
    op.create_index("ix_commit_file_changes_repository_id", "commit_file_changes", ["repository_id"])
    op.create_index("ix_commit_file_changes_file_path", "commit_file_changes", ["file_path"])

    # 4. Create PullRequestFiles table
    op.create_table(
        "pull_request_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pull_request_id", sa.Integer(), sa.ForeignKey("pull_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("additions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("deletions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("patch", sa.Text(), nullable=True),
    )
    op.create_index("ix_pull_request_files_pull_request_id", "pull_request_files", ["pull_request_id"])

    # 5. Create ReviewComments table
    op.create_table(
        "review_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("review_id", sa.Integer(), sa.ForeignKey("reviews.id", ondelete="CASCADE"), nullable=True),
        sa.Column("pull_request_id", sa.Integer(), sa.ForeignKey("pull_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("github_id", sa.Integer(), nullable=False),
        sa.Column("path", sa.String(1024), nullable=True),
        sa.Column("line", sa.Integer(), nullable=True),
        sa.Column("commit_sha", sa.String(64), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("author_login", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("pull_request_id", "github_id", name="uq_review_comment_pr_github"),
    )
    op.create_index("ix_review_comments_review_id", "review_comments", ["review_id"])
    op.create_index("ix_review_comments_pull_request_id", "review_comments", ["pull_request_id"])

    # 6. Create IssueComments table
    op.create_table(
        "issue_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("issue_id", sa.Integer(), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("github_id", sa.Integer(), nullable=False),
        sa.Column("author_login", sa.String(255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("issue_id", "github_id", name="uq_issue_comment_github"),
    )
    op.create_index("ix_issue_comments_issue_id", "issue_comments", ["issue_id"])

    # 7. Create CodeChunks table
    op.create_table(
        "code_chunks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("commit_sha", sa.String(64), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("start_line", sa.Integer(), nullable=False),
        sa.Column("end_line", sa.Integer(), nullable=False),
        sa.Column("language", sa.String(64), nullable=False),
        sa.Column("chunk_type", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_code_chunks_repository_id", "code_chunks", ["repository_id"])
    op.create_index("ix_code_chunks_commit_sha", "code_chunks", ["commit_sha"])
    op.create_index("ix_code_chunks_file_path", "code_chunks", ["file_path"])
    op.create_index("ix_code_chunks_content_hash", "code_chunks", ["content_hash"])

    # 8. Create CodeSymbols table
    op.create_table(
        "code_symbols",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("commit_sha", sa.String(64), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("start_line", sa.Integer(), nullable=False),
        sa.Column("end_line", sa.Integer(), nullable=False),
        sa.Column("signature", sa.Text(), nullable=True),
        sa.Column("docstring", sa.Text(), nullable=True),
    )
    op.create_index("ix_code_symbols_repository_id", "code_symbols", ["repository_id"])
    op.create_index("ix_code_symbols_commit_sha", "code_symbols", ["commit_sha"])
    op.create_index("ix_code_symbols_file_path", "code_symbols", ["file_path"])
    op.create_index("ix_code_symbols_name", "code_symbols", ["name"])

    # 9. Create RepositorySyncCursors table
    op.create_table(
        "repository_sync_cursors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("default_branch", sa.String(255), server_default="main", nullable=True),
        sa.Column("last_commit_sha", sa.String(64), nullable=True),
        sa.Column("indexed_commit_sha", sa.String(64), nullable=True),
        sa.Column("indexed_files_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("indexed_chunks_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("indexing_status", sa.String(32), server_default="idle", nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.UniqueConstraint("repository_id", name="uq_repo_sync_cursor"),
    )
    op.create_index("ix_repository_sync_cursors_repository_id", "repository_sync_cursors", ["repository_id"])

    # 10. Create WebhookDeliveries table
    op.create_table(
        "webhook_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("delivery_id", sa.String(128), nullable=False),
        sa.Column("event", sa.String(64), nullable=False),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), server_default="received", nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_index("ix_webhook_deliveries_delivery_id", "webhook_deliveries", ["delivery_id"], unique=True)
    op.create_index("ix_webhook_deliveries_event", "webhook_deliveries", ["event"])
    op.create_index("ix_webhook_deliveries_repository_id", "webhook_deliveries", ["repository_id"])

    # 11. Create AIConversations table
    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_conversations_user_id", "ai_conversations", ["user_id"])
    op.create_index("ix_ai_conversations_repository_id", "ai_conversations", ["repository_id"])

    # 12. Create AIMessages table
    op.create_table(
        "ai_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tool_calls", sa.Text(), nullable=True),
        sa.Column("tool_call_id", sa.String(128), nullable=True),
        sa.Column("grounded_references", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_messages_conversation_id", "ai_messages", ["conversation_id"])

    # 13. Create AIToolLogs table
    op.create_table(
        "ai_tool_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=True),
        sa.Column("tool_name", sa.String(128), nullable=False),
        sa.Column("arguments", sa.Text(), nullable=False),
        sa.Column("result_summary", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_tool_logs_conversation_id", "ai_tool_logs", ["conversation_id"])
    op.create_index("ix_ai_tool_logs_user_id", "ai_tool_logs", ["user_id"])
    op.create_index("ix_ai_tool_logs_repository_id", "ai_tool_logs", ["repository_id"])
    op.create_index("ix_ai_tool_logs_tool_name", "ai_tool_logs", ["tool_name"])


def downgrade():
    op.drop_table("ai_tool_logs")
    op.drop_table("ai_messages")
    op.drop_table("ai_conversations")
    op.drop_table("webhook_deliveries")
    op.drop_table("repository_sync_cursors")
    op.drop_table("code_symbols")
    op.drop_table("code_chunks")
    op.drop_table("issue_comments")
    op.drop_table("review_comments")
    op.drop_table("pull_request_files")
    op.drop_table("commit_file_changes")
    op.drop_table("branches")

    with op.batch_alter_table("ai_reports") as batch_op:
        batch_op.drop_column("repository_id")

    with op.batch_alter_table("reviews") as batch_op:
        batch_op.drop_column("commit_sha")
        batch_op.drop_column("body")

    with op.batch_alter_table("issues") as batch_op:
        batch_op.drop_column("updated_at")
        batch_op.drop_column("labels")
        batch_op.drop_column("author_login")
        batch_op.drop_column("body")
        batch_op.drop_column("title")
        batch_op.drop_column("number")

    with op.batch_alter_table("pull_requests") as batch_op:
        batch_op.drop_column("labels")
        batch_op.drop_column("merge_commit_sha")
        batch_op.drop_column("changed_files_count")
        batch_op.drop_column("deletions")
        batch_op.drop_column("additions")
        batch_op.drop_column("head_sha")
        batch_op.drop_column("base_sha")
        batch_op.drop_column("head_branch")
        batch_op.drop_column("base_branch")
        batch_op.drop_column("body")
        batch_op.drop_column("title")

    with op.batch_alter_table("commits") as batch_op:
        batch_op.drop_column("commit_url")
        batch_op.drop_column("files_changed_count")
        batch_op.drop_column("total_changes")
        batch_op.drop_column("deletions")
        batch_op.drop_column("additions")
        batch_op.drop_column("committer_email")
        batch_op.drop_column("committer_name")
        batch_op.drop_column("author_email")
        batch_op.drop_column("author_name")
        batch_op.drop_column("parent_shas")

    with op.batch_alter_table("repositories") as batch_op:
        batch_op.drop_column("default_branch")
