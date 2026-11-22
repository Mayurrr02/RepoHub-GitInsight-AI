import asyncio
import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Any
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.models import (
    AIConversation,
    AIMessage,
    AIToolLog,
    DeveloperMetric,
    Repository,
    RepositoryMetric,
    RepositorySyncCursor,
    User,
)
from app.schemas.schemas import AIChatResponse, GroundedCitation, ToolExecutionInfo
from app.services.ai_tools import AVAILABLE_TOOL_DECLARATIONS, execute_tool
from app.services.analytics import calculate_developer_metrics, language_distribution
from app.services.retrieval import check_repository_access, get_repository_overview

logger = logging.getLogger("repohub.ai")


def analytics_context(db: Session, user: User) -> str:
    """Preserved legacy context builder for developer performance metrics."""
    developer = calculate_developer_metrics(db, user.id)
    metrics = db.execute(
        select(Repository.full_name, RepositoryMetric.health_score, RepositoryMetric.activity_score)
        .join(RepositoryMetric)
        .where(Repository.user_id == user.id)
    ).all()
    languages = language_distribution(db, user.id)
    return f"Developer: {user.login}. Developer metrics: {developer}. Repositories: {metrics}. Languages: {languages}."


def generate_insights(db: Session, user: User, question: str | None = None) -> str:
    """Preserved legacy method for developer report generation and simple chat."""
    context = analytics_context(db, user)
    prompt = question or (
        "Create concise repository summaries, developer strengths and weaknesses, "
        "skill extraction, a learning roadmap, resume bullets, career recommendations, "
        "and technical-debt priorities from this data. Be candid and do not invent evidence."
    )
    settings = get_settings()
    if settings.gemini_api_key:
        try:
            from google import genai
            client = genai.Client(api_key=settings.gemini_api_key)
            response = client.models.generate_content(
                model=settings.gemini_model,
                config=genai.types.GenerateContentConfig(
                    system_instruction="You are a precise engineering career analyst. Use only provided GitHub analytics."
                ),
                contents=f"{context}\n\nQuestion: {prompt}",
            )
            if response and response.text:
                return response.text
        except Exception as exc:
            logger.warning(f"Gemini API generation failed: {exc}")
            return f"AI insights generation currently unavailable ({exc}). Check your GEMINI_API_KEY in .env. Available context:\n{context}"

    return "AI is not configured. Add GEMINI_API_KEY to .env, rebuild the backend, and sync again. Available context: " + context


def create_pdf(title: str, insights: str, db: Session, user: User, repository: Repository | None = None) -> bytes:
    """Generate high-quality PDF engineering report with ReportLab."""
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    document = SimpleDocTemplate(buffer, pagesize=letter, title=title, leftMargin=42, rightMargin=42, topMargin=42)
    developer = calculate_developer_metrics(db, user.id)

    rows = [
        ["Metric", "Value"],
        ["Coding streak", f"{developer.coding_streak} days"],
        ["Average commits/day", str(developer.average_commits_per_day)],
        ["Coding hours (estimated)", str(developer.coding_hours)],
        ["Commit frequency", f"{developer.commit_frequency} / active day"],
        ["Review score", f"{developer.review_score} / 100"],
        ["Weekend activity", f"{developer.weekend_activity}%"],
    ]

    if repository and repository.metric:
        rows.extend([
            ["Repository Health Score", f"{repository.metric.health_score} / 100"],
            ["Repository Activity Score", f"{repository.metric.activity_score} / 100"],
            ["Repository Merge Rate", f"{round(repository.metric.merge_rate * 100, 1)}%"],
            ["Issue Resolution Rate", f"{round(repository.metric.issue_resolution_rate * 100, 1)}%"],
        ])

    table = Table(rows, colWidths=[250, 250])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1e3a8a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#ffffff")),
        ("GRID", (0, 0), (-1, -1), 0.3, HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 8),
    ]))

    target_name = f"Repository: {repository.full_name}" if repository else f"Developer @{user.login}"
    story = [
        Paragraph(title, styles["Title"]),
        Paragraph(f"Prepared for {target_name} - {datetime.now().strftime('%Y-%m-%d')}", styles["Normal"]),
        Spacer(1, 18),
        table,
        Spacer(1, 18),
        Paragraph("Executive Intelligence & Analysis", styles["Heading2"]),
    ]

    for part in insights.split("\n"):
        p = part.strip()
        if p:
            clean_p = p.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(clean_p, styles["BodyText"]))
            story.append(Spacer(1, 4))

    document.build(story)
    return buffer.getvalue()


SYSTEM_PROMPT = """You are RepoHub Assistant, a Senior Staff Engineer and Repository Intelligence Architect.
Your task is to answer questions about the connected software repository using ONLY verified factual evidence gathered from the repository's code, Git commits, pull requests, issues, and metrics.

Non-negotiable response principles:
1. Grounded citations: Whenever you discuss code or Git history, cite the exact file path (e.g. `src/auth.ts`), line numbers where known, and commit SHA.
2. Never hallucinate: Do not fabricate commit SHAs, file paths, function implementations, or metrics.
3. Explicit uncertainty: If the requested information is not present in the indexed files or Git records, clearly state that the information is unavailable.
4. Professional analysis: Clearly distinguish between (A) Verified facts, (B) Structural code analysis, and (C) Engineering recommendations.
"""


