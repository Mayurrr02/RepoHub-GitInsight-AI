from fastapi import APIRouter
from app.api.routes import (
    ai,
    analytics,
    audit_logs,
    auth,
    organizations,
    repositories,
    team_analytics,
    users,
    ws,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(repositories.router)
api_router.include_router(analytics.router)
api_router.include_router(ai.router)
api_router.include_router(organizations.router)
api_router.include_router(team_analytics.router)
api_router.include_router(audit_logs.router)
api_router.include_router(ws.router)
