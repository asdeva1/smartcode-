/**
 * Seeds exactly one Manager account so the account-creation hierarchy
 * (Manager -> TL/Auditor -> Coder) has a starting point. Run via:
 *   pnpm --filter @smartcode/api exec ts-node ./prisma/seed.ts
 * (Moved here from the repo-root prisma/ during the Phase 1 Docker
 * review - see apps/api/prisma/schema.prisma's header comment for why.)
 * Password is read from SEED_MANAGER_PASSWORD (falls back to a dev-only
 * default) - never hardcode a real credential here.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const password = process.env.SEED_MANAGER_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await argon2.hash(password);

  const manager = await prisma.user.upsert({
    where: { loginName: 'manager.admin' },
    update: {},
    create: {
      employeeId: 'EMP0001',
      loginName: 'manager.admin',
      email: 'manager.admin@smartclues.local',
      passwordHash,
      role: 'MANAGER',
      isActive: true,
    },
  });

  console.log(`Seeded Manager: ${manager.loginName} (${manager.employeeId})`);
  if (!process.env.SEED_MANAGER_PASSWORD) {
    console.warn('SEED_MANAGER_PASSWORD not set - used dev-only default. Do not use in a shared environment.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
