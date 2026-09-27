import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@smartcode/types';

/** Structural type so both PrismaService and a transaction client can be passed. */
export interface AuditLogWriter {
  auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown> };
}

/**
 * Appends a compliance AuditLog row - the same table and shape the
 * existing Users/Teams/Auth services write. Callers must never pass
 * passwords or hashes in before/after.
 */
export function writeAuditLog(
  db: AuditLogWriter,
  caller: Pick<AuthUser, 'id' | 'role'>,
  action: string,
  entity: string,
  entityId: string | null,
  payload: { before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue } = {},
) {
  return db.auditLog.create({
    data: {
      userId: caller.id,
      role: caller.role,
      action,
      entity,
      entityId: entityId ?? undefined,
      before: payload.before,
      after: payload.after,
    },
  });
}
