from io import BytesIO
from datetime import datetime
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.models import DeveloperMetric, Repository, RepositoryMetric, User
from app.services.analytics import language_distribution

def analytics_context(db: Session, user: User) -> str:
    developer = db.scalar(select(DeveloperMetric).where(DeveloperMetric.user_id == user.id))
    metrics = db.execute(select(Repository.full_name, RepositoryMetric.health_score, RepositoryMetric.activity_score).join(RepositoryMetric).where(Repository.user_id == user.id)).all()
    languages = language_distribution(db, user.id)
    return f"Developer: {user.login}. Developer metrics: {developer}. Repositories: {metrics}. Languages: {languages}."

def generate_insights(db: Session, user: User, question: str | None = None) -> str:
    context = analytics_context(db, user)
    prompt = question or "Create concise repository summaries, developer strengths and weaknesses, skill extraction, a learning roadmap, resume bullets, career recommendations, and technical-debt priorities from this data. Be candid and do not invent evidence."
    settings = get_settings()
    if settings.gemini_api_key:
        from google import genai
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.gemini_model,
            config=genai.types.GenerateContentConfig(
                system_instruction="You are a precise engineering career analyst. Use only provided GitHub analytics."
            ),
            contents=f"{context}\n\nQuestion: {prompt}",
        )
        return response.text
    return "AI is not configured. Add GEMINI_API_KEY to .env, rebuild the backend, and sync again. Available context: " + context

def create_pdf(title: str, insights: str, db: Session, user: User) -> bytes:
    buffer = BytesIO(); styles = getSampleStyleSheet()
    document = SimpleDocTemplate(buffer, pagesize=letter, title=title, leftMargin=42, rightMargin=42, topMargin=42)
    developer = db.scalar(select(DeveloperMetric).where(DeveloperMetric.user_id == user.id))
    rows = [["Metric", "Value"], ["Coding streak", str(developer.coding_streak if developer else 0)], ["Average commits/day", str(developer.average_commits_per_day if developer else 0)], ["Review score", str(developer.review_score if developer else 0)]]
    table = Table(rows, colWidths=[250, 250]); table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), HexColor("#1e3a8a")), ("TEXTCOLOR", (0,0), (-1,0), HexColor("#ffffff")), ("GRID", (0,0), (-1,-1), .3, HexColor("#cbd5e1")), ("PADDING", (0,0), (-1,-1), 8)]))
    story = [Paragraph(title, styles["Title"]), Paragraph(f"Prepared for @{user.login} - {datetime.now().strftime('%Y-%m-%d')}", styles["Normal"]), Spacer(1, 18), table, Spacer(1, 18), Paragraph("AI insights and recommendations", styles["Heading2"])]
    story.extend(Paragraph(part, styles["BodyText"]) for part in insights.split("\n") if part.strip())
    document.build(story); return buffer.getvalue()