def _determine_tools_to_run(question: str, repo_id: int) -> list[tuple[str, dict[str, Any]]]:
    """Heuristic tool selector for hybrid grounding before or alongside LLM reasoning."""
    q = question.lower()
    tools: list[tuple[str, dict[str, Any]]] = []

    # 1. Overview check
    if any(k in q for k in ["architecture", "overview", "summary", "modules", "what is", "about this", "health", "score"]):
        tools.append(("get_repository_overview", {"repository_id": repo_id}))

    # 2. History check
    if any(k in q for k in ["history", "changed", "commits", "commit", "recent", "who changed", "when"]):
        tools.append(("get_commit_history", {"repository_id": repo_id, "limit": 10}))

    # 3. Pull requests
    if any(k in q for k in ["pr", "pull request", "review", "merged"]):
        # Extract number if any
        import re
        pr_match = re.search(r"#?(\d+)", question)
        if pr_match and "pr" in q:
            tools.append(("get_pull_request", {"repository_id": repo_id, "pr_number": int(pr_match.group(1))}))

    # 4. Contributors
    if any(k in q for k in ["contributor", "who works", "authors", "team"]):
        tools.append(("get_contributors", {"repository_id": repo_id, "limit": 10}))

    # 5. Semantic code search
    tools.append(("search_code", {"repository_id": repo_id, "query": question, "limit": 3}))

    return tools


async def chat_with_repository_assistant(
    db: Session,
    user: User,
    question: str,
    repository_id: int | None = None,
    conversation_id: int | None = None,
    revision: str | None = None,
) -> AIChatResponse:
    """Flagship Repository Intelligence Assistant: tool-calling, grounded evidence, persistence."""
    settings = get_settings()

    # 1. Manage Conversation Persistence
    conversation = None
    if conversation_id:
        conversation = db.scalar(
            select(AIConversation).where(
                AIConversation.id == conversation_id,
                AIConversation.user_id == user.id,
            )
        )

    if not conversation:
        title = question[:40] + ("..." if len(question) > 40 else "")
        conversation = AIConversation(
            user_id=user.id,
            repository_id=repository_id,
            title=title,
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # Record User Message
    user_msg = AIMessage(
        conversation_id=conversation.id,
        role="user",
        content=question,
    )
    db.add(user_msg)
    db.commit()

    # 2. Target Repository Scoping
    target_repo = None
    if repository_id:
        target_repo = check_repository_access(db, repository_id, user.id)

    all_citations: list[GroundedCitation] = []
    tool_infos: list[ToolExecutionInfo] = []
    gathered_context = []

    # 3. Execute Controlled Tools
    if target_repo:
        tools_to_run = _determine_tools_to_run(question, target_repo.id)
        for t_name, t_args in tools_to_run:
            start_t = asyncio.get_event_loop().time()
            t_res, t_cits = await execute_tool(t_name, t_args, user.id, db, conversation_id=conversation.id)
            duration = (asyncio.get_event_loop().time() - start_t) * 1000

            all_citations.extend(t_cits)
            tool_infos.append(ToolExecutionInfo(
                tool_name=t_name,
                arguments=t_args,
                result_summary=str(t_res)[:300],
                duration_ms=round(duration, 2),
            ))
            gathered_context.append(f"Tool `{t_name}` result:\n{json.dumps(t_res, default=str, indent=2)}")

    # 4. Generate LLM Answer
    context_str = "\n\n".join(gathered_context)
    repo_meta_line = f"Target Repository: {target_repo.full_name} (ID: {target_repo.id})" if target_repo else "No specific repository targeted."

    llm_prompt = f"""
{repo_meta_line}
User Question: {question}

Grounded Repository Tool Evidence:
{context_str if context_str else "No repository tools executed. Use developer profile metrics."}
"""

    answer_text = ""
    if settings.gemini_api_key:
        try:
            from google import genai
            client = genai.Client(api_key=settings.gemini_api_key)
            resp = client.models.generate_content(
                model=settings.gemini_model,
                config=genai.types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.2,
                ),
                contents=llm_prompt,
            )
            if resp and resp.text:
                answer_text = resp.text
        except Exception as exc:
            logger.warning(f"Gemini LLM call failed ({exc}). Using deterministic grounded answer.")

    if not answer_text:
        # Grounded deterministic response
        if target_repo:
            lines = [
                f"### Analysis for **{target_repo.full_name}**\n",
                f"**Question:** {question}\n",
            ]
            if gathered_context:
                lines.append("#### Verified Repository Evidence:")
                for info in tool_infos:
                    lines.append(f"- **Executed Tool:** `{info.tool_name}` ({info.duration_ms}ms)")
                    if info.result_summary:
                        lines.append(f"  *Data:* {info.result_summary[:200]}...")

                if all_citations:
                    lines.append("\n#### Grounded References:")
                    for cit in all_citations[:5]:
                        if cit.file_path:
                            lines.append(f"- File: `{cit.file_path}` (Lines {cit.start_line}-{cit.end_line})")
                        elif cit.commit_sha:
                            lines.append(f"- Commit: `{cit.commit_sha[:8]}`")
                        elif cit.pr_number:
                            lines.append(f"- Pull Request: `#{cit.pr_number}`")

                lines.append("\n*Note: Configure GEMINI_API_KEY in .env for full conversational AI reasoning.*")
            else:
                lines.append("No specific code or commit records matched this query in the repository.")
            answer_text = "\n".join(lines)
        else:
            answer_text = generate_insights(db, user, question)

    # 5. Persist Assistant Message
    cits_json = json.dumps([c.model_dump() for c in all_citations]) if all_citations else None
    tools_json = json.dumps([t.model_dump() for t in tool_infos]) if tool_infos else None

    assistant_msg = AIMessage(
        conversation_id=conversation.id,
        role="assistant",
        content=answer_text,
        grounded_references=cits_json,
        tool_calls=tools_json,
    )
    db.add(assistant_msg)
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assistant_msg)

    return AIChatResponse(
        answer=answer_text,
        conversation_id=conversation.id,
        message_id=assistant_msg.id,
        grounded_references=all_citations,
        tool_executions=tool_infos,
    )
