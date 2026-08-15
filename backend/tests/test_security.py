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
