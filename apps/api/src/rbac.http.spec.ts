process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';

import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { Role } from '@smartcode/types';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

/**
 * Boots the real AppModule - global JwtAuthGuard, RolesGuard, the
 * production ValidationPipe settings - with only Prisma replaced, and
 * sends real HTTP requests. Proves route-level RBAC for every new
 * endpoint, and that it is wired, not just decorated.
 */
const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const USERS: Record<Role, any> = {
  MANAGER: { id: 'mgr', role: 'MANAGER', teamId: null, leadsTeam: null },
  TEAM_LEAD: { id: 'tl', role: 'TEAM_LEAD', teamId: null, leadsTeam: { id: TEAM_ID } },
  CODER: { id: 'coder', role: 'CODER', teamId: TEAM_ID, leadsTeam: null },
  AUDITOR: { id: 'aud', role: 'AUDITOR', teamId: null, leadsTeam: null },
};
for (const u of Object.values(USERS)) {
  Object.assign(u, { employeeId: `E-${u.id}`, loginName: `${u.id}.login`, email: `${u.id}@x.local`, fullName: u.id, isActive: true });
}

/** Any model method resolves to an "empty" result; user lookups resolve the callers above. */
function prismaMock() {
  const empty = (method: string) => {
    if (method === 'findMany') return [];
    if (method === 'count') return 0;
    if (method === 'aggregate') return { _max: {}, _sum: {} };
    return null;
  };
  const models: Record<string, any> = {};
  const model = (name: string) =>
    (models[name] ??= new Proxy(
      {},
      {
        get: (target: any, method: string) =>
          (target[method] ??= jest.fn(async (args: any) => {
            if (name === 'user' && method === 'findUnique') {
              return Object.values(USERS).find((u) => u.id === args?.where?.id) ?? null;
            }
            return empty(method);
          })),
      },
    ));
  return new Proxy(
    { $connect: jest.fn(), $disconnect: jest.fn(), $transaction: jest.fn(), $queryRaw: jest.fn() },
    { get: (t: any, key: string) => (key in t ? t[key] : typeof key === 'string' && !key.startsWith('$') ? model(key) : undefined) },
  );
}

async function bootApp(prisma: any): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.setGlobalPrefix('api', { exclude: ['health'] });
  await app.init();
  return app;
}

const token = (app: INestApplication, role: Role) =>
  app.get(JwtService).sign({ sub: USERS[role].id, role }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '5m' });

type Method = 'get' | 'post' | 'patch' | 'delete';
const ID = '22222222-2222-4222-8222-222222222222';
const ALL: Role[] = ['MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR'];

const ROUTES: { method: Method; path: string; allowed: Role[] }[] = [
  { method: 'post', path: '/api/manager/team-leads', allowed: ['MANAGER'] },
  { method: 'get', path: '/api/manager/team-leads', allowed: ['MANAGER'] },
  { method: 'post', path: '/api/manager/auditors', allowed: ['MANAGER'] },
  { method: 'get', path: '/api/manager/auditors', allowed: ['MANAGER'] },
  { method: 'patch', path: `/api/manager/auditors/${ID}`, allowed: ['MANAGER'] },
  { method: 'patch', path: `/api/users/${ID}/deactivate`, allowed: ['MANAGER', 'TEAM_LEAD'] },
  { method: 'post', path: '/api/team-leads/coders', allowed: ['TEAM_LEAD'] },
  { method: 'get', path: '/api/team-leads/coders', allowed: ['TEAM_LEAD'] },
  { method: 'get', path: '/api/team-leads/coders/export?format=csv', allowed: ['TEAM_LEAD'] },
  { method: 'post', path: '/api/team-leads/coders/import/preview', allowed: ['TEAM_LEAD'] },
  { method: 'patch', path: `/api/team-leads/coders/${ID}`, allowed: ['TEAM_LEAD'] },
  { method: 'get', path: '/api/manager/projects', allowed: ['MANAGER'] },
  { method: 'post', path: '/api/manager/auditor-assignments', allowed: ['MANAGER'] },
  { method: 'get', path: '/api/projects/mine', allowed: ALL },
  { method: 'post', path: '/api/production', allowed: ['CODER'] },
  { method: 'get', path: '/api/production', allowed: ['MANAGER', 'TEAM_LEAD', 'CODER'] },
  { method: 'patch', path: `/api/production/${ID}`, allowed: ['CODER'] },
  { method: 'post', path: `/api/production/${ID}/rework`, allowed: ['CODER', 'TEAM_LEAD', 'MANAGER'] },
  { method: 'post', path: `/api/production/${ID}/cancel`, allowed: ['TEAM_LEAD', 'MANAGER'] },
  { method: 'get', path: '/api/charts', allowed: ALL },
  { method: 'get', path: '/api/charts/CH-1/audit-history', allowed: ['MANAGER', 'TEAM_LEAD', 'AUDITOR'] },
  { method: 'get', path: '/api/charts/CH-1/production', allowed: ['AUDITOR', 'TEAM_LEAD', 'MANAGER'] },
  { method: 'get', path: '/api/auditor/queue', allowed: ['AUDITOR'] },
  { method: 'post', path: '/api/audits', allowed: ['AUDITOR'] },
  { method: 'get', path: '/api/audits', allowed: ['AUDITOR', 'TEAM_LEAD', 'MANAGER'] },
  { method: 'patch', path: `/api/audits/${ID}`, allowed: ['AUDITOR'] },
  { method: 'post', path: `/api/audits/${ID}/resolve`, allowed: ['TEAM_LEAD', 'MANAGER'] },
  { method: 'post', path: `/api/audits/${ID}/reaudit`, allowed: ['AUDITOR', 'MANAGER'] },
  { method: 'post', path: '/api/audits/import', allowed: ['AUDITOR'] },
  { method: 'get', path: '/api/reports/dashboard', allowed: ALL },
];

