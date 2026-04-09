from fastapi import APIRouter, Request, Response, Depends, HTTPException
from fastapi.responses import RedirectResponse
from app.config import settings
from app.database import get_db
from app.models import UserOut
from app.auth.dependencies import get_optional_user
from jose import jwt
from datetime import datetime, timedelta, timezone
import httpx
import uuid

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def _make_jwt(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


@router.get("/login")
async def login():
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{query}")


@router.get("/callback")
async def callback(code: str, response: Response):
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to get access token")

        user_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_info = user_resp.json()

    user_id = user_info.get("sub")
    email = user_info.get("email")
    name = user_info.get("name", email)
    avatar = user_info.get("picture")

    db = await get_db()
    await db.execute(
        """INSERT INTO users (id, email, display_name, avatar_url)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             email=excluded.email,
             display_name=excluded.display_name,
             avatar_url=excluded.avatar_url""",
        (user_id, email, name, avatar),
    )
    await db.commit()

    token = _make_jwt(user_id)
    redirect = RedirectResponse(url=settings.frontend_url)
    redirect.set_cookie(
        "session",
        token,
        httponly=True,
        samesite="lax",
        max_age=settings.jwt_expire_days * 86400,
    )
    return redirect


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("session")
    return {"ok": True}


@router.get("/me")
async def me(user: UserOut | None = Depends(get_optional_user)):
    return user
