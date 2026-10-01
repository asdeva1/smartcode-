import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@smartcode/types';
import type { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Single reusable place that changes a Coder's Team - "Organization
 * Assignment + Auto-Visibility" requirement sections 1/9/11. Every call
 * site that ever writes User.teamId for a CODER (initial creation, the
 * Vendor -> Team Lead -> Coder cascade, a Team Lead's "Relieve from Team")
 * goes through this helper instead of touching the scalar directly, so:
 *
 *   - User.teamId (the current-state pointer every scope/RBAC helper
 *     reads) and the TeamMembership ledger (the history) can never drift
 *     apart - one call updates both, in the same transaction the caller
 *     passes in.
 *   - The "at most one ACTIVE membership per Coder" invariant (enforced
 *     again at the DB level by a partial unique index - see this table's
 *     migration) is upheld by construction: the previous active row is
 *     always ended before a new one is opened.
 *
 * `db` is expected to be a `Prisma.TransactionClient` for any call that
 * also touches User.teamId or other related rows in the same operation
 * (which is every current call site) - passing the bare PrismaService is
 * supported for callers that are not otherwise transactional.
 */
export async function endActiveMembership(
  db: Db,
  coderId: string,
  endedById: string | null,
  endReason: 'RELIEVED' | 'REASSIGNED',
): Promise<void> {
  await db.teamMembership.updateMany({
    where: { coderId, isActive: true },
    data: { isActive: false, endedAt: new Date(), endedById, endReason },
  });
}

export async function openMembership(
  db: Db,
  coderId: string,
  teamId: string,
  assignedById: string | null,
): Promise<void> {
  await db.teamMembership.create({
    data: { coderId, teamId, assignedById },
  });
}

/**
 * Moves a single Coder onto `teamId` (or off any team, when `teamId` is
 * null) - ends whatever active membership they currently have (if any)
 * and opens a new one, then updates User.teamId to match. Does NOT touch
 * User.vendorId or anything else - callers that also need to change the
 * vendor context do so separately, exactly as before this helper existed.
 */
export async function setCoderTeam(
  db: Db,
  caller: AuthUser,
  coderId: string,
  teamId: string | null,
  reason: 'RELIEVED' | 'REASSIGNED',
): Promise<void> {
  await endActiveMembership(db, coderId, caller.id, reason);
  if (teamId) await openMembership(db, coderId, teamId, caller.id);
  await db.user.update({ where: { id: coderId }, data: { teamId } });
}

/**
 * Bulk cascade variant for VendorsService#assignTeamLead - every ACTIVE
 * Coder of a vendor is moved onto the vendor's (possibly newly assigned)
 * Team Lead's Team in one pass. Ends each affected Coder's current active
 * membership (REASSIGNED - this is a Manager-driven Team Lead change, not
 * a relief) and opens a fresh one on the new team. `coderIds` is the
 * caller-supplied list of ACTIVE Coders already scoped to this vendor
 * (see VendorsService#assignTeamLead's own `updateMany` query) - this
 * helper does not re-derive that scope itself.
 */
export async function cascadeCodersToTeam(
  db: Db,
  caller: AuthUser,
  coderIds: string[],
  teamId: string,
): Promise<void> {
  if (coderIds.length === 0) return;
  await db.teamMembership.updateMany({
    where: { coderId: { in: coderIds }, isActive: true },
    data: { isActive: false, endedAt: new Date(), endedById: caller.id, endReason: 'REASSIGNED' },
  });
  await db.teamMembership.createMany({
    data: coderIds.map((coderId) => ({ coderId, teamId, assignedById: caller.id })),
  });
}

/** Bulk "detach" variant for VendorsService#unassignTeamLead - ends every affected Coder's active membership with no replacement (teamId -> null is applied by the caller). */
export async function cascadeCodersOffTeam(db: Db, caller: AuthUser, coderIds: string[]): Promise<void> {
  if (coderIds.length === 0) return;
  await db.teamMembership.updateMany({
    where: { coderId: { in: coderIds }, isActive: true },
    data: { isActive: false, endedAt: new Date(), endedById: caller.id, endReason: 'REASSIGNED' },
  });
}
