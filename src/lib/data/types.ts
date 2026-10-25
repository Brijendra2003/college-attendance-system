// Row shapes mirroring the table catalogue in webapp_Architecture.md §7.3.
// When Supabase is connected these are replaced by the generated
// `src/types/database.ts`; field names map 1:1 (camelCase ↔ snake_case).
import type { DepartmentCode } from "@/shared/tokens";
import type { Grants, Role } from "@/shared/permissions";

export type ProgramYearCode = "FE" | "SE" | "TE" | "BE";
export type ComponentKind = "TH" | "PR" | "TUT";

export interface College {
  name: string;
  shortName: string;
  address: string;
  phone: string;
  email: string;
  university: string;
  timezone: string;
  principalName: string;
  setupCompletedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  staffId: string | null;
  isActive: boolean;
}

export interface Department {
  id: string;
  code: DepartmentCode;
  name: string;
  isActive: boolean;
  established: number;
  intake: number;
}

export interface AcademicYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "archived";
}

export interface AcademicTerm {
  id: string;
  academicYearId: string;
  parity: "odd" | "even";
  label: string;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "archived";
}

export interface ProgramYear {
  code: ProgramYearCode;
  name: string;
  order: number;
  semesters: [number, number];
}

export interface Division {
  id: string;
  academicYearId: string;
  departmentId: string;
  programYear: ProgramYearCode;
  code: string;
  capacity: number;
  classTeacherId: string | null;
  room: string;
}

export interface Batch {
  id: string;
  divisionId: string;
  code: string;
}

export interface Staff {
  id: string;
  employeeId: string;
  name: string;
  designation: "Professor" | "Associate Professor" | "Assistant Professor" | "Lab Assistant";
  departmentId: string;
  email: string;
  phone: string;
  status: "active" | "on_leave" | "inactive";
  joinedOn: string;
}

export interface DepartmentStaff {
  id: string;
  departmentId: string;
  staffId: string;
  role: "hod" | "faculty" | "lab_staff";
  validFrom: string;
  validTo: string | null;
}

export interface Student {
  id: string;
  enrollmentNo: string;
  prn: string | null;
  name: string;
  gender: "M" | "F" | "O";
  dob: string;
  email: string;
  phone: string;
  admissionYear: number;
  admissionType: "fe_regular" | "direct_second_year";
  departmentId: string;
  status: "active" | "withdrawn" | "detained";
  createdAt: string;
}

export interface StudentEnrollment {
  id: string;
  studentId: string;
  academicYearId: string;
  termId: string;
  departmentId: string;
  programYear: ProgramYearCode;
  semester: number;
  divisionId: string;
  batchId: string;
  rollNo: number;
  enrollmentType: "regular" | "atkt" | "repeat" | "dse";
  isPrimary: boolean;
  validFrom: string;
  validTo: string | null;
  reason: string | null;
}

export interface Guardian {
  id: string;
  name: string;
  relation: "Father" | "Mother" | "Guardian";
  phone: string;
  email: string | null;
  activated: boolean;
}

