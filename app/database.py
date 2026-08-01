from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {"sslmode": "require"}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# growlio와 같은 Supabase Postgres 인스턴스를 공유하므로, growlio의 public 스키마와
# 충돌하지 않도록 이 앱의 테이블은 전용 household 스키마에 둔다.
metadata = MetaData(schema="household")


class Base(DeclarativeBase):
    metadata = metadata


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
