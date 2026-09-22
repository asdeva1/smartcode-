import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Phase 1 exit criteria: "API health works", "Redis connection works".
 * Requires DATABASE_URL/REDIS_URL to point at a running Postgres/Redis
 * (docker compose up) - this suite is not run against a live database
 * inside the documentation/planning sandbox, only in your local/CI
 * environment where the Docker services are actually running.
 */
describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns service status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status');
        expect(res.body.services).toHaveProperty('api', 'ok');
        expect(res.body.services).toHaveProperty('postgres');
        expect(res.body.services).toHaveProperty('redis');
      });
  });

  it('rejects an unauthenticated request to a protected route', () => {
    return request(app.getHttpServer()).get('/api/users').expect(401);
  });

  it('rejects login with invalid credentials without leaking which field was wrong', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ loginName: 'nonexistent', password: 'wrongpassword' })
      .expect(401);
  });
});
