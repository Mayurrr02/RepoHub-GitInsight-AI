# RepoHub Scaling & High-Availability Guide

This document outlines strategies for scaling RepoHub from single-node deployments to high-throughput enterprise workloads handling thousands of concurrent developers.

---

## 1. Application Layer Scaling (FastAPI)

FastAPI runs on Uvicorn ASGI workers. For production nodes:

- **Worker Tuning**: Run `2 × (CPU cores) + 1` worker processes per server.
- **Horizontal Scaling**: Deploy multiple backend containers behind Nginx or an AWS Application Load Balancer (ALB).
- **Statelessness**: The API is completely stateless; JWT tokens are validated symmetrically, and WebSocket connections use Redis Pub/Sub to synchronize across multiple API instances.

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## 2. Background Processing Scaling (Celery Workers)

GitHub ingestion and heavy metrics calculations are offloaded to Celery.

### Dedicated Queue Separation
Split Celery workers into dedicated queues to prevent long synchronization jobs from blocking fast tasks:

- `sync_high`: Fast metadata sync and lightweight updates.
- `sync_batch`: Ingestion of large repositories (10,000+ commits).
- `ai_reports`: PDF generation and LLM queries.

Launch workers with concurrency and dedicated queues:
```bash
celery -A app.workers.celery_app worker -Q sync_high,sync_batch -c 8 -l INFO
```

---

## 3. Database Layer Scaling (PostgreSQL)

### Connection Pooling with PgBouncer
When running 20+ API instances, direct PostgreSQL connections can exhaust database connection limits. Deploy PgBouncer in transaction pooling mode:

```ini
[databases]
repohub = host=postgres port=5432 dbname=repohub pool_size=50

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
```

### Read Replicas
For heavy read operations (Team Dashboards, Contributor Rankings, History timelines), direct analytical queries to PostgreSQL read-replicas using SQLAlchemy engine routing.

### Database Indexing & Table Partitioning
- B-Tree indexes exist on `(repository_id, committed_at)` on the `commits` table.
- For high-volume enterprise deployments, partition the `commits` and `audit_logs` tables by year/month.

---

## 4. Real-Time & Caching Layer (Redis)

- Enable Redis persistence via Append-Only File (AOF): `appendonly yes`.
- Set maxmemory eviction policy: `maxmemory-policy allkeys-lru`.
- Deploy Redis Sentinel or AWS ElastiCache for Redis in cluster mode for automatic failover.
