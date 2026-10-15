from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {"sslmode": "require"}
# Render 무료 티어는 15분 미사용 시 슬립한다 — 깨어난 뒤 풀에 남은 끊긴 연결로 첫 요청이 500 나지 않도록
# 체크아웃 때마다 가볍게 확인한다.
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
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
    except Exception:
        # 요청 처리 중 예외면 커밋 안 된 변경을 명시적으로 버린다(close()도 버리지만, 실패한 flush 뒤의
        # 세션 상태에 기대지 않는다).
        db.rollback()
        raise
    finally:
        db.close()
