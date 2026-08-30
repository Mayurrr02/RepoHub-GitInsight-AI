from app.core.rate_limit import MemoryRateLimiter


def test_security_headers_and_correlation_id(client):
    # Test with a known health endpoint
    response = client.get("/health/live")
    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "Content-Security-Policy" in response.headers
    assert "Strict-Transport-Security" in response.headers


def test_rate_limiter_memory():
    limiter = MemoryRateLimiter()
    key = "test_client_ip"

    # Should allow 3 requests in 10s
    for i in range(3):
        allowed, remaining, _ = limiter.is_allowed(key, max_requests=3, window_seconds=10)
        assert allowed is True
        assert remaining == 2 - i

    # 4th request should be blocked
    allowed, remaining, reset_after = limiter.is_allowed(key, max_requests=3, window_seconds=10)
    assert allowed is False
    assert remaining == 0
    assert reset_after > 0


def test_database_url_normalization():
    from app.core.config import Settings
    
    s1 = Settings(database_url="postgres://user:pass@host:5432/db")
    assert s1.database_url == "postgresql+psycopg://user:pass@host:5432/db"

    s2 = Settings(database_url="postgresql://user:pass@host:5432/db")
    assert s2.database_url == "postgresql+psycopg://user:pass@host:5432/db"

    s3 = Settings(database_url="sqlite:///./test.db")
    assert s3.database_url == "sqlite:///./test.db"


def test_cors_vercel_and_railway_origins(client):
    # Test Vercel frontend origin
    resp1 = client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://repohub.vercel.app",
            "Access-Control-Request-Method": "GET",
        }
    )
    assert resp1.headers.get("access-control-allow-origin") == "https://repohub.vercel.app"

    # Test Railway domain origin
    resp2 = client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://repohub-web.up.railway.app",
            "Access-Control-Request-Method": "GET",
        }
    )
    assert resp2.headers.get("access-control-allow-origin") == "https://repohub-web.up.railway.app"

