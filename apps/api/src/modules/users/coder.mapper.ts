/** Only the fields the Coder screens need - never passwordHash or login-security counters. */
export function toCoderDto(user: {
  id: string;
  employeeId: string;
  loginName: string;
  email: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: Date | null;
}) {
  return {
    id: user.id,
    employeeId: user.employeeId,
    loginName: user.loginName,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}
