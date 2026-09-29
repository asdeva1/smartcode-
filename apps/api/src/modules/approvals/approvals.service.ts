import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser, LoginNameChangePayload } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { PERSON_SELECT, personRef } from '../../common/scope';
import { writeAuditLog } from '../../common/audit-log';
import { UsersService } from '../users/users.service';
import { RequestLoginNameChangeDto, ListApprovalsDto } from './dto/approval.dto';

const APPROVAL_INCLUDE = {
  targetUser: { select: PERSON_SELECT },
  requestedBy: { select: PERSON_SELECT },
  reviewedBy: { select: PERSON_SELECT },
} as const;

function toDto(row: {
  id: string;
  type: string;
  status: string;
  requestedAt: Date;
  payload: unknown;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  targetUser: { id: string; fullName: string | null; employeeId: string; loginName: string };
  requestedBy: { id: string; fullName: string | null; employeeId: string; loginName: string };
  reviewedBy: { id: string; fullName: string | null; employeeId: string; loginName: string } | null;
}) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    targetUser: personRef(row.targetUser),
    requestedBy: personRef(row.requestedBy),
    requestedAt: row.requestedAt,
    payload: row.payload,
    reviewedBy: row.reviewedBy ? personRef(row.reviewedBy) : null,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason,
  };
}

/**
 * Universal Approval Engine (docs/09-BUSINESS-RULES.md section 9). Deliberately
 * generic - `type` + a free-form `payload` - so LOGIN_NAME_CHANGE is the first
 * workflow through it, not the only one it can ever support. A Team Lead
 * REQUESTs a change for their own-team Coder; only a Manager can Approve
 * (which applies the change) or Reject it. The Team Lead who filed the
 * request can never review it themselves - route-level RBAC (@Roles('MANAGER'))
 * already blocks that, and this service re-checks it independently so the
 * rule holds even if a route were ever misconfigured.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** Team Lead requests a Login Name change for one of their own-team Coders. */
  async requestLoginNameChange(caller: AuthUser, targetId: string, dto: RequestLoginNameChangeDto) {
    if (caller.role !== 'TEAM_LEAD') {
      throw new ForbiddenException('Only a Team Lead can request a Coder Login Name change');
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('Coder not found');
    if (target.role !== 'CODER' || caller.teamId === null || target.teamId !== caller.teamId) {
      throw new ForbiddenException('You can only request a Login Name change for a Coder on your own team');
    }

    const requestedLoginName = dto.loginName.trim();
    if (requestedLoginName === target.loginName) {
      throw new ConflictException('That is already this Coder\'s current Login Name');
    }

    const pending = await this.prisma.approvalRequest.findFirst({
      where: { targetUserId: targetId, type: 'LOGIN_NAME_CHANGE', status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictException('A Login Name change request for this Coder is already pending Manager approval');
    }

    const conflict = await this.prisma.user.findFirst({ where: { loginName: requestedLoginName, id: { not: targetId } } });
    if (conflict) throw new ConflictException('This Login Name is already taken');

    const payload: LoginNameChangePayload = { currentLoginName: target.loginName, requestedLoginName };
    // LoginNameChangePayload is a plain TS interface, not a Prisma JsonObject
    // (no index signature), so it is not structurally assignable to
    // Prisma's InputJsonValue without a cast - the same
    // interface-to-Prisma-Json cast style common/audit-log.ts's own
    // `Prisma.InputJsonValue` parameter type already relies on callers
    // using. The runtime value is unchanged - still the same plain object.
    const jsonPayload = payload as unknown as Prisma.InputJsonValue;
    const created = await this.prisma.approvalRequest.create({
      data: {
        type: 'LOGIN_NAME_CHANGE',
        status: 'PENDING',
        targetUserId: targetId,
        requestedById: caller.id,
        payload: jsonPayload,
      },
      include: APPROVAL_INCLUDE,
    });

    await writeAuditLog(this.prisma, caller, 'LOGIN_NAME_CHANGE_REQUESTED', 'ApprovalRequest', created.id, {
      after: jsonPayload,
    });

    return toDto(created);
  }

  /** Manager-only: the queue of requests awaiting a decision (defaults to pending, any type). */
  async list(caller: AuthUser, query: ListApprovalsDto) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can view approval requests');
    }
    const where: Record<string, unknown> = {};
    if (query.type) where.type = query.type;
    where.status = query.status && query.status !== 'all' ? query.status : 'PENDING';

    const [rows, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where,
        include: APPROVAL_INCLUDE,
        orderBy: [{ requestedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return { data: rows.map(toDto), total, page: query.page, pageSize: query.pageSize };
  }

  private async loadPending(caller: AuthUser, id: string) {
    if (caller.role !== 'MANAGER') {
      throw new ForbiddenException('Only a Manager can approve or reject requests');
    }
    const request = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Approval request not found');
    if (request.status !== 'PENDING') {
      throw new ConflictException(`This request has already been ${request.status.toLowerCase()}`);
    }
    // Defense in depth: a Team Lead can never review a request even one of
    // their own filed - RolesGuard already restricts this route to MANAGER,
    // and TEAM_LEAD is never MANAGER, so this can only trip if a route were
    // ever misconfigured to allow it.
    if (request.requestedById === caller.id) {
      throw new ForbiddenException('You cannot approve or reject your own request');
    }
    return request;
  }

  /**
   * Manager approves: applies the change, then marks the request
   * APPROVED - all in ONE transaction (docs/09-BUSINESS-RULES.md section
   * 10 / Phase 9), so a LOGIN_NAME_CHANGE approval can never leave
   * User.loginName changed while the ApprovalRequest is still PENDING, or
   * vice versa. If the change itself fails (e.g. a conflicting Login
   * Name), the whole approval rolls back and the request stays PENDING.
   */
  async approve(caller: AuthUser, id: string) {
    const request = await this.loadPending(caller, id);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (request.type === 'LOGIN_NAME_CHANGE') {
        const payload = request.payload as unknown as LoginNameChangePayload;
        await this.users.changeLoginName(caller, request.targetUserId, payload.requestedLoginName, {
          tx,
          reason: `Approved Login Name change request ${id}`,
        });
      }

      const row = await tx.approvalRequest.update({
        where: { id },
        data: { status: 'APPROVED', reviewedById: caller.id, reviewedAt: new Date() },
        include: APPROVAL_INCLUDE,
      });
      await writeAuditLog(tx, caller, 'APPROVAL_APPROVED', 'ApprovalRequest', id, {
        after: { type: request.type },
      });
      return row;
    });

    return toDto(updated);
  }

  /** Manager rejects: the request is closed out and the change never applies. */
  async reject(caller: AuthUser, id: string, reason: string) {
    const request = await this.loadPending(caller, id);

    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: caller.id, reviewedAt: new Date(), rejectionReason: reason },
      include: APPROVAL_INCLUDE,
    });
    await writeAuditLog(this.prisma, caller, 'APPROVAL_REJECTED', 'ApprovalRequest', id, {
      after: { type: request.type, reason },
    });
    return toDto(updated);
  }
}
