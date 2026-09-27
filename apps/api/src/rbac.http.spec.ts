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
const VENDOR_ID = '33333333-3333-4333-8333-333333333333';
const USERS: Record<Role, any> = {
  MANAGER: { id: 'mgr', role: 'MANAGER', teamId: null, leadsTeam: null },
  TEAM_LEAD: { id: 'tl', role: 'TEAM_LEAD', teamId: null, leadsTeam: { id: TEAM_ID } },
  CODER: { id: 'coder', role: 'CODER', teamId: TEAM_ID, leadsTeam: null },
  AUDITOR: { id: 'aud', role: 'AUDITOR', teamId: null, leadsTeam: null },
  VENDOR: { id: 'ven', role: 'VENDOR', teamId: null, leadsTeam: null, vendorId: VENDOR_ID, vendor: { id: VENDOR_ID, isActive: true } },
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
const ALL: Role[] = ['MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR', 'VENDOR'];
const STAFF: Role[] = ['MANAGER', 'TEAM_LEAD', 'CODER', 'AUDITOR'];

const ROUTES: { method: Method; path: string; allowed: Role[] }[] = [
  { method: 'post', path: '/api/manager/team-leads', allowed: ['MANAGER'] },
  { method: 'get', path: '/api/manager/team-leads', allowed: ['MANAGER'] },
  { method: 'post', path: '/api/manager/auditors', allowed: ['MANAGER'] },
  { method: 'get', path: '/api/manager/auditors', allowed: ['MANAGER'] },
  { method: 'patch', path: `/api/manager/auditors/${ID}`, allowed: ['MANAGER'] },
  { method: 'patch', path: `/api/users/${ID}/deactivate`, allowed: ['MANAGER', 'TEAM_LEAD'] },
  { method: 'post', path: `/api/users/${ID}/reset-password`, allowed: ['MANAGER', 'TEAM_LEAD'] },
  { method: 'patch', path: `/api/users/${ID}/login-name`, allowed: ['MANAGER'] },
  { method: 'post', path: '/api/team-leads/coders', allowed: ['TEAM_LEAD'] },
  { method: 'get', path: '/api/team-leads/coders', allowed: ['TEAM_LEAD'] },
  { method: 'get', path: '/api/team-leads/coders/export?format=csv', allowed: ['TEAM_LEAD'] },
  { method: 'post', path: '/api/team-leads/coders/import/preview', allowed: ['TEAM_LEAD'] },
  { method: 'patch', path: `/api/team-leads/coders/${ID}`, allowed: ['TEAM_LEAD'] },
  { method: 'post', path: `/api/team-leads/coders/${ID}/login-name-request`, allowed: ['TEAM_LEAD'] },
  { method: 'get', path: '/api/manager/approvals', allowed: ['MANAGER'] },
  { method: 'patch', path: `/api/manager/approvals/${ID}/approve`, allowed: ['MANAGER'] },
  { method: 'patch', path: `/api/manager/approvals/${ID}/reject`, allowed: ['MANAGER'] },
  { method: 'get', path: '/api/manager/projects', allowed: ['MANAGER'] },
  { method: 'post', path: '/api/manager/auditor-assignments', allowed: ['MANAGER'] },
  { method: 'get', path: '/api/projects/mine', allowed: ALL },
  { method: 'post', path: '/api/production', allowed: ['CODER'] },
  { method: 'get', path: '/api/production', allowed: ['MANAGER', 'TEAM_LEAD', 'CODER', 'VENDOR'] },
  { method: 'get', path: '/api/production/export?format=csv', allowed: ['MANAGER', 'TEAM_LEAD', 'CODER', 'VENDOR'] },
  { method: 'get', path: `/api/production/${ID}`, allowed: ['MANAGER', 'TEAM_LEAD', 'CODER', 'VENDOR'] },
  { method: 'patch', path: `/api/production/${ID}`, allowed: ['CODER'] },
  { method: 'post', path: `/api/production/${ID}/rework`, allowed: ['CODER', 'TEAM_LEAD', 'MANAGER'] },
  { method: 'post', path: `/api/production/${ID}/cancel`, allowed: ['TEAM_LEAD', 'MANAGER'] },
  { method: 'get', path: '/api/charts', allowed: ALL },
  { method: 'get', path: '/api/charts/CH-1/audit-history', allowed: ['MANAGER', 'TEAM_LEAD', 'AUDITOR', 'VENDOR'] },
  { method: 'get', path: '/api/charts/CH-1/production', allowed: ['AUDITOR', 'TEAM_LEAD', 'MANAGER'] },
  { method: 'get', path: '/api/auditor/queue', allowed: ['AUDITOR'] },
  { method: 'post', path: '/api/audits', allowed: ['AUDITOR'] },
  { method: 'get', path: '/api/audits', allowed: ['AUDITOR', 'TEAM_LEAD', 'MANAGER', 'VENDOR'] },
  { method: 'patch', path: `/api/audits/${ID}`, allowed: ['AUDITOR'] },
  { method: 'post', path: `/api/audits/${ID}/resolve`, allowed: ['TEAM_LEAD', 'MANAGER'] },
  { method: 'post', path: `/api/audits/${ID}/reaudit`, allowed: ['AUDITOR', 'MANAGER'] },
  { method: 'post', path: '/api/audits/import', allowed: ['AUDITOR'] },
  { method: 'get', path: '/api/reports/dashboard', allowed: STAFF },
  // Vendor management - Manager only
  { method: 'get', path: '/api/vendors', allowed: ['MANAGER'] },
  { method: 'post', path: '/api/vendors', allowed: ['MANAGER'] },
  { method: 'get', path: '/api/vendors/options', allowed: ['MANAGER'] },
  { method: 'get', path: '/api/vendors/overview', allowed: ['MANAGER'] },
  { method: 'get', path: `/api/vendors/${ID}`, allowed: ['MANAGER'] },
  { method: 'patch', path: `/api/vendors/${ID}`, allowed: ['MANAGER'] },
  { method: 'patch', path: `/api/vendors/${ID}/activate`, allowed: ['MANAGER'] },
  { method: 'patch', path: `/api/vendors/${ID}/deactivate`, allowed: ['MANAGER'] },
  { method: 'get', path: `/api/vendors/${ID}/structure`, allowed: ['MANAGER'] },
  { method: 'get', path: `/api/vendors/${ID}/activity`, allowed: ['MANAGER'] },
  { method: 'get', path: `/api/vendors/${ID}/dashboard`, allowed: ['MANAGER'] },
  { method: 'get', path: `/api/vendors/${ID}/assignable?role=TEAM_LEAD`, allowed: ['MANAGER'] },
  { method: 'post', path: `/api/vendors/${ID}/team-leads`, allowed: ['MANAGER'] },
  { method: 'delete', path: `/api/vendors/${ID}/team-leads/${ID}`, allowed: ['MANAGER'] },
  { method: 'post', path: `/api/vendors/${ID}/auditors`, allowed: ['MANAGER'] },
  { method: 'delete', path: `/api/vendors/${ID}/auditors/${ID}`, allowed: ['MANAGER'] },
  { method: 'post', path: `/api/vendors/${ID}/accounts`, allowed: ['MANAGER'] },
  // A Vendor's own portal - Vendor only
  { method: 'get', path: '/api/vendor/me', allowed: ['VENDOR'] },
  { method: 'get', path: '/api/vendor/structure', allowed: ['VENDOR'] },
  { method: 'get', path: '/api/vendor/dashboard', allowed: ['VENDOR'] },
  // Vendor Portal Coder management - Vendor only
  { method: 'get', path: '/api/vendor/coders', allowed: ['VENDOR'] },
  { method: 'post', path: '/api/vendor/coders', allowed: ['VENDOR'] },
  { method: 'get', path: `/api/vendor/coders/${ID}`, allowed: ['VENDOR'] },
  { method: 'patch', path: `/api/vendor/coders/${ID}`, allowed: ['VENDOR'] },
  { method: 'patch', path: `/api/vendor/coders/${ID}/activate`, allowed: ['VENDOR'] },
  { method: 'patch', path: `/api/vendor/coders/${ID}/deactivate`, allowed: ['VENDOR'] },
  // Rework + notifications - row-scoped in the services
  { method: 'get', path: '/api/rework', allowed: ALL },
  { method: 'get', path: '/api/rework/summary', allowed: ALL },
  { method: 'get', path: `/api/rework/${ID}`, allowed: ALL },
  { method: 'post', path: `/api/rework/${ID}/read`, allowed: ALL },
  { method: 'post', path: `/api/rework/${ID}/resolve`, allowed: ['CODER'] },
  { method: 'get', path: '/api/notifications', allowed: ALL },
  { method: 'post', path: '/api/notifications/read-all', allowed: ALL },
  { method: 'post', path: `/api/notifications/${ID}/read`, allowed: ALL },
  // Password change - the Manager's own account only
  { method: 'post', path: '/api/auth/change-password', allowed: ['MANAGER'] },
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

  it("scopes the Vendor Portal's Coder list to the caller's own vendor, never a client-supplied one", async () => {
    await request(app.getHttpServer()).get('/api/vendor/coders').set('Authorization', as('VENDOR')).expect(200);
    const where = prisma.user.findMany.mock.calls.at(-1)[0].where;
    expect(where).toMatchObject({ role: 'CODER', vendorId: VENDOR_ID });
    // vendorId is never accepted as a request field - it is derived from the session only.
    const res = await request(app.getHttpServer())
      .post('/api/vendor/coders')
      .set('Authorization', as('VENDOR'))
      .send({ employeeId: 'E1', fullName: 'X', loginName: 'x', email: 'x@x.local', password: 'Password1!', confirmPassword: 'Password1!', vendorId: ID });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('property vendorId should not exist');
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

  it('a Vendor account cannot address another vendor through its portal (no vendor id is accepted)', async () => {
    const res = await request(app.getHttpServer()).get(`/api/vendor/dashboard?vendorId=${ID}`).set('Authorization', as('VENDOR'));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('property vendorId should not exist');
  });

  it('scopes a Vendor account\'s production list to its own vendor in the database query', async () => {
    await request(app.getHttpServer()).get('/api/production').set('Authorization', as('VENDOR')).expect(200);
    const where = prisma.productionEntry.findMany.mock.calls.at(-1)[0].where;
    expect(where.AND[0]).toEqual({ coder: { team: { teamLead: { vendorAssignments: { some: { vendorId: VENDOR_ID, isActive: true } } } } } });
  });

  it('lets a Vendor account run its (vendor-scoped) reports; per-report role rules still apply', async () => {
    await request(app.getHttpServer()).get('/api/reports/production-summary?period=this_month&today=2026-09-27').set('Authorization', as('VENDOR')).expect(200);
    await request(app.getHttpServer()).get('/api/reports/assigned-charts').set('Authorization', as('VENDOR')).expect(403);
  });

  it('refuses report filters a role may not use', async () => {
    const res = await request(app.getHttpServer()).get(`/api/reports/production-summary?vendorId=${ID}`).set('Authorization', as('TEAM_LEAD'));
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('The Vendor filter is not available for your role');
  });

  it('validates the password-change body (confirmation must match) and never accepts a target user', async () => {
    const mismatch = await request(app.getHttpServer()).post('/api/auth/change-password').set('Authorization', as('MANAGER'))
      .send({ currentPassword: 'x', newPassword: 'NewPassword1', confirmNewPassword: 'Other' });
    expect(mismatch.status).toBe(400);
    expect(JSON.stringify(mismatch.body)).toContain('Passwords do not match');
    const target = await request(app.getHttpServer()).post('/api/auth/change-password').set('Authorization', as('MANAGER'))
      .send({ currentPassword: 'x', newPassword: 'NewPassword1', confirmNewPassword: 'NewPassword1', userId: ID });
    expect(target.status).toBe(400);
    expect(JSON.stringify(target.body)).toContain('property userId should not exist');
  });

  it('never accepts a client-supplied coder identity when resolving rework', async () => {
    const res = await request(app.getHttpServer()).post(`/api/rework/${ID}/resolve`).set('Authorization', as('CODER'))
      .send({ pageCount: 1, totalICDs: 1, totalDOS: 1, codedDate: '2026-01-01', resolutionNote: 'fixed it', coderId: 'someone' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('property coderId should not exist');
  });

  it('locks out a Vendor account whose vendor is deactivated', async () => {
    USERS.VENDOR.vendor.isActive = false;
    try {
      await request(app.getHttpServer()).get('/api/production').set('Authorization', as('VENDOR')).expect(401);
    } finally {
      USERS.VENDOR.vendor.isActive = true;
    }
  });

  it('rejects a report outside the caller\'s role', async () => {
    const res = await request(app.getHttpServer()).get('/api/reports/auditor-productivity').set('Authorization', as('CODER'));
    expect(res.status).toBe(403);
  });
});
