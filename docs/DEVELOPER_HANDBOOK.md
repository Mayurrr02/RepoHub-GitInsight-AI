# RepoHub Developer Handbook

Welcome to the RepoHub engineering team! This handbook contains everything you need to develop, test, and contribute to the RepoHub platform.

---

## 1. Local Development Quickstart

### Prerequisites
- Python 3.11+
- Node.js 22+
- Docker & Docker Compose
- PostgreSQL & Redis (or run them via Docker)

### Backend Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Worker Setup
```bash
cd backend
source .venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=INFO
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## 2. Database Migrations Workflow

We use **Alembic** for schema migrations.

### Creating a New Migration
When modifying `backend/app/models/models.py`:
```bash
cd backend
source .venv/bin/activate
alembic revision -m "description_of_change"
```

Edit the generated migration script in `backend/alembic/versions/` with `upgrade()` and `downgrade()`.

### Applying Migrations
```bash
alembic upgrade head
```

### Rollback Migration
```bash
alembic downgrade -1
```

---

## 3. Running Automated Tests

All tests are written with `pytest` and `fastapi.testclient`:

```bash
cd backend
source .venv/bin/activate
pytest -v
```

For frontend TypeScript validation:
```bash
cd frontend
npm run build
```

---

## 4. Coding Standards & Best Practices

- **Security First**: Always validate incoming payloads using Pydantic models. Never construct raw SQL queries; use SQLAlchemy ORM or parameterized `text()`.
- **RBAC Checks**: Protect team-scoped endpoints using the `require_org_role` dependency.
- **Audit Logging**: Any state-changing administrative action (role change, member removal, repo linking) must record an audit event via `record_audit_log`.
- **Real-Time Updates**: Broadcast asynchronous progress events using `publish_realtime_event()`.
- **Async Safety**: Ensure all datetime comparisons in services use timezone-aware timestamps.

---

## 5. Security & Contribution Checklist

Before submitting a pull request:
- [ ] All 16+ pytest backend tests pass cleanly.
- [ ] Frontend builds without TypeScript or JSX compiler errors.
- [ ] No hardcoded secrets, tokens, or credentials in codebase.
- [ ] New database tables include proper indexes, foreign key cascade constraints, and unique constraints.
