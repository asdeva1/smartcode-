import { Injectable, BadRequestException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { PrismaService } from '../../prisma/prisma.service';
import { vendorTeamWhere } from '../../common/vendor-scope';
import { CreateTeamDto } from './dto/create-team.dto';

/**
 * Phase 1 scope: create a Team and list teams. Full team management
 * (member assignment, TL reassignment) is a Phase 5 concern per
 * docs/10-IMPLEMENTATION-ROADMAP.md - this module exists now only so
 * TEAM_LEAD.teamId has somewhere valid to point to during RBAC testing.
 */
@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(caller: AuthUser, dto: CreateTeamDto) {
    if (dto.teamLeadId) {
      const lead = await this.prisma.user.findUnique({ where: { id: dto.teamLeadId } });
      if (!lead || lead.role !== 'TEAM_LEAD') {
        throw new BadRequestException('teamLeadId must reference an existing Team Lead');
      }
    }

    const team = await this.prisma.team.create({
      data: { name: dto.name, teamLeadId: dto.teamLeadId },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: caller.id,
        role: caller.role,
        action: 'TEAM_CREATED',
        entity: 'Team',
        entityId: team.id,
        after: { name: team.name, teamLeadId: team.teamLeadId },
      },
    });

    return team;
  }

  /** All teams, optionally only one vendor's (teams whose Team Lead is actively assigned to it). */
  async findAll(vendorId?: string) {
    return this.prisma.team.findMany({
      ...(vendorId ? { where: vendorTeamWhere(vendorId) } : {}),
      include: { teamLead: { select: { id: true, employeeId: true, loginName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
