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
