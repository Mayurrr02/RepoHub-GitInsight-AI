import enum
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Float, Boolean, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class OrgRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    github_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    login: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    github_account: Mapped["GitHubAccount"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    repositories: Mapped[list["Repository"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    organization_memberships: Mapped[list["OrganizationMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    owned_organizations: Mapped[list["Organization"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    api_keys: Mapped[list["ApiKey"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    ai_conversations: Mapped[list["AIConversation"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class GitHubAccount(Base):
    __tablename__ = "github_accounts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    access_token: Mapped[str] = mapped_column(Text)
    scope: Mapped[str | None] = mapped_column(String(255))
    user: Mapped[User] = relationship(back_populates="github_account")


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    avatar_url: Mapped[str | None] = mapped_column(String(2048))
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped[User] = relationship(back_populates="owned_organizations", foreign_keys=[owner_id])
    members: Mapped[list["OrganizationMember"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    repositories: Mapped[list["OrganizationRepository"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="organization", cascade="all, delete-orphan")


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_member"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32), default=OrgRole.MEMBER.value)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="organization_memberships")


class OrganizationRepository(Base):
    __tablename__ = "organization_repositories"
    __table_args__ = (UniqueConstraint("organization_id", "repository_id", name="uq_org_repo"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship(back_populates="repositories")
    repository: Mapped["Repository"] = relationship(back_populates="organization_links")


class Repository(Base):
    __tablename__ = "repositories"
    __table_args__ = (UniqueConstraint("user_id", "github_id", name="uq_repository_user_github"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    github_id: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(512))
    html_url: Mapped[str] = mapped_column(String(2048))
    description: Mapped[str | None] = mapped_column(Text)
    is_private: Mapped[bool] = mapped_column(default=False)
    language: Mapped[str | None] = mapped_column(String(64))
    stars: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    default_branch: Mapped[str | None] = mapped_column(String(255), default="main")

    user: Mapped[User] = relationship(back_populates="repositories")
    organization_links: Mapped[list[OrganizationRepository]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    commits: Mapped[list["Commit"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    pull_requests: Mapped[list["PullRequest"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    issues: Mapped[list["Issue"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    releases: Mapped[list["Release"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    contributors: Mapped[list["Contributor"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    languages: Mapped[list["Language"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    metric: Mapped["RepositoryMetric | None"] = relationship(back_populates="repository", uselist=False, cascade="all, delete-orphan")
    branches: Mapped[list["Branch"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    commit_file_changes: Mapped[list["CommitFileChange"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    code_chunks: Mapped[list["CodeChunk"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    code_symbols: Mapped[list["CodeSymbol"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    sync_cursor: Mapped["RepositorySyncCursor | None"] = relationship(back_populates="repository", uselist=False, cascade="all, delete-orphan")
    conversations: Mapped[list["AIConversation"]] = relationship(back_populates="repository", cascade="all, delete-orphan")


class Branch(Base):
    __tablename__ = "branches"
    __table_args__ = (UniqueConstraint("repository_id", "name", name="uq_branch_repository_name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    commit_sha: Mapped[str] = mapped_column(String(64))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    is_protected: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    repository: Mapped[Repository] = relationship(back_populates="branches")


class Commit(Base):
    __tablename__ = "commits"
    __table_args__ = (UniqueConstraint("repository_id", "sha", name="uq_commit_repository_sha"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    sha: Mapped[str] = mapped_column(String(64))
    author_login: Mapped[str | None] = mapped_column(String(255), index=True)
    message: Mapped[str] = mapped_column(Text)
    committed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    # Phase 1 Extensions
    parent_shas: Mapped[str | None] = mapped_column(Text)  # JSON-encoded array
    author_name: Mapped[str | None] = mapped_column(String(255))
    author_email: Mapped[str | None] = mapped_column(String(255))
    committer_name: Mapped[str | None] = mapped_column(String(255))
    committer_email: Mapped[str | None] = mapped_column(String(255))
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    total_changes: Mapped[int] = mapped_column(Integer, default=0)
    files_changed_count: Mapped[int] = mapped_column(Integer, default=0)
    commit_url: Mapped[str | None] = mapped_column(String(2048))

    repository: Mapped[Repository] = relationship(back_populates="commits")
    file_changes: Mapped[list["CommitFileChange"]] = relationship(back_populates="commit", cascade="all, delete-orphan")


class CommitFileChange(Base):
    __tablename__ = "commit_file_changes"
    id: Mapped[int] = mapped_column(primary_key=True)
    commit_id: Mapped[int] = mapped_column(ForeignKey("commits.id", ondelete="CASCADE"), index=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    file_path: Mapped[str] = mapped_column(String(1024), index=True)
    status: Mapped[str] = mapped_column(String(32))  # added, modified, removed, renamed
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    changes: Mapped[int] = mapped_column(Integer, default=0)
    patch: Mapped[str | None] = mapped_column(Text)
    previous_filename: Mapped[str | None] = mapped_column(String(1024))
    blob_sha: Mapped[str | None] = mapped_column(String(64))

    commit: Mapped[Commit] = relationship(back_populates="file_changes")
    repository: Mapped[Repository] = relationship(back_populates="commit_file_changes")


class PullRequest(Base):
    __tablename__ = "pull_requests"
    __table_args__ = (UniqueConstraint("repository_id", "github_id", name="uq_pr_repository_github"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    github_id: Mapped[int] = mapped_column(Integer)
    number: Mapped[int] = mapped_column(Integer)
    author_login: Mapped[str | None] = mapped_column(String(255))
    state: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    merged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Phase 1 Extensions
    title: Mapped[str | None] = mapped_column(String(512))
    body: Mapped[str | None] = mapped_column(Text)
    base_branch: Mapped[str | None] = mapped_column(String(255))
    head_branch: Mapped[str | None] = mapped_column(String(255))
    base_sha: Mapped[str | None] = mapped_column(String(64))
    head_sha: Mapped[str | None] = mapped_column(String(64))
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    changed_files_count: Mapped[int] = mapped_column(Integer, default=0)
    merge_commit_sha: Mapped[str | None] = mapped_column(String(64))
    labels: Mapped[str | None] = mapped_column(Text)  # JSON array

    repository: Mapped[Repository] = relationship(back_populates="pull_requests")
    reviews: Mapped[list["Review"]] = relationship(back_populates="pull_request", cascade="all, delete-orphan")
    files: Mapped[list["PullRequestFile"]] = relationship(back_populates="pull_request", cascade="all, delete-orphan")
    review_comments: Mapped[list["ReviewComment"]] = relationship(back_populates="pull_request", cascade="all, delete-orphan")


class PullRequestFile(Base):
    __tablename__ = "pull_request_files"
    id: Mapped[int] = mapped_column(primary_key=True)
    pull_request_id: Mapped[int] = mapped_column(ForeignKey("pull_requests.id", ondelete="CASCADE"), index=True)
    file_path: Mapped[str] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(32))
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    patch: Mapped[str | None] = mapped_column(Text)

    pull_request: Mapped[PullRequest] = relationship(back_populates="files")


class Issue(Base):
    __tablename__ = "issues"
    __table_args__ = (UniqueConstraint("repository_id", "github_id", name="uq_issue_repository_github"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    github_id: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Phase 1 Extensions
    number: Mapped[int | None] = mapped_column(Integer)
    title: Mapped[str | None] = mapped_column(String(512))
    body: Mapped[str | None] = mapped_column(Text)
    author_login: Mapped[str | None] = mapped_column(String(255))
    labels: Mapped[str | None] = mapped_column(Text)  # JSON array
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    repository: Mapped[Repository] = relationship(back_populates="issues")
    comments: Mapped[list["IssueComment"]] = relationship(back_populates="issue", cascade="all, delete-orphan")


class IssueComment(Base):
    __tablename__ = "issue_comments"
    __table_args__ = (UniqueConstraint("issue_id", "github_id", name="uq_issue_comment_github"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"), index=True)
    github_id: Mapped[int] = mapped_column(Integer)
    author_login: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    issue: Mapped[Issue] = relationship(back_populates="comments")


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("pull_request_id", "github_id", name="uq_review_pr_github"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    pull_request_id: Mapped[int] = mapped_column(ForeignKey("pull_requests.id", ondelete="CASCADE"), index=True)
    github_id: Mapped[int] = mapped_column(Integer)
    reviewer_login: Mapped[str | None] = mapped_column(String(255))
    state: Mapped[str] = mapped_column(String(32))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Phase 1 Extensions
    body: Mapped[str | None] = mapped_column(Text)
    commit_sha: Mapped[str | None] = mapped_column(String(64))

    pull_request: Mapped[PullRequest] = relationship(back_populates="reviews")
    comments: Mapped[list["ReviewComment"]] = relationship(back_populates="review", cascade="all, delete-orphan")


class ReviewComment(Base):
    __tablename__ = "review_comments"
    __table_args__ = (UniqueConstraint("pull_request_id", "github_id", name="uq_review_comment_pr_github"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    review_id: Mapped[int | None] = mapped_column(ForeignKey("reviews.id", ondelete="CASCADE"), index=True)
    pull_request_id: Mapped[int] = mapped_column(ForeignKey("pull_requests.id", ondelete="CASCADE"), index=True)
    github_id: Mapped[int] = mapped_column(Integer)
    path: Mapped[str | None] = mapped_column(String(1024))
    line: Mapped[int | None] = mapped_column(Integer)
    commit_sha: Mapped[str | None] = mapped_column(String(64))
    body: Mapped[str] = mapped_column(Text)
    author_login: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    review: Mapped[Review | None] = relationship(back_populates="comments")
    pull_request: Mapped[PullRequest] = relationship(back_populates="review_comments")


class Release(Base):
    __tablename__ = "releases"
    __table_args__ = (UniqueConstraint("repository_id", "github_id", name="uq_release_repository_github"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    github_id: Mapped[int] = mapped_column(Integer)
    name: Mapped[str | None] = mapped_column(String(255))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    repository: Mapped[Repository] = relationship(back_populates="releases")


class Contributor(Base):
    __tablename__ = "contributors"
    __table_args__ = (UniqueConstraint("repository_id", "github_id", name="uq_contributor_repository_github"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    github_id: Mapped[int] = mapped_column(Integer)
    login: Mapped[str] = mapped_column(String(255))
    contributions: Mapped[int] = mapped_column(Integer, default=0)

    repository: Mapped[Repository] = relationship(back_populates="contributors")


class Language(Base):
    __tablename__ = "languages"
    __table_args__ = (UniqueConstraint("repository_id", "name", name="uq_language_repository_name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    bytes: Mapped[int] = mapped_column(Integer)

    repository: Mapped[Repository] = relationship(back_populates="languages")


class DeveloperMetric(Base):
    __tablename__ = "developer_metrics"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    commit_frequency: Mapped[float] = mapped_column(Float, default=0)
    coding_streak: Mapped[int] = mapped_column(Integer, default=0)
    average_commits_per_day: Mapped[float] = mapped_column(Float, default=0)
    coding_hours: Mapped[float] = mapped_column(Float, default=0)
    weekend_activity: Mapped[float] = mapped_column(Float, default=0)
    review_score: Mapped[float] = mapped_column(Float, default=0)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RepositoryMetric(Base):
    __tablename__ = "repository_metrics"
    __table_args__ = (UniqueConstraint("repository_id", name="uq_repository_metric"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"))
    merge_rate: Mapped[float] = mapped_column(Float, default=0)
    issue_resolution_rate: Mapped[float] = mapped_column(Float, default=0)
    health_score: Mapped[float] = mapped_column(Float, default=0)
    activity_score: Mapped[float] = mapped_column(Float, default=0)
    documentation_score: Mapped[float] = mapped_column(Float, default=0)
    maintenance_score: Mapped[float] = mapped_column(Float, default=0)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    repository: Mapped[Repository] = relationship(back_populates="metric")


class AIReport(Base):
    __tablename__ = "ai_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    repository_id: Mapped[int | None] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued")
    content: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String(1024))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SyncJob(Base):
    __tablename__ = "sync_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued")
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    organization_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(128), index=True)
    resource_type: Mapped[str] = mapped_column(String(64), index=True)
    resource_id: Mapped[str | None] = mapped_column(String(128))
    details: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user: Mapped[User | None] = relationship()
    organization: Mapped[Organization | None] = relationship(back_populates="audit_logs")


class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    key_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    prefix: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="api_keys")


# ============================================================
# PHASE 1 EXTENSIONS: CODE INTELLIGENCE, WEBHOOKS, CONVERSATIONS
# ============================================================

class CodeChunk(Base):
    __tablename__ = "code_chunks"
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    commit_sha: Mapped[str] = mapped_column(String(64), index=True)
    file_path: Mapped[str] = mapped_column(String(1024), index=True)
    start_line: Mapped[int] = mapped_column(Integer)
    end_line: Mapped[int] = mapped_column(Integer)
    language: Mapped[str] = mapped_column(String(64))
    chunk_type: Mapped[str] = mapped_column(String(32))  # function, class, method, module, fallback
    name: Mapped[str | None] = mapped_column(String(255))
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[str | None] = mapped_column(Text)  # JSON-encoded array of floats
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    repository: Mapped[Repository] = relationship(back_populates="code_chunks")


class CodeSymbol(Base):
    __tablename__ = "code_symbols"
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    commit_sha: Mapped[str] = mapped_column(String(64), index=True)
    file_path: Mapped[str] = mapped_column(String(1024), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    kind: Mapped[str] = mapped_column(String(32))  # function, class, method, interface
    start_line: Mapped[int] = mapped_column(Integer)
    end_line: Mapped[int] = mapped_column(Integer)
    signature: Mapped[str | None] = mapped_column(Text)
    docstring: Mapped[str | None] = mapped_column(Text)

    repository: Mapped[Repository] = relationship(back_populates="code_symbols")


class RepositorySyncCursor(Base):
    __tablename__ = "repository_sync_cursors"
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), unique=True, index=True)
    default_branch: Mapped[str | None] = mapped_column(String(255), default="main")
    last_commit_sha: Mapped[str | None] = mapped_column(String(64))
    indexed_commit_sha: Mapped[str | None] = mapped_column(String(64))
    indexed_files_count: Mapped[int] = mapped_column(Integer, default=0)
    indexed_chunks_count: Mapped[int] = mapped_column(Integer, default=0)
    indexing_status: Mapped[str] = mapped_column(String(32), default="idle")  # idle, running, completed, failed
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)

    repository: Mapped[Repository] = relationship(back_populates="sync_cursor")


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"
    id: Mapped[int] = mapped_column(primary_key=True)
    delivery_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    event: Mapped[str] = mapped_column(String(64), index=True)
    repository_id: Mapped[int | None] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="received")  # received, processed, failed, ignored
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)


class AIConversation(Base):
    __tablename__ = "ai_conversations"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    repository_id: Mapped[int | None] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped[User] = relationship(back_populates="ai_conversations")
    repository: Mapped[Repository | None] = relationship(back_populates="conversations")
    messages: Mapped[list["AIMessage"]] = relationship(back_populates="conversation", cascade="all, delete-orphan", order_by="AIMessage.id")
    tool_logs: Mapped[list["AIToolLog"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")


class AIMessage(Base):
    __tablename__ = "ai_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32))  # user, assistant, system, tool
    content: Mapped[str] = mapped_column(Text)
    tool_calls: Mapped[str | None] = mapped_column(Text)  # JSON-encoded list of tool calls
    tool_call_id: Mapped[str | None] = mapped_column(String(128))
    grounded_references: Mapped[str | None] = mapped_column(Text)  # JSON-encoded list of citations
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[AIConversation] = relationship(back_populates="messages")


class AIToolLog(Base):
    __tablename__ = "ai_tool_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int | None] = mapped_column(ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    repository_id: Mapped[int | None] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    tool_name: Mapped[str] = mapped_column(String(128), index=True)
    arguments: Mapped[str] = mapped_column(Text)  # JSON string
    result_summary: Mapped[str | None] = mapped_column(Text)
    duration_ms: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[AIConversation | None] = relationship(back_populates="tool_logs")
