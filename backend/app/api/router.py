from fastapi import APIRouter
from app.api.routes import ai, analytics, auth, repositories, users

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(repositories.router)
api_router.include_router(analytics.router)
api_router.include_router(ai.router)
