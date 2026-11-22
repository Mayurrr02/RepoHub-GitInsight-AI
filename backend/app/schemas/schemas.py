from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    login: str
    name: str | None
    avatar_url: str | None


class RepositoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    github_id: int
    name: str
    full_name: str
    html_url: str
    description: str | None
    is_private: bool
    language: str | None
    stars: int
    updated_at: datetime | None


class CommitSummaryOut(BaseModel):
    sha: str
    message: str
    author_login: str | None
    committed_at: datetime | None


class ContributorSummaryOut(BaseModel):
    login: str
    contributions: int


class LanguageSummaryOut(BaseModel):
    name: str
    bytes: int
    percent: float


class MetricSummaryOut(BaseModel):
    health_score: float
    activity_score: float
    maintenance_score: float
    documentation_score: float
    merge_rate: float
    issue_resolution_rate: float


class RepositoryDetailOut(BaseModel):
    id: int
    github_id: int
    name: str
    full_name: str
    html_url: str
    clone_url: str
    description: str | None
    is_private: bool
    language: str | None
    stars: int
    updated_at: datetime | None
    total_commits: int
    open_prs: int
    merged_prs: int
    closed_prs: int
    total_prs: int
    open_issues: int
    closed_issues: int
    total_issues: int
    metrics: MetricSummaryOut
    languages: list[LanguageSummaryOut]
    top_contributors: list[ContributorSummaryOut]
    recent_commits: list[CommitSummaryOut]



class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class SyncQueued(BaseModel):
    job_id: int
    status: str


# --- Organizations & RBAC Schemas ---

class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=100, pattern="^[a-z0-9-]+$")
    avatar_url: str | None = None


class OrganizationUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    avatar_url: str | None = None


class OrganizationMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    user_id: int
    role: str
    joined_at: datetime
    user: UserOut


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    slug: str
    avatar_url: str | None
    owner_id: int
    created_at: datetime
    my_role: str | None = None
    members_count: int = 0
    repositories_count: int = 0


class OrganizationMemberAdd(BaseModel):
    user_id: int | None = None
    login: str | None = None
    role: Literal["owner", "admin", "member", "viewer"] = "member"


class OrganizationMemberRoleUpdate(BaseModel):
    role: Literal["owner", "admin", "member", "viewer"]


class OrganizationRepositoryAdd(BaseModel):
    repository_id: int


class OrganizationRepositoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization_id: int
    repository_id: int
    added_at: datetime
    repository: RepositoryOut


# --- Team Analytics Schemas ---

class ContributorRankingItem(BaseModel):
    rank: int
    login: str
    avatar_url: str | None = None
    name: str | None = None
    commits: int
    pull_requests: int
    reviews: int
    impact_score: float


class ContributorRankingsResponse(BaseModel):
    organization_id: int
    total_contributors: int
    rankings: list[ContributorRankingItem]


class ProductivityPeriod(BaseModel):
    period: str
    commits: int
    pull_requests_merged: int
    active_contributors: int
    velocity_score: float


class TeamProductivityResponse(BaseModel):
    organization_id: int
    total_commits: int
    total_pull_requests_merged: int
    average_weekly_commits: float
    sprint_velocity: float
    periods: list[ProductivityPeriod]


class UnreviewedPRItem(BaseModel):
    id: int
    repository_name: str
    number: int
    author_login: str | None
    state: str
    created_at: datetime
    waiting_hours: float


class ReviewBottlenecksResponse(BaseModel):
    organization_id: int
    average_review_time_hours: float
    average_merge_time_hours: float
    unreviewed_pr_count: int
    total_open_prs: int
    unreviewed_prs: list[UnreviewedPRItem]
    reviewer_workload: list[dict[str, Any]]


class TeamSummaryResponse(BaseModel):
    organization_id: int
    name: str
    slug: str
    repositories_count: int
    members_count: int
    health_score: float
    activity_score: float
    merge_rate: float
    issue_resolution_rate: float


# --- Audit Logs Schemas ---

class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int | None
    user_login: str | None = None
    organization_id: int | None
    action: str
    resource_type: str
    resource_id: str | None
    details: str | None
    ip_address: str | None
    created_at: datetime


class AuditLogsResponse(BaseModel):
    total: int
    logs: list[AuditLogOut]


# --- Health & Observability Schemas ---

class HealthComponentStatus(BaseModel):
    status: str
    details: str | None = None
    latency_ms: float | None = None


class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded", "unhealthy"]
    timestamp: datetime
    version: str
    environment: str
    components: dict[str, HealthComponentStatus]


# --- WebSocket Message Schemas ---

class WSMessage(BaseModel):
    event: str
    data: dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# --- User Profile & API Key Schemas ---

class GitHubAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    connected: bool
    github_id: int | None = None
    scope: str | None = None
    scopes_list: list[str] = []


class UserStatsOut(BaseModel):
    total_repositories: int
    public_repositories: int
    private_repositories: int
    total_commits: int
    total_organizations: int
    coding_streak: int = 0
    review_score: float = 0


class UserProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    login: str
    name: str | None
    avatar_url: str | None
    created_at: datetime | None = None
    stats: UserStatsOut
    github_account: GitHubAccountOut


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    prefix: str
    created_at: datetime
    expires_at: datetime | None = None
    last_used_at: datetime | None = None


