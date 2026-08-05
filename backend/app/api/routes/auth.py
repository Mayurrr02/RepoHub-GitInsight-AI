from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, status
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

@router.post("/github/login", summary="Start GitHub OAuth login")
def github_login():
    s = get_settings()
    if not s.github_client_id:
        raise HTTPException(503, "GitHub OAuth is not configured")
    query = urlencode({"client_id": s.github_client_id, "redirect_uri": s.github_redirect_uri, "scope": "read:user repo"})
    return {"authorization_url": f"https://github.com/login/oauth/authorize?{query}"}

@router.get("/github/callback", include_in_schema=False)
async def github_callback(code: str, db: Session = Depends(get_db)):
    token_data = await exchange_code(code)
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(401, "GitHub did not return an access token")
    profile = await fetch_user(access_token)
    user = db.query(User).filter(User.github_id == profile["id"]).first()
    if not user:
        user = User(github_id=profile["id"], login=profile["login"], name=profile.get("name"), avatar_url=profile.get("avatar_url")); db.add(user); db.flush()
    else:
        user.login, user.name, user.avatar_url = profile["login"], profile.get("name"), profile.get("avatar_url")
    account = user.github_account
    if account: account.access_token, account.scope = access_token, token_data.get("scope")
    else: db.add(GitHubAccount(user_id=user.id, access_token=access_token, scope=token_data.get("scope")))
    db.commit()
    params = urlencode({"access_token": create_access_token(user.id), "refresh_token": create_refresh_token(user.id)})
    return RedirectResponse(f"{get_settings().frontend_url}/auth/callback?{params}")

@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest):
    user_id = decode_token(body.refresh_token, "refresh")
    return TokenPair(access_token=create_access_token(user_id), refresh_token=create_refresh_token(user_id))

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(_: User = Depends(current_user)):
    # JWT is stateless; clients discard both tokens. Add a Redis deny-list here if immediate revocation is required.
    return None
