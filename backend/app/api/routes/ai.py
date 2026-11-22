import json
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.deps import current_user
from app.db.session import get_db
from app.models import AIConversation, AIMessage, Notification, Repository, User
from app.schemas.schemas import (
    AIChatRequest,
    AIChatResponse,
    AIConversationDetailOut,
    AIConversationOut,
    AIMessageOut,
    GroundedCitation,
)
from app.services.ai import (
    chat_with_repository_assistant,
    create_pdf,
    generate_insights,
)
from app.services.retrieval import check_repository_access

router = APIRouter(prefix="/ai", tags=["AI Intelligence"])


@router.post("/chat", response_model=AIChatResponse)
async def chat(
    body: AIChatRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Flagship Repository Intelligence Assistant endpoint with tool calling & citation grounding."""
    return await chat_with_repository_assistant(
        db=db,
        user=user,
        question=body.question,
        repository_id=body.repository_id,
        conversation_id=body.conversation_id,
        revision=body.revision,
    )


@router.get("/conversations", response_model=list[AIConversationOut])
def list_conversations(
    repository_id: int | None = Query(None, description="Filter by repository ID"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """List persisted AI conversations for current user."""
    stmt = (
        select(AIConversation)
        .where(AIConversation.user_id == user.id)
        .order_by(AIConversation.updated_at.desc())
    )
    if repository_id:
        stmt = stmt.where(AIConversation.repository_id == repository_id)

    conversations = db.scalars(stmt).all()
    results = []
    for conv in conversations:
        msg_count = db.query(func.count(AIMessage.id)).filter(AIMessage.conversation_id == conv.id).scalar() or 0
        results.append(
            AIConversationOut(
                id=conv.id,
                repository_id=conv.repository_id,
                title=conv.title,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                message_count=msg_count,
            )
        )
    return results


@router.get("/conversations/{id}", response_model=AIConversationDetailOut)
def get_conversation_detail(
    id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Get full conversation message thread and tool execution logs."""
    conv = db.scalar(
        select(AIConversation).where(AIConversation.id == id, AIConversation.user_id == user.id)
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    messages = db.scalars(
        select(AIMessage)
        .where(AIMessage.conversation_id == conv.id)
        .order_by(AIMessage.created_at.asc())
    ).all()

    msg_outs = []
    for m in messages:
        cits = []
        if m.grounded_references:
            try:
                raw_cits = json.loads(m.grounded_references)
                cits = [GroundedCitation(**c) for c in raw_cits]
            except Exception:
                cits = []

        tools = None
        if m.tool_calls:
            try:
                tools = json.loads(m.tool_calls)
            except Exception:
                tools = None

        msg_outs.append(
            AIMessageOut(
                id=m.id,
                conversation_id=m.conversation_id,
                role=m.role,
                content=m.content,
                tool_calls=tools,
                grounded_references=cits,
                created_at=m.created_at,
            )
        )

    conv_out = AIConversationOut(
        id=conv.id,
        repository_id=conv.repository_id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=len(messages),
    )
    return AIConversationDetailOut(conversation=conv_out, messages=msg_outs)


@router.delete("/conversations/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Delete an AI conversation thread."""
    conv = db.scalar(
        select(AIConversation).where(AIConversation.id == id, AIConversation.user_id == user.id)
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    db.delete(conv)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/report")
def report(
    repository_id: int | None = Query(None, description="Optional target repository ID"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Generate engineering executive PDF report (developer or repository scoped)."""
    target_repo = None
    if repository_id:
        target_repo = check_repository_access(db, repository_id, user.id)

    insights = generate_insights(db, user)
    title = f"RepoHub Engineering Report: {target_repo.name}" if target_repo else "RepoHub Engineering Report"
    pdf = create_pdf(title, insights, db, user, repository=target_repo)

    db.add(
        Notification(
            user_id=user.id,
            type="ai_report_completed",
            message=f"Your {title} is ready for download.",
        )
    )
    db.commit()

    filename = f"repohub-{target_repo.name if target_repo else 'engineering'}-report.pdf"
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
