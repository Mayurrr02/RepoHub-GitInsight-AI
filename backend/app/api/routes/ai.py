from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.api.deps import current_user
from app.db.session import get_db
from app.models import Notification, User
from app.services.ai import create_pdf, generate_insights

router = APIRouter(prefix="/ai", tags=["AI Intelligence"])
class ChatRequest(BaseModel): question: str

@router.post("/chat")
def chat(body: ChatRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"answer": generate_insights(db, user, body.question)}

@router.post("/report")
def report(user: User = Depends(current_user), db: Session = Depends(get_db)):
    insights = generate_insights(db, user)
    pdf = create_pdf("RepoHub Engineering Report", insights, db, user)
    db.add(Notification(user_id=user.id, type="ai_report_completed", message="Your AI engineering report is ready.")); db.commit()
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=repohub-engineering-report.pdf"})