class ApiKeyCreateIn(BaseModel):
    name: str
    expires_in_days: int | None = None


class ApiKeyCreatedOut(BaseModel):
    id: int
    name: str
    prefix: str
    raw_key: str
    created_at: datetime
    expires_at: datetime | None = None



# --- Phase 1: Repository Intelligence & AI Assistant Schemas ---

class BranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    commit_sha: str
    is_default: bool
    is_protected: bool
    updated_at: datetime | None


class CommitFileChangeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    file_path: str
    status: str
    additions: int
    deletions: int
    changes: int
    patch: str | None = None
    previous_filename: str | None = None


class CommitDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sha: str
    author_login: str | None
    author_name: str | None = None
    author_email: str | None = None
    committer_name: str | None = None
    committer_email: str | None = None
    message: str
    committed_at: datetime | None
    additions: int = 0
    deletions: int = 0
    total_changes: int = 0
    files_changed_count: int = 0
    commit_url: str | None = None
    parent_shas: str | None = None
    file_changes: list[CommitFileChangeOut] = []


class PullRequestFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    file_path: str
    status: str
    additions: int
    deletions: int
    patch: str | None = None


class ReviewCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    github_id: int
    path: str | None = None
    line: int | None = None
    commit_sha: str | None = None
    body: str
    author_login: str | None = None
    created_at: datetime


class ReviewDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    github_id: int
    reviewer_login: str | None = None
    state: str
    submitted_at: datetime | None = None
    body: str | None = None
    commit_sha: str | None = None
    comments: list[ReviewCommentOut] = []


class PullRequestDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    github_id: int
    number: int
    title: str | None = None
    body: str | None = None
    author_login: str | None
    state: str
    created_at: datetime
    merged_at: datetime | None
    closed_at: datetime | None
    base_branch: str | None = None
    head_branch: str | None = None
    base_sha: str | None = None
    head_sha: str | None = None
    additions: int = 0
    deletions: int = 0
    changed_files_count: int = 0
    labels: list[str] = []
    files: list[PullRequestFileOut] = []
    reviews: list[ReviewDetailOut] = []


class IssueCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    github_id: int
    author_login: str | None = None
    body: str
    created_at: datetime


class IssueDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    github_id: int
    number: int | None = None
    title: str | None = None
    body: str | None = None
    author_login: str | None = None
    state: str
    labels: list[str] = []
    created_at: datetime
    closed_at: datetime | None
    updated_at: datetime | None = None
    comments: list[IssueCommentOut] = []


class CodeChunkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    commit_sha: str
    file_path: str
    start_line: int
    end_line: int
    language: str
    chunk_type: str
    name: str | None
    content: str
    content_hash: str


class CodeSymbolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    commit_sha: str
    file_path: str
    name: str
    kind: str
    start_line: int
    end_line: int
    signature: str | None = None
    docstring: str | None = None


class RepositoryIntelligenceOut(BaseModel):
    repository_id: int
    name: str
    full_name: str
    default_branch: str
    last_commit_sha: str | None = None
    indexed_commit_sha: str | None = None
    indexing_status: str
    indexed_files_count: int
    indexed_chunks_count: int
    total_symbols_count: int
    last_sync_at: datetime | None = None


class FileSearchHit(BaseModel):
    file_path: str
    start_line: int
    end_line: int
    name: str | None = None
    chunk_type: str
    language: str
    snippet: str
    score: float = 1.0


class FileSearchResult(BaseModel):
    query: str
    repository_id: int
    total_hits: int
    results: list[FileSearchHit]


class FileContentResponse(BaseModel):
    repository_id: int
    path: str
    revision: str
    content: str
    size: int
    total_lines: int


class CodeHistoryItem(BaseModel):
    sha: str
    author_login: str | None = None
    message: str
    committed_at: datetime | None = None
    status: str
    additions: int = 0
    deletions: int = 0


class FileHistoryResponse(BaseModel):
    repository_id: int
    path: str
    history: list[CodeHistoryItem]


class GroundedCitation(BaseModel):
    file_path: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    commit_sha: str | None = None
    pr_number: int | None = None
    issue_number: int | None = None
    source_type: str = "code"  # code, commit, pull_request, issue, metric


class ToolExecutionInfo(BaseModel):
    tool_name: str
    arguments: dict[str, Any] = {}
    result_summary: str | None = None
    duration_ms: float = 0.0


class AIChatRequest(BaseModel):
    question: str
    repository_id: int | None = None
    conversation_id: int | None = None
    revision: str | None = None


class AIChatResponse(BaseModel):
    answer: str
    conversation_id: int
    message_id: int
    grounded_references: list[GroundedCitation] = []
    tool_executions: list[ToolExecutionInfo] = []


class AIConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    repository_id: int | None = None
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class AIMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    conversation_id: int
    role: str
    content: str
    tool_calls: list[dict[str, Any]] | None = None
    grounded_references: list[GroundedCitation] = []
    created_at: datetime


class AIConversationDetailOut(BaseModel):
    conversation: AIConversationOut
    messages: list[AIMessageOut]


class WebhookIngestOut(BaseModel):
    status: str
    event: str
    delivery_id: str
    action: str | None = None


class RepositoryReportRequest(BaseModel):
    title: str | None = None
    report_type: Literal["overview", "engineering_health", "contributors", "code_changes"] = "overview"
