from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.api.deps import current_user
from app.core.config import get_settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.db.session import get_db
from app.models import GitHubAccount, User
from app.schemas.schemas import RefreshRequest, TokenPair
from app.services.github import exchange_code, fetch_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.api_route("/github/login", methods=["GET", "POST"], summary="Start GitHub OAuth login")
def github_login(request: Request):
    s = get_settings()
    if not s.github_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the environment variables."
        )

    # Determine redirect_uri dynamically if using default localhost but running on cloud
    redirect_uri = s.github_redirect_uri
    if not redirect_uri or redirect_uri == "http://localhost:8000/api/v1/auth/github/callback":
        # Check forwarded headers first (from Railway / Cloud proxy)
        proto = request.headers.get("x-forwarded-proto", "https" if "https" in str(request.base_url) else "http")
        host = request.headers.get("x-forwarded-host", request.headers.get("host", str(request.base_url).split("/")[2]))
        if "localhost" not in host and "127.0.0.1" not in host:
            redirect_uri = f"https://{host}/api/v1/auth/github/callback"
        else:
            base_url = str(request.base_url).rstrip("/")
            redirect_uri = f"{base_url}/api/v1/auth/github/callback"

    if redirect_uri.startswith("http://") and ("railway" in redirect_uri or "onrender" in redirect_uri or "vercel" in redirect_uri):
        redirect_uri = redirect_uri.replace("http://", "https://", 1)

    query = urlencode({"client_id": s.github_client_id, "redirect_uri": redirect_uri, "scope": "read:user repo"})
    auth_url = f"https://github.com/login/oauth/authorize?{query}"

    # If accessed directly in browser via GET, redirect directly to GitHub
    if request.method == "GET" and "text/html" in request.headers.get("accept", ""):
        return RedirectResponse(auth_url)

    return {"authorization_url": auth_url}

@router.get("/github/callback", include_in_schema=False)
async def github_callback(code: str, request: Request, db: Session = Depends(get_db)):
    token_data = await exchange_code(code)
    access_token = token_data.get("access_token")
    if not access_token:
        error_desc = token_data.get("error_description") or token_data.get("error") or "GitHub did not return an access token"
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, error_desc)

    profile = await fetch_user(access_token)
    user = db.query(User).filter(User.github_id == profile["id"]).first()
    if not user:
        user = User(github_id=profile["id"], login=profile["login"], name=profile.get("name"), avatar_url=profile.get("avatar_url"))
        db.add(user)
        db.flush()
    else:
        user.login, user.name, user.avatar_url = profile["login"], profile.get("name"), profile.get("avatar_url")

    account = user.github_account
    if account:
        account.access_token, account.scope = access_token, token_data.get("scope")
    else:
        db.add(GitHubAccount(user_id=user.id, access_token=access_token, scope=token_data.get("scope")))
    db.commit()

    params = urlencode({"access_token": create_access_token(user.id), "refresh_token": create_refresh_token(user.id)})

    frontend_url = get_settings().frontend_url
    if not frontend_url or frontend_url == "http://localhost:5173":
        base_url = str(request.base_url).rstrip("/")
        if "onrender.com" in base_url:
            frontend_url = base_url.replace("-api", "-web")

    return RedirectResponse(f"{frontend_url}/auth/callback?{params}")


@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest):
    user_id = decode_token(body.refresh_token, "refresh")
    return TokenPair(access_token=create_access_token(user_id), refresh_token=create_refresh_token(user_id))

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(_: User = Depends(current_user)):
    # JWT is stateless; clients discard both tokens. Add a Redis deny-list here if immediate revocation is required.
    return None
