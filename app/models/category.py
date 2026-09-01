from sqlalchemy import Boolean, Integer, String, false
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(
        String(10), default="expense", server_default="expense"
    )  # 'income' | 'expense'
    type: Mapped[str] = mapped_column(String(10))  # 'fixed' | 'variable' | 'irregular'
    color: Mapped[str] = mapped_column(String(20), default="#888888")
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_discretionary: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    is_debt: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    is_savings: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # 일반 2인 가구 지출 가이드라인과 비교하기 위한 표준 카테고리 태그 (app/constants/benchmark_groups.py 참고).
    # 미지정(None)이면 벤치마크 비교 대상에서 제외된다.
    benchmark_group: Mapped[str | None] = mapped_column(String(30), nullable=True)
