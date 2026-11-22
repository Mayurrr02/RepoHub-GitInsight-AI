from app.services.code_indexer import (
    extract_chunks_and_symbols,
    hash_content,
    should_skip_file,
)


def test_should_skip_sensitive_and_vendor_files():
    assert should_skip_file(".env") is True
    assert should_skip_file(".env.production") is True
    assert should_skip_file("id_rsa") is True
    assert should_skip_file("server.key") is True
    assert should_skip_file("cert.pem") is True
    assert should_skip_file("node_modules/axios/index.js") is True
    assert should_skip_file(".venv/lib/python/site-packages/pkg.py") is True
    assert should_skip_file("package-lock.json") is True
    assert should_skip_file("Cargo.lock") is True

    # Valid source files must NOT be skipped
    assert should_skip_file("backend/app/main.py") is False
    assert should_skip_file("frontend/src/App.tsx") is False
    assert should_skip_file("services/auth.go") is False
    assert should_skip_file("src/main.rs") is False


def test_python_structural_chunking_and_symbols():
    py_code = '''"""Module documentation string."""
import os

class RepositoryEngine:
    """Manages repository intelligence."""
    def __init__(self, name: str):
        self.name = name

    def compute_metrics(self) -> dict:
        """Calculate health index."""
        return {"status": "ok"}

def standalone_helper(x: int) -> int:
    return x * 2
'''
    chunks, symbols = extract_chunks_and_symbols("backend/app/engine.py", py_code)

    chunk_names = [c.name for c in chunks]
    assert "RepositoryEngine" in chunk_names
    assert "RepositoryEngine.compute_metrics" in chunk_names
    assert "standalone_helper" in chunk_names

    symbol_names = [s.name for s in symbols]
    assert "RepositoryEngine" in symbol_names
    assert "RepositoryEngine.compute_metrics" in symbol_names
    assert "standalone_helper" in symbol_names

    # Check docstring extraction
    engine_sym = [s for s in symbols if s.name == "RepositoryEngine"][0]
    assert engine_sym.kind == "class"
    assert engine_sym.docstring == "Manages repository intelligence."


def test_typescript_structural_chunking_and_symbols():
    ts_code = '''import React from 'react';

export interface RepositoryData {
    id: number;
    name: string;
}

export class AnalyticsService {
    fetchScores() {
        return 100;
    }
}

export function formatRepository(repo: RepositoryData): string {
    return repo.name.toUpperCase();
}
'''
    chunks, symbols = extract_chunks_and_symbols("src/services/analytics.ts", ts_code)

    symbol_names = [s.name for s in symbols]
    assert "RepositoryData" in symbol_names
    assert "AnalyticsService" in symbol_names
    assert "formatRepository" in symbol_names


def test_content_hash_idempotency():
    code_a = "def test(): return 1\n"
    code_b = "def test(): return 1\n"
    code_c = "def test(): return 2\n"

    assert hash_content(code_a) == hash_content(code_b)
    assert hash_content(code_a) != hash_content(code_c)