export interface GuardianLink {
  id: string;
  studentId: string;
  guardianId: string;
  status: "pending" | "verified" | "revoked";
  isPrimary: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

export interface SubjectComponent {
  kind: ComponentKind;
  weeklyHours: number;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  /** null for FE subjects common to every branch */
  departmentId: string | null;
  semester: number;
  credits: number;
  components: SubjectComponent[];
  isElective: boolean;
}

export interface TeachingGroup {
  id: string;
  subjectId: string;
  component: ComponentKind;
  kind: "division" | "batch" | "custom";
  divisionId: string;
  batchId: string | null;
}

export interface TeachingAssignment {
  id: string;
  teachingGroupId: string;
  staffId: string;
  role: "primary" | "co" | "substitute";
  validFrom: string;
  validTo: string | null;
}

export interface Period {
  index: number;
  label: string;
  start: number;
  end: number;
  kind: "lecture" | "practical" | "break";
}

export interface TimetableVersion {
  id: string;
  termId: string;
  departmentId: string;
  programYear: ProgramYearCode;
  status: "draft" | "published" | "archived";
  effectiveFrom: string;
  publishedBy: string | null;
  publishedAt: string | null;
  revision: number;
}

export interface TimetableSlot {
  id: string;
  versionId: string;
  divisionId: string;
  weekday: number;
  start: number;
  end: number;
  teachingGroupId: string;
  subjectId: string;
  component: ComponentKind;
  batchId: string | null;
  room: string;
  staffId: string;
  sessionType: "theory" | "practical" | "tutorial";
}

export type SessionStatus = "scheduled" | "held" | "cancelled" | "rescheduled";
export type RegisterState = "upcoming" | "pending" | "submitted" | "locked" | "reopened" | "voided" | "missing";

export interface ClassSession {
  id: string;
  date: string;
  slot: TimetableSlot;
  status: SessionStatus;
  staffId: string;
  substituteId: string | null;
  cancelReason: string | null;
  register: {
    state: RegisterState;
    submittedAt: string | null;
    late: boolean;
    present: number;
    total: number;
  } | null;
}

export interface SessionOverride {
  cancelled?: { reason: string; by: string; at: string };
  substituteId?: string;
  reopened?: { reason: string; by: string; at: string };
  nudgedAt?: string;
}

export interface AttendanceStatusCode {
  code: string;
  label: string;
  color: string;
  countsAsAttended: boolean;
  countsInHeld: boolean;
  professorCanSet: boolean;
  requiresReason: boolean;
}

export interface AttendancePolicy {
  minPercent: number;
  warnPercent: number;
  countMode: "session" | "hours";
  eligibilityBasis: "per_subject_component" | "per_subject" | "aggregate";
  editWindowHours: number;
  lockAfterHours: number;
  defaultUnmarkedStatus: "A" | "P";
  leaveAppliesRetroactively: boolean;
  effectiveFrom: string;
}

export interface CorrectionRequest {
  id: string;
  sessionId: string;
  studentId: string;
  requestedBy: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
}

export interface LeaveRequest {
  id: string;
  studentId: string;
  type: "full_day" | "half_day" | "session" | "medical";
  fromDate: string;
  toDate: string;
  reason: string;
  hasDocument: boolean;
  createdAt: string;
  status: "pending" | "needs_info" | "approved" | "rejected" | "cancelled";
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface StaffLeaveRequest {
  id: string;
  staffId: string;
  type: "casual" | "medical" | "duty" | "earned";
  fromDate: string;
  toDate: string;
  reason: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  decidedBy: string | null;
  decidedAt: string | null;
  substituteArranged: boolean;
}

export interface Exam {
  id: string;
  type: "IAET-1" | "IAET-2" | "Practical" | "Oral" | "End-Sem";
  title: string;
  termId: string;
  startDate: string;
  endDate: string;
  status: "draft" | "published" | "completed";
  semesters: number[];
  sessions: number;
  conflicts: number;
  attendanceMarked: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: "normal" | "important" | "urgent";
  audience: "college" | "students" | "staff" | "parents" | "department";
  departmentId: string | null;
  channels: ("inapp" | "push" | "email" | "sms")[];
  createdBy: string;
  createdAt: string;
  publishAt: string;
  recipients: number;
  readCount: number;
}

export interface CalendarEvent {
  id: string;
  date: string;
  endDate?: string;
  title: string;
  kind: "holiday" | "exam" | "event" | "working_override";
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface ImportJob {
  id: string;
  kind: "students" | "staff" | "timetable";
  fileName: string;
  createdBy: string;
  createdAt: string;
  status: "validated" | "committed" | "failed";
  totalRows: number;
  okRows: number;
  errorRows: number;
}

export type RolePermissionMatrix = Record<Role, Grants>;
