from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_current_user

router = APIRouter()


@router.get("/me")
async def me(current_user: CurrentUser = Depends(get_current_user)) -> dict:
    return {
        "success": True,
        "data": {
            "id": current_user.id,
            "email": current_user.email,
            "role": current_user.role,
        },
        "error": None,
    }