describe('HTTP route RBAC (real AppModule, guards and pipes)', () => {
  // A fresh app per role keeps each run well under the global rate limit.
  describe.each(ALL)('as %s', (role) => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await bootApp(prismaMock());
    });
    afterAll(async () => app.close());

    it.each(ROUTES.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r] as const))('%s', async (_label, route) => {
      const res = await request(app.getHttpServer())[route.method](route.path).set('Authorization', `Bearer ${token(app, role)}`).send({});
      if (route.allowed.includes(role)) {
        expect([401, 403]).not.toContain(res.status);
      } else {
        // Rejected by RolesGuard itself (route layer), not merely by a service check.
        expect(res.status).toBe(403);
        expect(JSON.stringify(res.body)).toContain(`Role '${role}' is not permitted to perform this action`);
      }
    });
  });
});

describe('HTTP behaviour of the new endpoints', () => {
  let app: INestApplication;
  let prisma: any;
  beforeAll(async () => {
    prisma = prismaMock();
    app = await bootApp(prisma);
  });
  afterAll(async () => app.close());
  const as = (role: Role) => `Bearer ${token(app, role)}`;

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/api/production').expect(401);
  });

  it('never accepts a client-supplied coder identity on production', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/production')
      .set('Authorization', as('CODER'))
      .send({ chartId: 'CH-1', pageCount: 1, totalICDs: 1, totalDOS: 1, status: 'COMPLETED', codedDate: '2026-01-01', coderId: 'someone-else' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('property coderId should not exist');
  });

  it('never accepts a client-supplied auditor identity on audits', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/audits')
      .set('Authorization', as('AUDITOR'))
      .send({ chartId: 'CH-1', auditErrors: 1, errorExceptions: 0, status: 'COMPLETED', auditDate: '2026-01-01', auditorId: 'x' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('property auditorId should not exist');
  });

  it('resolves a Team Lead\'s team from Team.teamLeadId and scopes the coder list to it', async () => {
    await request(app.getHttpServer()).get('/api/team-leads/coders').set('Authorization', as('TEAM_LEAD')).expect(200);
    const where = prisma.user.findMany.mock.calls.at(-1)[0].where;
    expect(where).toMatchObject({ role: 'CODER', teamId: TEAM_ID });
  });

  it('streams exports as attachments with a dated filename', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/team-leads/coders/export?format=csv&status=active')
      .set('Authorization', as('TEAM_LEAD'))
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="smartcode-team-coders-\d{8}-\d{4}\.csv"$/);
  });

  it('rejects an unknown export format', async () => {
    const res = await request(app.getHttpServer()).get('/api/production/export?format=docx').set('Authorization', as('CODER'));
    expect(res.status).toBe(400);
  });

  it('rejects non-CSV imports (Excel/PDF import is not supported)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/team-leads/coders/import/preview')
      .set('Authorization', as('TEAM_LEAD'))
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'coders.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Only \.csv files/);
  });

  it('rejects a report outside the caller\'s role', async () => {
    const res = await request(app.getHttpServer()).get('/api/reports/auditor-productivity').set('Authorization', as('CODER'));
    expect(res.status).toBe(403);
  });
});
