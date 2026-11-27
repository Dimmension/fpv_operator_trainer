import base64
import hashlib
import hmac
import json
import os
import time
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models import User

# Простой секретный ключ для подписи токенов (в продакшене брать из .env)
SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_fpv_key_2026").encode()
ALGORITHM = "HS256"

security = HTTPBearer()

def get_password_hash(password: str) -> str:
    salt = os.urandom(16)
    pwdhash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return f"pbkdf2:sha256:100000${base64.b64encode(salt).decode()}${base64.b64encode(pwdhash).decode()}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        parts = hashed_password.split("$")
        if len(parts) != 3:
            return False
            
        prefix, salt_b64, hash_b64 = parts
        # prefix имеет вид "pbkdf2:sha256:100000"
        iterations = int(prefix.split(":")[2])
        
        salt = base64.b64decode(salt_b64)
        pwdhash = base64.b64decode(hash_b64)
        new_hash = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, iterations)
        
        return hmac.compare_digest(pwdhash, new_hash)
    except Exception:
        return False

def create_access_token(user_id: int) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": ALGORITHM, "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({"sub": str(user_id), "exp": int(time.time()) + 86400 * 7}).encode()).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(hmac.new(SECRET_KEY, f"{header}.{payload}".encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{header}.{payload}.{signature}"

def decode_access_token(token: str) -> int | None:
    try:
        header, payload, signature = token.split(".")
        expected_sig = base64.urlsafe_b64encode(hmac.new(SECRET_KEY, f"{header}.{payload}".encode(), hashlib.sha256).digest()).decode().rstrip("=")
        if not hmac.compare_digest(signature, expected_sig):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "==").decode())
        if data["exp"] < time.time():
            return None
        return int(data["sub"])
    except Exception:
        return None

async def get_current_user(
    token: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    session: Annotated[AsyncSession, Depends(get_session)]
) -> User:
    user_id = decode_access_token(token.credentials)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истекший токен")
    user = await session.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")
    return user