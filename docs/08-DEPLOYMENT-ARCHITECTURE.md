# 08 — Deployment Architecture

## Local Development — Docker Compose

Services: `web` (Next.js), `api` (NestJS), `postgres`, `redis`.

```yaml
# docker-compose.yml (illustrative — final version created in Phase 0)
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  api:
    build: ./apps/api
    ports: ["4000:4000"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

  web:
    build: ./apps/web
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [api]

volumes:
  pgdata:
```

| Concern | Detail |
|---|---|
| Ports | web `3000`, api `4000`, postgres `5432`, redis `6379` |
| Startup order | postgres/redis healthy → api starts → api reachable → web starts |
| Volumes | `pgdata` persists across restarts; source code bind-mounted in dev for hot reload |
| Network | default Compose bridge network; services reach each other by service name (`api` calls `postgres:5432`, not `localhost`) |
| Health checks | `pg_isready` for Postgres, `redis-cli ping` for Redis, a `/health` endpoint for `api` |

## `.env.example` (names only — no real values)

```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/smartcode

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_ACCESS_SECRET=changeme
JWT_REFRESH_SECRET=changeme
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# AWS
AWS_REGION=ap-south-1
AWS_S3_BUCKET=smartcode-uploads
AWS_ACCESS_KEY_ID=changeme
AWS_SECRET_ACCESS_KEY=changeme

# App
NEXT_PUBLIC_API_URL=http://localhost:4000
NODE_ENV=development

# Monitoring
SENTRY_DSN=
```

## Production Target — AWS

```mermaid
flowchart TB
    U[Users] --> R53[Route 53]
    R53 --> WAF[AWS WAF]
    WAF --> ALB[Application Load Balancer]
    ALB --> WEBECS[ECS Fargate: Next.js]
    ALB --> APIECS[ECS Fargate: NestJS API]
    APIECS --> RDS[(RDS PostgreSQL - Multi-AZ)]
    APIECS --> EC[(ElastiCache Redis)]
    APIECS --> S3[(S3 - exports, attachments)]
    APIECS --> SM[Secrets Manager]
    WEBECS -.optional.-> VERCEL[or: Vercel for web tier]
    APIECS --> CW[CloudWatch Logs/Metrics]
    APIECS -.errors.-> SENTRY[Sentry]
```

| Component | Service | Why |
|---|---|---|
| Frontend hosting | Vercel *or* ECS Fargate | Vercel is lower-ops for Next.js if acceptable; ECS keeps everything in one AWS account/VPC if that's a hard requirement (compliance, network isolation for healthcare data) |
| Backend | ECS Fargate | No server management, scales on load, fits a stateless NestJS API |
| Database | RDS PostgreSQL, Multi-AZ | Managed backups, failover, point-in-time recovery — important given this is healthcare-adjacent operational data |
| Cache/Queue | ElastiCache Redis | Managed Redis for BullMQ + caching, matches the Docker Compose dev topology |
| Object storage | S3 | Report exports, any future chart attachments |
| DNS | Route 53 | |
| Edge security | AWS WAF in front of the ALB | Basic protection against common web exploits before traffic reaches the app |
| Secrets | Secrets Manager | No secrets in ECS task definitions in plaintext, no secrets in the repo |
| IAM | Least-privilege task roles per service — the API's ECS task role can write to the specific S3 bucket and read the specific Secrets Manager secrets it needs, nothing broader |
| Monitoring | CloudWatch (infra metrics/logs) + Sentry (application error tracking) |

**Nothing here is deployed yet** — this is the target to build toward starting in Phase 9 of the roadmap, once the application itself is functional and tested locally/in CI.
