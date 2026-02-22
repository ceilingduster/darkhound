#!/bin/sh
set -e

echo "Running database migrations..."
cd /alembic && PYTHONPATH=/app alembic upgrade head
cd /app

echo "Seeding admin user if needed..."
python -c "
import asyncio
from app.core.db.engine import AsyncSessionLocal
from app.core.db.models import User, UserRole
from app.core.security.auth import hash_password
from sqlalchemy import select, func

async def seed():
    async with AsyncSessionLocal() as db:
        count = (await db.execute(select(func.count(User.id)))).scalar() or 0
        if count == 0:
            import os
            username = os.environ.get('ADMIN_USERNAME', 'admin')
            password = os.environ.get('ADMIN_PASSWORD', 'changeme')
            user = User(
                username=username,
                password_hash=hash_password(password),
                role=UserRole.admin,
                is_active=True,
            )
            db.add(user)
            await db.commit()
            print(f'Admin user created: {username}')
        else:
            print(f'Users exist ({count}), skipping seed.')

asyncio.run(seed())
"

echo "Starting AI Hunter backend..."
exec "$@"
