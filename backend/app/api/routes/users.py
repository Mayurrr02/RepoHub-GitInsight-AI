from fastapi import APIRouter, Depends
from app.api.deps import current_user
from app.models import User
from app.schemas.schemas import UserOut

router = APIRouter(prefix="/users", tags=["Users"])
@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
