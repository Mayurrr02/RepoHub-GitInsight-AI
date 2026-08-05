import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.router import api_router
from app.core.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
app = FastAPI(title="RepoHub API", version="1.0.0", description="GitHub repository dashboard API")
app.add_middleware(CORSMiddleware, allow_origins=[get_settings().frontend_url], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.exception_handler(Exception)
async def unhandled_exception(_: Request, exc: Exception):
    logging.getLogger(__name__).exception("Unhandled exception", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

app.include_router(api_router)

@app.get("/health", tags=["Health"])
def health(): return {"status": "ok"}
