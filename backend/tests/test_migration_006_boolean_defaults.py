import importlib.util
from pathlib import Path
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.schema import CreateTable
from app.models.models import Branch


def load_migration_module():
    migration_path = Path(__file__).parent.parent / "alembic" / "versions" / "006_repository_intelligence.py"
    spec = importlib.util.spec_from_file_location("migration_006", migration_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_006_postgresql_boolean_defaults():
    """Verify that PostgreSQL DDL for branches uses SQL boolean 'false' instead of integer 0."""
    metadata = sa.MetaData()
    branches_table = sa.Table(
        "branches",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("commit_sha", sa.String(64), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("is_protected", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    pg_ddl = str(CreateTable(branches_table).compile(dialect=postgresql.dialect()))

    # Must contain DEFAULT false and NOT DEFAULT 0
    assert "is_default BOOLEAN DEFAULT false NOT NULL" in pg_ddl
    assert "is_protected BOOLEAN DEFAULT false NOT NULL" in pg_ddl
    assert "DEFAULT 0" not in pg_ddl
    assert "DEFAULT 1" not in pg_ddl


def test_migration_006_sqlite_boolean_defaults():
    """Verify that SQLite DDL compiles boolean defaults correctly."""
    metadata = sa.MetaData()
    branches_table = sa.Table(
        "branches",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repository_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("commit_sha", sa.String(64), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("is_protected", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    sqlite_ddl = str(CreateTable(branches_table).compile(dialect=sqlite.dialect()))
    assert "is_default BOOLEAN DEFAULT (0) NOT NULL" in sqlite_ddl
    assert "is_protected BOOLEAN DEFAULT (0) NOT NULL" in sqlite_ddl


def test_migration_006_source_file_no_integer_boolean_defaults():
    """Verify that the migration file source code does not contain integer server_default for booleans."""
    migration_path = Path(__file__).parent.parent / "alembic" / "versions" / "006_repository_intelligence.py"
    content = migration_path.read_text(encoding="utf-8")

    # Ensure no sa.text("0") or server_default="0" on boolean columns
    assert 'sa.Column("is_default", sa.Boolean(), server_default=sa.text("0")' not in content
    assert 'sa.Column("is_protected", sa.Boolean(), server_default=sa.text("0")' not in content
    assert 'sa.Column("is_default", sa.Boolean(), server_default="0"' not in content
    assert 'sa.Column("is_protected", sa.Boolean(), server_default="0"' not in content

    # Ensure sa.false() is used
    assert 'sa.Column("is_default", sa.Boolean(), server_default=sa.false()' in content
    assert 'sa.Column("is_protected", sa.Boolean(), server_default=sa.false()' in content


def test_branch_model_consistency():
    """Verify that SQLAlchemy Branch model is consistent with migration Boolean server defaults."""
    col_is_default = Branch.is_default.property.columns[0]
    col_is_protected = Branch.is_protected.property.columns[0]

    assert isinstance(col_is_default.type, sa.Boolean)
    assert isinstance(col_is_protected.type, sa.Boolean)

    # Python-level defaults
    assert col_is_default.default.arg is False
    assert col_is_protected.default.arg is False

    # Server-level defaults
    assert col_is_default.server_default is not None
    assert col_is_protected.server_default is not None

    pg_ddl = str(CreateTable(Branch.__table__).compile(dialect=postgresql.dialect()))
    assert "is_default BOOLEAN DEFAULT false NOT NULL" in pg_ddl
    assert "is_protected BOOLEAN DEFAULT false NOT NULL" in pg_ddl


def test_branch_boolean_insert_in_sqlite():
    """Verify that inserting a row without is_default/is_protected gets False from defaults."""
    engine = sa.create_engine("sqlite:///:memory:")
    metadata = sa.MetaData()
    table = sa.Table(
        "branches",
        metadata,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("is_protected", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    metadata.create_all(engine)

    with engine.connect() as conn:
        conn.execute(sa.insert(table).values(id=1, name="main"))
        conn.commit()

        row = conn.execute(sa.select(table).where(table.c.id == 1)).fetchone()
        assert row is not None
        assert row.is_default is False
        assert row.is_protected is False
