def test_root_endpoint(client):
    resp = client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "RepoHub Enterprise API"
    assert data["status"] == "online"
    assert data["docs"] == "/docs"


def test_health_checks(client):
    # Liveness probe
    live_resp = client.get("/health/live")
    assert live_resp.status_code == 200
    assert live_resp.json()["status"] == "live"

    # Readiness probe
    ready_resp = client.get("/health/ready")
    assert ready_resp.status_code == 200
    assert ready_resp.json()["status"] == "ready"

    # Comprehensive health check
    health_resp = client.get("/health")
    assert health_resp.status_code in (200, 503)
    data = health_resp.json()
    assert "status" in data
    assert "components" in data
    assert "database" in data["components"]
    assert data["components"]["database"]["status"] == "ok"


def test_prometheus_metrics_endpoint(client):
    metrics_resp = client.get("/metrics")
    assert metrics_resp.status_code == 200
    content = metrics_resp.text
    assert "repohub_http_requests_total" in content
    assert "repohub_active_websockets" in content
