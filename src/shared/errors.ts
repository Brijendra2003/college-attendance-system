// Stable error codes raised by RPCs (§8.3) → user-facing messages.
// Shared with the mobile app.

export const ERROR_MESSAGES = {
  AUTH_REQUIRED: "Your session has expired. Sign in again.",
  ACCOUNT_INACTIVE: "This account has been deactivated.",
  FORBIDDEN: "You don't have permission to do that.",
  OUT_OF_SCOPE: "That record is outside your department.",
  MFA_REQUIRED: "This change needs two-factor verification. Verify with your authenticator app and try again.",
  VALIDATION: "Some fields need attention.",
  NOT_FOUND: "That record no longer exists.",
  REASON_REQUIRED: "Give a reason of at least 5 characters.",
  DUPLICATE: "A record with the same identifier already exists.",
  DIVISION_EXISTS: "That division code already exists for this year, branch and program year.",
  NO_CHANGE: "Nothing changed.",
  BAD_EFFECTIVE_DATE: "The effective date must fall after the current assignment started and within the term.",
  NO_ACTIVE_TERM: "There is no active term. Finish setup or activate a year first.",
  NO_ACTIVE_YEAR: "There is no active academic year.",
  ALREADY_DECIDED: "This request has already been decided.",
  OWN_LEAVE: "Your own leave is approved by the Principal.",
  LOCKOUT: "Admin must keep the roles.manage permission, or nobody could edit roles.",
  ARCHIVED_YEAR: "That academic year is archived and read-only.",
  SETUP_DONE: "Setup has already been completed.",
  BLUEPRINT_INVALID: "The blueprint has errors. Fix them before activating.",
  NO_TARGET_DIVISION: "The next year has no matching division. Create next year's divisions first.",
  NOT_ODD_TERM: "Advancing the term only works from the odd term.",
  TT_NOT_DRAFT: "Only draft timetables can be published.",
  TT_CONFLICTS: "Resolve the hard conflicts before publishing.",
  SESSION_PAST: "Past sessions can't be cancelled.",
  ATT_LOCKED: "This register is locked. Raise a correction request instead.",
  ATT_NOT_ASSIGNED: "You are not assigned to this session.",
  ATT_CANCELLED: "This session was cancelled.",
  ATT_TOO_EARLY: "Attendance can be marked from 15 minutes before the session.",
  ATT_UNKNOWN_STUDENT: "A student in the submission is not on this session's roster.",
  ATT_INVALID_STATUS: "That status can't be set from the register.",
  ATT_NO_RECORD: "There is no attendance record to change.",
  ATT_NOT_REOPENABLE: "Only pending or locked registers can be reopened.",
  ATT_NOT_RESCHEDULABLE: "Only scheduled sessions can be rescheduled.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export class AppError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? messageFor(code));
  }
}

export function messageFor(code: string): string {
  return (ERROR_MESSAGES as Record<string, string>)[code] ?? "Something went wrong. Try again.";
}

export function isKnownError(code: string): boolean {
  return code in ERROR_MESSAGES;
}
