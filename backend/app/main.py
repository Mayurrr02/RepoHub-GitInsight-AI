import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.router import api_router
from app.api.routes import health, metrics, ws
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.core.middleware import (
    CorrelationIdMiddleware,
    ObservabilityMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.ws_manager import ws_manager

setup_logging(level="INFO", structured=True)
logger = logging.getLogger("repohub.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start WebSocket Redis pub/sub dispatcher
    logger.info("Initializing RepoHub enterprise platform...")
    ws_manager.loop = asyncio.get_running_loop()
    ws_manager.start_background_task()
    yield
    # Shutdown: Clean up background connections
    logger.info("Shutting down RepoHub enterprise platform...")
    await ws_manager.stop_background_task()


app = FastAPI(
    title="RepoHub Enterprise API",
    version="1.0.0",
    description="Enterprise GitHub Analytics, Team Productivity, Real-Time WebSockets & Monitoring API",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# 1. Observability & Request Timing Middleware
app.add_middleware(ObservabilityMiddleware)

# 2. Security Headers Middleware
app.add_middleware(SecurityHeadersMiddleware)

# 3. Request Correlation ID Middleware
app.add_middleware(CorrelationIdMiddleware)

# 4. CORS Middleware (Outermost)
settings = get_settings()
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:80",
    "http://localhost:3000",
    "http://localhost",
]
if settings.frontend_url:
    clean_frontend = settings.frontend_url.rstrip("/")
    if clean_frontend not in allowed_origins:
        allowed_origins.append(clean_frontend)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$|^https://.*\.railway\.app$|^https://.*\.up\.railway\.app$|^https://.*\.onrender\.com$|^http://localhost(:\d+)?$|^http://127\.0\.0\.1(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    req_id = getattr(request.state, "request_id", "-")
    origin = request.headers.get("origin", "*")
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "request_id": req_id,
        },
        headers={
            "Access-Control-Allow-Origin": origin if origin != "null" else "*",
            "Access-Control-Allow-Credentials": "true",
        }
    )


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", "-")
    logger.exception("Unhandled server exception", exc_info=exc, extra={"request_id": req_id})
    origin = request.headers.get("origin", "*")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": req_id},
        headers={
            "Access-Control-Allow-Origin": origin if origin != "null" else "*",
            "Access-Control-Allow-Credentials": "true",
        }
    )


# Root Observability & Health endpoints
app.include_router(health.router)
app.include_router(metrics.router)
app.include_router(ws.router)

# Versioned API Routes (/api/v1)
app.include_router(api_router)
