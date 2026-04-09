from fastapi import Request, HTTPException
from jose import jwt, JWTError
from app.config import settings
from app.database import get_db
from app.models import UserOut
from typing import Optional


def _decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        return None


async def get_optional_user(request: Request) -> Optional[UserOut]:
    token = request.cookies.get("session")
    if not token:
        return None
    payload = _decode_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    db = await get_db()
    async with db.execute(
        "SELECT id, email, display_name, avatar_url FROM users WHERE id = ?", (user_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    email = row["email"]
    return UserOut(
        id=row["id"],
        email=email,
        display_name=row["display_name"],
        avatar_url=row["avatar_url"],
        is_admin=email in settings.admin_emails,
    )


async def get_current_user(request: Request) -> UserOut:
    user = await get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def require_admin(request: Request) -> UserOut:
    user = await get_current_user(request)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
