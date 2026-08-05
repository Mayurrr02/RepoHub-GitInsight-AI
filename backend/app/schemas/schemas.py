from datetime import datetime
from pydantic import BaseModel, ConfigDict

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; login: str; name: str | None; avatar_url: str | None

class RepositoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; github_id: int; name: str; full_name: str; html_url: str
    description: str | None; is_private: bool; language: str | None; stars: int; updated_at: datetime | None

class TokenPair(BaseModel):
    access_token: str; refresh_token: str; token_type: str = "bearer"

class RefreshRequest(BaseModel):
    refresh_token: str

class SyncQueued(BaseModel):
    job_id: int; status: str
