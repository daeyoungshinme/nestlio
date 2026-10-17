from fastapi import APIRouter, HTTPException, Response

from app.services import couple_photo_service

# /api/v1 밖(prefix 없음) — <img src>가 직접 부르는 정적 리소스 경로.
router = APIRouter()


@router.get("/media/couple-photo", include_in_schema=False)
def serve_couple_photo(v: str | None = None):
    # 인증 없이 서빙 — <img src>는 Authorization 헤더를 못 보내고, 기존 StaticFiles 마운트도
    # 비인증이었으므로 동작을 그대로 유지한다. 응답의 URL은 사진 버전(?v=)을 달고 나가 업로드·삭제 때만
    # 바뀌므로(couple_photo_service.get_photo_url) 버전이 붙은 요청은 브라우저가 오래 캐시해도 된다.
    try:
        result = couple_photo_service.get_photo_bytes()
    except couple_photo_service.PhotoStorageError:
        raise HTTPException(status_code=502) from None
    if result is None:
        raise HTTPException(status_code=404)
    content, content_type = result
    headers = {"Cache-Control": "private, max-age=31536000, immutable"} if v else None
    return Response(content=content, media_type=content_type, headers=headers)
