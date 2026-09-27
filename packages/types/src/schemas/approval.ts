/**
 * Universal Approval Engine (docs/09-BUSINESS-RULES.md section 9) - a
 * request that must be approved or rejected by a Manager before it takes
 * effect. Deliberately generic (type + payload) so future "request now,
 * approve later" workflows reuse this one shape rather than a new one.
 */
export const APPROVAL_TYPES = ['LOGIN_NAME_CHANGE'] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface LoginNameChangePayload {
  currentLoginName: string;
  requestedLoginName: string;
}

export interface ApprovalPerson {
  id: string;
  fullName: string | null;
  employeeId: string;
  loginName: string;
}

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  targetUser: ApprovalPerson;
  requestedBy: ApprovalPerson;
  requestedAt: string;
  payload: LoginNameChangePayload;
  reviewedBy: ApprovalPerson | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface ApprovalListResponse {
  data: ApprovalRequest[];
  total: number;
  page: number;
  pageSize: number;
}
