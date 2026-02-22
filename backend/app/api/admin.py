from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.db.models import User, UserRole
from app.core.security.auth import hash_password
from .deps import AdminUser, DbDep

router = APIRouter(prefix="/admin", tags=["admin"])


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "analyst"


class UserResponse(BaseModel):
    id: str
    username: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def admin_register_user(
    body: CreateUserRequest,
    db: DbDep,
    admin: AdminUser,
):
    """Create a new user. Admin only."""
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=400, detail="Username already taken")

    role = UserRole.analyst
    if body.role == "admin":
        role = UserRole.admin

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return UserResponse(
        id=str(user.id),
        username=user.username,
        role=user.role.value,
        is_active=user.is_active,
    )


@router.get("/users", response_model=list[UserResponse])
async def list_users(db: DbDep, admin: AdminUser):
    """List all users. Admin only."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return [
        UserResponse(
            id=str(u.id),
            username=u.username,
            role=u.role.value,
            is_active=u.is_active,
        )
        for u in result.scalars()
    ]


@router.post("/users/{user_id}/deactivate", status_code=status.HTTP_200_OK)
async def deactivate_user(user_id: str, db: DbDep, admin: AdminUser):
    """Deactivate a user. Admin only."""
    import uuid
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.username == admin.username:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    user.is_active = False
    await db.flush()
    return {"ok": True}
