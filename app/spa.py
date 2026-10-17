from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def mount_spa(app: FastAPI, dist: Path = FRONTEND_DIST) -> None:
    # growlio는 별도 nginx가 프론트엔드를 서빙하지만, nestlio는 운영 단순화를 위해
    # FastAPI가 빌드된 SPA(frontend/dist, `npm run build` 산출물)를 직접 서빙한다.
    # /api/v1/* 라우터가 모두 등록된 "이후"에 마운트해야 이 catch-all이 API 경로를 가로채지 않는다.
    # `frontend/dist`가 없으면(빌드 전, 또는 API만 쓰는 개발 환경) 조용히 건너뛴다.
    if not dist.is_dir():
        return
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        # 없는 API 경로(삭제된 엔드포인트를 부르는 구버전 클라이언트 등)가 index.html 200으로 떨어지면
        # 프론트가 HTML을 JSON으로 파싱하다 엉뚱한 에러를 내므로 API 네임스페이스는 404로 끊는다.
        if full_path.startswith(("api/", "internal/")):
            raise HTTPException(status_code=404)
        frontend_root = dist.resolve()
        candidate = (frontend_root / full_path).resolve()
        if full_path and candidate.is_relative_to(frontend_root) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(frontend_root / "index.html")
