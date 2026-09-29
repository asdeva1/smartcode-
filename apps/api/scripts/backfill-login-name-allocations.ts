/**
 * One-time (but safely repeatable) backfill for LoginNameAllocation
 * (docs/09-BUSINESS-RULES.md section 10 / Phase 9): every User that
 * predates this table needs exactly one ACTIVE allocation reflecting
 * their current Login Name, or Manager screens built on this table
 * would show every pre-existing account as having no Login Name history
 * at all.
 *
 * ATTRIBUTION (corrected per Phase 9 review): a pre-existing account has
 * no real "who allocated this Login Name to me" actor recorded anywhere.
 * Rather than falsely attributing the backfilled row to the account
 * holder themselves (an unverified historical claim) or inventing a
 * Manager who never took this action, `allocatedById` is left NULL -
 * mirroring the existing, already-nullable `AuditLog.userId` convention
 * this schema uses elsewhere for actor-less/system-origin events (see
 * schema.prisma's LoginNameAllocation.allocatedById comment). `reason` is
 * set to a fixed INITIAL_BACKFILL marker string so these rows are always
 * explicitly identifiable as system-generated, never confused with a real
 * Manager-driven allocation. No new LoginNameAllocationStatus value is
 * introduced - status is still plain ACTIVE, per the fixed three-value
 * enum.
 *
 * Every real Manager allocation - the `reallocate()` call from
 * UsersService.changeLoginName, invoked from the approved TL-request /
 * Manager-approve workflow or the direct Manager route - always carries a
 * real, authenticated actor.id. This script is the one and only place
 * `allocatedById` is ever left null.
 *
 * IDEMPOTENT: for each User, first checks whether an ACTIVE allocation
 * already exists (created here on a previous run, or by
 * UsersService.changeLoginName if a login-name change already happened
 * since Phase 9 shipped) and skips it if so - never creates a duplicate
 * ACTIVE row, and the migration's own partial unique index would reject
 * one even if this check were ever bypassed. Safe to run any number of
 * times, in any order, including against a database that already has
 * allocation history from real use.
 *
 * AUDIT: each backfilled row also gets a matching AuditLog entry
 * (userId: null, same system-origin convention) so the backfill itself is
 * traceable through the existing compliance log, not a silent side effect.
 *
 * Run:
 *   pnpm --filter @smartcode/api exec ts-node scripts/backfill-login-name-allocations.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const INITIAL_BACKFILL_REASON =
  'INITIAL_BACKFILL: system-generated at Phase 9 rollout for a pre-existing account; no historical allocator recorded (allocatedById intentionally null - never attributed to the account holder or a fabricated Manager).';

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, loginName: true, employeeId: true, createdAt: true } });

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const existingActive = await prisma.loginNameAllocation.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
    });
    if (existingActive) {
      skipped += 1;
      continue;
    }

    // Defensive: a differently-owned ACTIVE allocation already sitting on
    // this exact Login Name would violate the partial unique index - this
    // should never happen (User.loginName is itself globally unique), but
    // skip with a loud warning rather than letting the insert throw and
    // abort the whole backfill for every user after it.
    const conflicting = await prisma.loginNameAllocation.findFirst({
      where: { loginName: user.loginName, status: 'ACTIVE', userId: { not: user.id } },
    });
    if (conflicting) {
      console.warn(
        `SKIPPED ${user.loginName} (user ${user.id}): an ACTIVE allocation for this Login Name already belongs to a different user (${conflicting.userId}). Investigate manually.`,
      );
      skipped += 1;
      continue;
    }

    const allocation = await prisma.loginNameAllocation.create({
      data: {
        loginName: user.loginName,
        userId: user.id,
        employeeId: user.employeeId,
        status: 'ACTIVE',
        allocatedAt: user.createdAt,
        allocatedById: null,
        reason: INITIAL_BACKFILL_REASON,
      },
    });

    // Same compliance AuditLog table every other allocation event writes
    // to (see apps/api/src/common/audit-log.ts) - userId: null uses that
    // model's own existing nullable-actor convention for this
    // system-origin event, never a fabricated caller.
    await prisma.auditLog.create({
      data: {
        userId: null,
        role: null,
        action: 'LOGIN_NAME_ALLOCATION_BACKFILLED',
        entity: 'LoginNameAllocation',
        entityId: allocation.id,
        after: { loginName: allocation.loginName, userId: allocation.userId, employeeId: allocation.employeeId, reason: INITIAL_BACKFILL_REASON },
      },
    });

    created += 1;
  }

  console.log(`LoginNameAllocation backfill complete: ${created} created, ${skipped} skipped (already had an active allocation, or a conflict was found).`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
