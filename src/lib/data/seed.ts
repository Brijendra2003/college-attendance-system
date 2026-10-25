import "server-only";
import { DEFAULT_ROLE_PERMISSIONS } from "@/shared/permissions";
import { statusColors } from "@/shared/tokens";
import {
  DEPARTMENT_FAMILY,
  DEPARTMENT_SEED,
  FAMILY_SUBJECTS,
  FE_SEM1,
  FIRST_NAMES_F,
  FIRST_NAMES_M,
  PERIODS,
  PROGRAM_YEAR_CODES,
  SUBJECT_OVERRIDES,
  SURNAMES,
} from "./catalogue";
import { digits, intBetween, mulberry32, pick, type Rng } from "./random";
import type {
  AcademicTerm,
  AcademicYear,
  Announcement,
  AttendancePolicy,
  AttendanceStatusCode,
  AuditEntry,
  Batch,
  CalendarEvent,
  College,
  CorrectionRequest,
  Department,
  DepartmentStaff,
  Division,
  Exam,
  Guardian,
  GuardianLink,
  ImportJob,
  LeaveRequest,
  Profile,
  ProgramYearCode,
  RolePermissionMatrix,
  SessionOverride,
  Staff,
  StaffLeaveRequest,
  Student,
  StudentEnrollment,
  Subject,
  TeachingAssignment,
  TeachingGroup,
  TimetableSlot,
  TimetableVersion,
} from "./types";

export interface Store {
  college: College;
  profiles: Profile[];
  departments: Department[];
  academicYears: AcademicYear[];
  terms: AcademicTerm[];
  divisions: Division[];
  batches: Batch[];
  staff: Staff[];
  departmentStaff: DepartmentStaff[];
  students: Student[];
  enrollments: StudentEnrollment[];
  guardians: Guardian[];
  guardianLinks: GuardianLink[];
  subjects: Subject[];
  teachingGroups: TeachingGroup[];
  teachingAssignments: TeachingAssignment[];
  timetableVersions: TimetableVersion[];
  timetableSlots: TimetableSlot[];
  statusCodes: AttendanceStatusCode[];
  policy: AttendancePolicy;
  corrections: CorrectionRequest[];
  leaveRequests: LeaveRequest[];
  staffLeave: StaffLeaveRequest[];
  exams: Exam[];
  announcements: Announcement[];
  calendar: CalendarEvent[];
  audit: AuditEntry[];
  imports: ImportJob[];
  rolePermissions: RolePermissionMatrix;
  sessionOverrides: Map<string, SessionOverride>;
  /** student → base attendance propensity (0–1) used to synthesise tallies */
  propensity: Map<string, number>;
  /** `${studentId}|${teachingGroupId}` → attended adjustment from approved corrections */
  attendedAdjustments: Map<string, number>;
  /** import_rows: staged, validated rows per import job until commit */
  stagedImports: Map<string, StagedImportRow[]>;
  seq: number;
}

export interface StagedImportRow {
  line: number;
  raw: Record<string, string>;
  errors: string[];
  committed: boolean;
}

const ACTIVE_YEAR = "ay-2026";
const ACTIVE_TERM = "term-2026-odd";
const TERM_START = "2026-07-13";
const TERM_END = "2026-11-21";

const SEMESTER_FOR: Record<ProgramYearCode, 1 | 3 | 5 | 7> = { FE: 1, SE: 3, TE: 5, BE: 7 };
const ADMISSION_YEAR: Record<ProgramYearCode, number> = { FE: 2026, SE: 2025, TE: 2024, BE: 2023 };

export function createStore(): Store {
  const rng = mulberry32(20262027);
  const now = "2026-10-20T09:00:00.000Z";

  const college: College = {
    name: "St. John College of Engineering and Management",
    shortName: "SJCEM",
    address: "Palghar, Maharashtra",
    phone: "022 2774 1200",
    email: "office@sjcem.edu.in",
    university: "University of Mumbai",
    timezone: "Asia/Kolkata",
    principalName: "Dr. Shalini Deshmukh",
    setupCompletedAt: "2026-06-02T10:30:00.000Z",
  };

  const academicYears: AcademicYear[] = [
    { id: "ay-2025", label: "2025-26", startDate: "2025-07-01", endDate: "2026-06-30", status: "archived" },
    { id: ACTIVE_YEAR, label: "2026-27", startDate: "2026-07-01", endDate: "2027-06-30", status: "active" },
  ];
  const terms: AcademicTerm[] = [
    { id: "term-2025-odd", academicYearId: "ay-2025", parity: "odd", label: "Odd term 2025-26", startDate: "2025-07-14", endDate: "2025-11-22", status: "archived" },
    { id: "term-2025-even", academicYearId: "ay-2025", parity: "even", label: "Even term 2025-26", startDate: "2026-01-05", endDate: "2026-05-09", status: "archived" },
    { id: ACTIVE_TERM, academicYearId: ACTIVE_YEAR, parity: "odd", label: "Odd term 2026-27", startDate: TERM_START, endDate: TERM_END, status: "active" },
    { id: "term-2026-even", academicYearId: ACTIVE_YEAR, parity: "even", label: "Even term 2026-27", startDate: "2027-01-04", endDate: "2027-05-08", status: "planned" },
  ];

  const departments: Department[] = DEPARTMENT_SEED.map((d) => ({
    id: `dep-${d.code.toLowerCase()}`,
    code: d.code,
    name: d.name,
    isActive: true,
    established: d.established,
    intake: d.divisions * 60,
  }));

  // ── Staff ──────────────────────────────────────────────────────────────
  const staff: Staff[] = [];
  const departmentStaff: DepartmentStaff[] = [];
  const staffByDept = new Map<string, Staff[]>();
  let empSerial = 1001;
  for (const [i, d] of DEPARTMENT_SEED.entries()) {
    const dep = departments[i];
    const count = d.divisions * 9 + 4;
    const list: Staff[] = [];
    for (let k = 0; k < count; k++) {
      const female = rng() < 0.45;
      const first = pick(rng, female ? FIRST_NAMES_F : FIRST_NAMES_M);
      const last = pick(rng, SURNAMES);
      const designation: Staff["designation"] =
        k === 0 ? "Professor" : k < 3 ? "Associate Professor" : k === count - 1 ? "Lab Assistant" : "Assistant Professor";
      const title = designation === "Lab Assistant" ? "" : k < 3 || rng() < 0.3 ? "Dr. " : "Prof. ";
      const s: Staff = {
        id: `stf-${d.code.toLowerCase()}-${String(k + 1).padStart(2, "0")}`,
        employeeId: `SJ${empSerial++}`,
        name: `${title}${first} ${last}`,
        designation,
        departmentId: dep.id,
        email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@sjcem.edu.in`,
        phone: `9${digits(rng, 9)}`,
        status: rng() < 0.03 ? "on_leave" : "active",
        joinedOn: `${intBetween(rng, 1998, 2024)}-${String(intBetween(rng, 6, 8)).padStart(2, "0")}-01`,
      };
      list.push(s);
      staff.push(s);
      departmentStaff.push({
        id: `ds-${s.id}`,
        departmentId: dep.id,
        staffId: s.id,
        role: designation === "Lab Assistant" ? "lab_staff" : "faculty",
        validFrom: s.joinedOn,
        validTo: null,
      });
    }
    // HOD history: previous HOD until 2024-05-31, current from 2024-06-01
    departmentStaff.push({ id: `ds-hod-${dep.id}-1`, departmentId: dep.id, staffId: list[1].id, role: "hod", validFrom: "2020-06-01", validTo: "2024-05-31" });
    departmentStaff.push({ id: `ds-hod-${dep.id}-2`, departmentId: dep.id, staffId: list[0].id, role: "hod", validFrom: "2024-06-01", validTo: null });
    staffByDept.set(dep.id, list);
  }

  // ── Subjects ───────────────────────────────────────────────────────────
  const subjects: Subject[] = [];
  const subjectsFor = new Map<string, Subject[]>(); // `${deptId}|${sem}`
  const feSubjects: Subject[] = FE_SEM1.map((name, j) => ({
    id: `sub-fe1-${j}`,
    code: `FEC10${j + 1}`,
    name,
    departmentId: null,
    semester: 1,
    credits: j < 3 ? 4 : 3,
    components: j < 3 ? [{ kind: "TH", weeklyHours: 3 }, { kind: "PR", weeklyHours: 2 }] : [{ kind: "TH", weeklyHours: 3 }],
    isElective: false,
  }));
  subjects.push(...feSubjects);
  for (const dep of departments) {
    subjectsFor.set(`${dep.id}|1`, feSubjects);
    for (const sem of [3, 5, 7] as const) {
      const names = SUBJECT_OVERRIDES[dep.code]?.[sem] ?? FAMILY_SUBJECTS[DEPARTMENT_FAMILY[dep.code]][sem];
      const list: Subject[] = names.map((name, j) => ({
        id: `sub-${dep.code.toLowerCase()}-${sem}-${j}`,
        code: `${dep.code}${sem}0${j + 1}`,
        name,
        departmentId: dep.id,
        semester: sem,
        credits: j < 3 ? 4 : 3,
        components: j < 3 ? [{ kind: "TH", weeklyHours: 3 }, { kind: "PR", weeklyHours: 2 }] : [{ kind: "TH", weeklyHours: 3 }],
        isElective: /^(DLOC|ILOC)/.test(name),
      }));
      subjects.push(...list);
      subjectsFor.set(`${dep.id}|${sem}`, list);
    }
  }

  // ── Divisions, batches, teaching groups, timetable ─────────────────────
  const divisions: Division[] = [];
  const batches: Batch[] = [];
  const teachingGroups: TeachingGroup[] = [];
  const teachingAssignments: TeachingAssignment[] = [];
  const timetableVersions: TimetableVersion[] = [];
  const timetableSlots: TimetableSlot[] = [];
  const lectures = PERIODS.filter((p) => p.kind === "lecture");
  const practical = PERIODS.find((p) => p.kind === "practical")!;

  for (const [di, d] of DEPARTMENT_SEED.entries()) {
    const dep = departments[di];
    const pool = staffByDept.get(dep.id)!.filter((s) => s.designation !== "Lab Assistant");
    const load = new Map<string, number>(pool.map((s) => [s.id, s.id === pool[0].id ? 6 : 0])); // HOD teaches less
    const busy = new Map<string, Set<string>>(pool.map((s) => [s.id, new Set()]));
    const pickStaff = (times: string[]) => {
      const ordered = [...pool].sort((a, b) => load.get(a.id)! - load.get(b.id)!);
      const free = ordered.find((s) => times.every((t) => !busy.get(s.id)!.has(t))) ?? ordered[0];
      times.forEach((t) => busy.get(free.id)!.add(t));
      load.set(free.id, load.get(free.id)! + times.length);
      return free;
    };

    let divIndexInDept = 0;
    for (const [pyi, py] of PROGRAM_YEAR_CODES.entries()) {
      const sem = SEMESTER_FOR[py];
      const subs = subjectsFor.get(`${dep.id}|${sem}`)!;
      const version: TimetableVersion = {
        id: `ttv-${dep.code.toLowerCase()}-${py.toLowerCase()}`,
        termId: ACTIVE_TERM,
        departmentId: dep.id,
        programYear: py,
        status: "published",
        effectiveFrom: TERM_START,
        publishedBy: "usr-ops",
        publishedAt: "2026-07-08T11:00:00.000Z",
        revision: py === "SE" ? 2 : 1,
      };
      timetableVersions.push(version);
      if ((dep.code === "CHEM" && py === "BE") || (dep.code === "IT" && py === "TE")) {
        // A draft revision in progress; it starts as a copy of the published slots.
        timetableVersions.push({
          ...version,
          id: `${version.id}-r${version.revision + 1}`,
          status: "draft",
          effectiveFrom: "2026-10-26",
          publishedAt: null,
          publishedBy: null,
          revision: version.revision + 1,
        });
      }

      for (let v = 0; v < d.divisions; v++) {
        const code = String.fromCharCode(65 + v);
        const div: Division = {
          id: `div-${dep.code.toLowerCase()}-${py.toLowerCase()}-${code.toLowerCase()}`,
          academicYearId: ACTIVE_YEAR,
          departmentId: dep.id,
          programYear: py,
          code,
          capacity: 60,
          classTeacherId: null,
          room: `${String.fromCharCode(65 + (di % 4))}-${pyi + 1}0${v + 1 + (di % 3) * 3}`,
        };
        divisions.push(div);
        const divBatches: Batch[] = [1, 2, 3].map((n) => ({ id: `${div.id}-b${n}`, divisionId: div.id, code: String(n) }));
        batches.push(...divBatches);

        const offset = Math.floor(rng() * 5);
        // Theory: 3 lectures a day over 5 days → each subject exactly 3 times, never twice a day.
        const thTimes = new Map<number, { weekday: number; start: number; end: number }[]>();
        for (let day = 0; day < 5; day++) {
          const freePeriod = (day + offset) % 4;
          const used = lectures.filter((_, i) => i !== freePeriod);
          used.forEach((p, k) => {
            const subj = (day * 3 + k + offset) % 5;
            if (!thTimes.has(subj)) thTimes.set(subj, []);
            thTimes.get(subj)!.push({ weekday: day + 1, start: p.start, end: p.end });
          });
        }
        subs.forEach((subject, j) => {
          const group: TeachingGroup = { id: `tg-${div.id}-${j}-TH`, subjectId: subject.id, component: "TH", kind: "division", divisionId: div.id, batchId: null };
          teachingGroups.push(group);
          const times = thTimes.get(j) ?? [];
          const prof = pickStaff(times.map((t) => `${t.weekday}-${t.start}`));
          teachingAssignments.push({ id: `ta-${group.id}`, teachingGroupId: group.id, staffId: prof.id, role: "primary", validFrom: TERM_START, validTo: null });
          for (const t of times) {
            timetableSlots.push({
              id: `sl-${div.id}-${t.weekday}-${t.start}`,
              versionId: version.id,
              divisionId: div.id,
              weekday: t.weekday,
              start: t.start,
              end: t.end,
              teachingGroupId: group.id,
              subjectId: subject.id,
              component: "TH",
              batchId: null,
              room: div.room,
              staffId: prof.id,
              sessionType: "theory",
            });
          }
        });
        // Practicals: three 14:00–16:00 lab blocks a week, spread across days per
        // division. In each block the three batches run the three labs in parallel,
        // so every batch does every lab once a week.
        const labSubjects = subs.filter((s) => s.components.some((c) => c.kind === "PR"));
        const blockDays = [0, 2, 4].map((k) => (k + divIndexInDept) % 5);
        divBatches.forEach((batch, b) => {
          labSubjects.forEach((subject, l) => {
            const group: TeachingGroup = { id: `tg-${batch.id}-${l}-PR`, subjectId: subject.id, component: "PR", kind: "batch", divisionId: div.id, batchId: batch.id };
            teachingGroups.push(group);
            const days = blockDays.filter((_, j) => (j + b) % 3 === l);
            const prof = pickStaff(days.map((day) => `${day + 1}-${practical.start}`));
            teachingAssignments.push({ id: `ta-${group.id}`, teachingGroupId: group.id, staffId: prof.id, role: "primary", validFrom: TERM_START, validTo: null });
            for (const day of days) {
              timetableSlots.push({
                id: `sl-${div.id}-${day + 1}-${practical.start}-b${batch.code}`,
                versionId: version.id,
                divisionId: div.id,
                weekday: day + 1,
                start: practical.start,
                end: practical.end,
                teachingGroupId: group.id,
                subjectId: subject.id,
                component: "PR",
                batchId: batch.id,
                room: `${dep.code} Lab ${((divIndexInDept * 3 + b) % 6) + 1}`,
                staffId: prof.id,
                sessionType: "practical",
              });
            }
          });
        });
        divIndexInDept++;
      }
    }
    // Class teachers: one faculty member per division, least loaded first.
    const deptDivs = divisions.filter((x) => x.departmentId === dep.id);
    const teachers = [...pool].slice(1).sort((a, b) => load.get(a.id)! - load.get(b.id)!);
    deptDivs.forEach((x, i) => (x.classTeacherId = teachers[i % teachers.length].id));
  }

  // Last year's divisions are separate rows (per-year structure, §7.5); renaming
  // this year's "Div B" never touches them.
  const previousDivisionId = new Map<string, string>();
  for (const div of [...divisions]) {
    if (div.programYear === "FE") continue;
    const prevPy = PROGRAM_YEAR_CODES[PROGRAM_YEAR_CODES.indexOf(div.programYear) - 1];
    const prev: Division = {
      ...div,
      id: div.id.replace("div-", "div25-").replace(`-${div.programYear.toLowerCase()}-`, `-${prevPy.toLowerCase()}-`),
      academicYearId: "ay-2025",
      programYear: prevPy,
    };
    divisions.push(prev);
    batches.push(...[1, 2, 3].map((n) => ({ id: `${prev.id}-b${n}`, divisionId: prev.id, code: String(n) })));
    previousDivisionId.set(div.id, prev.id);
  }

  // ── Students, enrollments, guardians ───────────────────────────────────
  const students: Student[] = [];
  const enrollments: StudentEnrollment[] = [];
  const guardians: Guardian[] = [];
  const guardianLinks: GuardianLink[] = [];
  const propensity = new Map<string, number>();
  let stuSerial = 1;
  const enrollSerial = new Map<string, number>();
  for (const div of divisions.filter((x) => x.academicYearId === ACTIVE_YEAR)) {
    const dep = departments.find((x) => x.id === div.departmentId)!;
    const size = intBetween(rng, 52, 60);
    const roster: { name: string; gender: "M" | "F"; last: string }[] = [];
    for (let i = 0; i < size; i++) {
      const gender = rng() < 0.42 ? "F" : "M";
      const first = pick(rng, gender === "F" ? FIRST_NAMES_F : FIRST_NAMES_M);
      const last = pick(rng, SURNAMES);
      roster.push({ name: `${first} ${last}`, gender, last });
    }
    roster.sort((a, b) => a.last.localeCompare(b.last) || a.name.localeCompare(b.name));
    const batchSize = Math.ceil(size / 3);
    roster.forEach((r, i) => {
      const id = `stu-${stuSerial++}`;
      const dse = div.programYear !== "FE" && rng() < 0.1;
      const admissionYear = ADMISSION_YEAR[div.programYear] + (dse ? 1 : 0);
      const key = `${admissionYear}${dep.code}`;
      const serial = (enrollSerial.get(key) ?? 0) + 1;
      enrollSerial.set(key, serial);
      const statusRoll = rng();
      const s: Student = {
        id,
        enrollmentNo: `${String(admissionYear).slice(2)}${dep.code}${String(serial).padStart(4, "0")}`,
        prn: div.programYear === "FE" && rng() < 0.6 ? null : `${admissionYear}0160${digits(rng, 8)}`,
        name: r.name,
        gender: r.gender,
        dob: `${2008 - (ADMISSION_YEAR.FE - ADMISSION_YEAR[div.programYear])}-${String(intBetween(rng, 1, 12)).padStart(2, "0")}-${String(intBetween(rng, 1, 28)).padStart(2, "0")}`,
        email: `${r.name.toLowerCase().replace(/[^a-z ]/g, "").replace(" ", ".")}${serial}@student.sjcem.edu.in`,
        phone: `${pick(rng, ["7", "8", "9"])}${digits(rng, 9)}`,
        admissionYear,
        admissionType: dse ? "direct_second_year" : "fe_regular",
        departmentId: dep.id,
        status: statusRoll < 0.01 ? "withdrawn" : statusRoll < 0.02 ? "detained" : "active",
        createdAt: `${admissionYear}-08-01T10:00:00.000Z`,
      };
      students.push(s);
      const batchIdx = Math.min(2, Math.floor(i / batchSize));
      enrollments.push({
        id: `enr-${id}-${ACTIVE_TERM}`,
        studentId: id,
        academicYearId: ACTIVE_YEAR,
        termId: ACTIVE_TERM,
        departmentId: dep.id,
        programYear: div.programYear,
        semester: SEMESTER_FOR[div.programYear],
        divisionId: div.id,
        batchId: `${div.id}-b${batchIdx + 1}`,
        rollNo: i + 1,
        enrollmentType: dse ? "dse" : rng() < 0.04 ? "atkt" : "regular",
        isPrimary: true,
        validFrom: TERM_START,
        validTo: null,
        reason: null,
      });
      if (div.programYear !== "FE") {
        // Previous term's enrollment, closed: progression adds rows, never duplicates the student.
        enrollments.push({
          id: `enr-${id}-term-2025-even`,
          studentId: id,
          academicYearId: "ay-2025",
          termId: "term-2025-even",
          departmentId: dep.id,
          programYear: PROGRAM_YEAR_CODES[PROGRAM_YEAR_CODES.indexOf(div.programYear) - 1],
          semester: SEMESTER_FOR[div.programYear] - 1,
          divisionId: previousDivisionId.get(div.id)!,
          batchId: `${previousDivisionId.get(div.id)}-b${batchIdx + 1}`,
          rollNo: i + 1,
          enrollmentType: dse ? "dse" : "regular",
          isPrimary: true,
          validFrom: "2026-01-05",
          validTo: "2026-05-09",
          reason: "Promoted at year-end",
        });
      }
      const u = rng();
      propensity.set(id, Math.max(0.35, 0.995 - 0.38 * u ** 4 - (s.status === "detained" ? 0.3 : 0)));

      const relation = rng() < 0.7 ? "Father" : "Mother";
      const gFirst = pick(rng, relation === "Father" ? FIRST_NAMES_M : FIRST_NAMES_F);
      const g: Guardian = {
        id: `gdn-${id}`,
        name: `${gFirst} ${r.last}`,
        relation,
        phone: `9${digits(rng, 9)}`,
        email: rng() < 0.6 ? `${gFirst.toLowerCase()}.${r.last.toLowerCase().replace(/[^a-z]/g, "")}@gmail.com` : null,
        activated: false,
      };
      const vr = rng();
      const status: GuardianLink["status"] = vr < 0.07 ? "pending" : vr < 0.08 ? "revoked" : "verified";
      g.activated = status === "verified" && rng() < 0.8;
      guardians.push(g);
      guardianLinks.push({
        id: `gl-${id}-1`,
        studentId: id,
        guardianId: g.id,
        status,
        isPrimary: true,
        verifiedBy: status === "verified" ? "usr-ops" : null,
        verifiedAt: status === "verified" ? `${admissionYear}-08-12T10:00:00.000Z` : null,
      });
    });
  }

  // ── Policy, status codes, permissions ──────────────────────────────────
  const statusCodes: AttendanceStatusCode[] = [
    { code: "P", label: "Present", color: statusColors.P, countsAsAttended: true, countsInHeld: true, professorCanSet: true, requiresReason: false },
    { code: "A", label: "Absent", color: statusColors.A, countsAsAttended: false, countsInHeld: true, professorCanSet: true, requiresReason: false },
    { code: "L", label: "Approved leave", color: statusColors.L, countsAsAttended: false, countsInHeld: true, professorCanSet: false, requiresReason: false },
    { code: "OD", label: "On duty", color: statusColors.OD, countsAsAttended: true, countsInHeld: true, professorCanSet: true, requiresReason: true },
    { code: "ML", label: "Medical leave", color: statusColors.ML, countsAsAttended: false, countsInHeld: true, professorCanSet: false, requiresReason: true },
    { code: "EX", label: "Excused", color: statusColors.EX, countsAsAttended: false, countsInHeld: false, professorCanSet: false, requiresReason: true },
  ];
  const policy: AttendancePolicy = {
    minPercent: 75,
    warnPercent: 80,
    countMode: "session",
    eligibilityBasis: "per_subject_component",
    editWindowHours: 24,
    lockAfterHours: 48,
    defaultUnmarkedStatus: "A",
    leaveAppliesRetroactively: true,
    effectiveFrom: TERM_START,
  };

  // ── Profiles (web sign-in accounts) ────────────────────────────────────
  const profiles: Profile[] = [
    { id: "usr-principal", name: "Dr. Shalini Deshmukh", email: "principal@sjcem.edu.in", roles: ["principal"], staffId: null, isActive: true },
    { id: "usr-admin", name: "Rohan Kulkarni", email: "admin@sjcem.edu.in", roles: ["admin"], staffId: null, isActive: true },
    { id: "usr-ops", name: "Neha Patil", email: "operations@sjcem.edu.in", roles: ["operations"], staffId: null, isActive: true },
    { id: "usr-exam", name: "Prakash Joshi", email: "examcell@sjcem.edu.in", roles: ["exam_cell"], staffId: null, isActive: true },
  ];
  for (const ds of departmentStaff.filter((x) => x.role === "hod" && x.validTo === null)) {
    const s = staff.find((x) => x.id === ds.staffId)!;
    profiles.push({ id: `usr-${s.id}`, name: s.name, email: s.email, roles: ["hod", "professor"], staffId: s.id, isActive: true });
  }

  // ── Calendar ───────────────────────────────────────────────────────────
  const calendar: CalendarEvent[] = [
    { id: "cal-1", date: "2026-08-15", title: "Independence Day", kind: "holiday" },
    { id: "cal-2", date: "2026-08-24", endDate: "2026-08-26", title: "IAET-1 (Internal Assessment)", kind: "exam" },
    { id: "cal-3", date: "2026-09-14", title: "Ganesh Chaturthi", kind: "holiday" },
    { id: "cal-4", date: "2026-10-02", title: "Gandhi Jayanti", kind: "holiday" },
    { id: "cal-5", date: "2026-10-12", endDate: "2026-10-14", title: "IAET-2 (Internal Assessment)", kind: "exam" },
    { id: "cal-6", date: "2026-10-20", title: "Dussehra", kind: "holiday" },
    { id: "cal-7", date: "2026-11-02", endDate: "2026-11-06", title: "Practical & Oral examinations", kind: "exam" },
    { id: "cal-8", date: "2026-11-07", endDate: "2026-11-11", title: "Diwali vacation", kind: "holiday" },
    { id: "cal-9", date: "2026-09-26", title: "Annual tech fest", kind: "event" },
    { id: "cal-10", date: "2026-11-23", endDate: "2026-12-15", title: "End-semester examinations (University)", kind: "exam" },
  ];

  const store: Store = {
    college,
    profiles,
    departments,
    academicYears,
    terms,
    divisions,
    batches,
    staff,
    departmentStaff,
    students,
    enrollments,
    guardians,
    guardianLinks,
    subjects,
    teachingGroups,
    teachingAssignments,
    timetableVersions,
    timetableSlots,
    statusCodes,
    policy,
    corrections: [],
    leaveRequests: [],
    staffLeave: [],
    exams: [],
    announcements: [],
    calendar,
    audit: [],
    imports: [],
    rolePermissions: structuredClone(DEFAULT_ROLE_PERMISSIONS),
    sessionOverrides: new Map(),
    propensity,
    attendedAdjustments: new Map(),
    stagedImports: new Map(),
    seq: 1,
  };

  seedWorkflows(store, rng, now);
  return store;
}

function seedWorkflows(store: Store, rng: Rng, now: string) {
  const active = store.students.filter((s) => s.status === "active");
  const enrollmentOf = (studentId: string) => store.enrollments.find((e) => e.studentId === studentId && e.validTo === null)!;

  const reasons = [
    "Fever and doctor's advice to rest",
    "Family function out of town",
    "Representing the college at inter-collegiate sports meet",
    "Sister's wedding",
    "Viral infection, medical certificate attached",
    "Attending a hackathon at IIT Bombay",
    "Hospitalised — dengue",
    "Grandparent's funeral",
  ];
  const leaveStatuses: LeaveRequest["status"][] = [
    ...Array(12).fill("pending"),
    ...Array(3).fill("needs_info"),
    ...Array(20).fill("approved"),
    ...Array(5).fill("rejected"),
  ];
  leaveStatuses.forEach((status, i) => {
    const s = pick(rng, active);
    const start = `2026-10-${String(intBetween(rng, 5, 29)).padStart(2, "0")}`;
    const len = intBetween(rng, 0, 3);
    const end = `2026-10-${String(Math.min(30, Number(start.slice(8)) + len)).padStart(2, "0")}`;
    const reason = pick(rng, reasons);
    store.leaveRequests.push({
      id: `lv-${i + 1}`,
      studentId: s.id,
      type: /medical|Hospital|infection|Fever/.test(reason) ? "medical" : len === 0 ? (rng() < 0.5 ? "half_day" : "full_day") : "full_day",
      fromDate: start,
      toDate: end,
      reason,
      hasDocument: /certificate|Hospital/.test(reason) || rng() < 0.3,
      createdAt: `2026-10-${String(Math.max(1, Number(start.slice(8)) - 2)).padStart(2, "0")}T08:${String(intBetween(rng, 10, 59))}:00.000Z`,
      status,
      decidedBy: status === "approved" || status === "rejected" ? store.staff.find((x) => x.id === store.divisions.find((d) => d.id === enrollmentOf(s.id).divisionId)!.classTeacherId)!.id : null,
      decidedAt: status === "approved" || status === "rejected" ? now : null,
    });
  });

  const staffReasons = ["Medical appointment", "Paper presentation at IEEE conference", "Family emergency", "Faculty development programme", "University paper-setting duty"];
  for (let i = 0; i < 9; i++) {
    const s = pick(rng, store.staff.filter((x) => x.designation !== "Lab Assistant"));
    const day = intBetween(rng, 22, 31);
    const status: StaffLeaveRequest["status"] = i < 5 ? "pending" : i < 8 ? "approved" : "rejected";
    store.staffLeave.push({
      id: `slv-${i + 1}`,
      staffId: s.id,
      type: pick(rng, ["casual", "medical", "duty", "earned"] as const),
      fromDate: day > 30 ? "2026-11-02" : `2026-10-${day}`,
      toDate: day > 30 ? "2026-11-03" : `2026-10-${day}`,
      reason: pick(rng, staffReasons),
      createdAt: "2026-10-19T06:00:00.000Z",
      status,
      decidedBy: status === "pending" ? null : "usr-principal",
      decidedAt: status === "pending" ? null : now,
      substituteArranged: status === "approved",
    });
  }

  // Correction requests point at real past sessions.
  const pastDates = ["2026-10-15", "2026-10-16", "2026-10-19", "2026-10-21", "2026-10-22", "2026-10-23"];
  const corrReasons = [
    "Student was present; marked absent by mistake while scrolling the roster",
    "Student arrived 5 minutes late after lab viva in the previous slot",
    "On duty for NSS blood donation camp — OD letter attached",
    "Roll numbers 23 and 32 were swapped",
    "Student was attending the IEEE student branch event with permission",
  ];
  for (let i = 0; i < 14; i++) {
    const slot = pick(rng, store.timetableSlots.filter((x) => x.component === "TH"));
    const date = pastDates.find((d) => new Date(d).getUTCDay() === slot.weekday) ?? "2026-10-22";
    const e = pick(rng, store.enrollments.filter((x) => x.divisionId === slot.divisionId && x.validTo === null));
    const status: CorrectionRequest["status"] = i < 8 ? "pending" : i < 12 ? "approved" : "rejected";
    store.corrections.push({
      id: `cr-${i + 1}`,
      sessionId: `${date}~${slot.id}`,
      studentId: e.studentId,
      requestedBy: slot.staffId,
      fromStatus: "A",
      toStatus: /OD|NSS|IEEE/.test(corrReasons[i % 5]) ? "OD" : "P",
      reason: corrReasons[i % 5],
      createdAt: `${date}T12:${String(10 + i)}:00.000Z`,
      status,
      decidedBy: status === "pending" ? null : "usr-ops",
      decidedAt: status === "pending" ? null : now,
      note: status === "rejected" ? "Evidence insufficient — raise again with the OD letter" : null,
    });
  }

  store.exams.push(
    { id: "ex-1", type: "IAET-1", title: "Internal Assessment Test 1", termId: ACTIVE_TERM, startDate: "2026-08-24", endDate: "2026-08-26", status: "completed", semesters: [1, 3, 5, 7], sessions: 196, conflicts: 0, attendanceMarked: 196 },
    { id: "ex-2", type: "IAET-2", title: "Internal Assessment Test 2", termId: ACTIVE_TERM, startDate: "2026-10-12", endDate: "2026-10-14", status: "completed", semesters: [1, 3, 5, 7], sessions: 196, conflicts: 0, attendanceMarked: 189 },
    { id: "ex-3", type: "Practical", title: "Term-work practical & oral examinations", termId: ACTIVE_TERM, startDate: "2026-11-02", endDate: "2026-11-06", status: "published", semesters: [1, 3, 5, 7], sessions: 684, conflicts: 0, attendanceMarked: 0 },
    { id: "ex-4", type: "End-Sem", title: "University end-semester theory examinations", termId: ACTIVE_TERM, startDate: "2026-11-23", endDate: "2026-12-15", status: "draft", semesters: [1, 3, 5, 7], sessions: 228, conflicts: 3, attendanceMarked: 0 },
  );

  store.announcements.push(
    { id: "an-1", title: "Diwali vacation: 7–11 November", body: "The college will remain closed for Diwali from Saturday 7 November to Wednesday 11 November. Lectures resume on Thursday 12 November as per the regular timetable.", priority: "important", audience: "college", departmentId: null, channels: ["inapp", "push", "email"], createdBy: "usr-principal", createdAt: "2026-10-21T05:30:00.000Z", publishAt: "2026-10-21T05:30:00.000Z", recipients: 12140, readCount: 8932 },
    { id: "an-2", title: "Practical & oral exam schedule published", body: "The term-work practical and oral examination schedule for 2–6 November is now available in the app. Check your batch and examiner allocation.", priority: "important", audience: "students", departmentId: null, channels: ["inapp", "push"], createdBy: "usr-exam", createdAt: "2026-10-19T09:00:00.000Z", publishAt: "2026-10-19T09:00:00.000Z", recipients: 4342, readCount: 3810 },
    { id: "an-3", title: "Shortage warning: attendance below 75%", body: "Students with attendance below 75% in any subject must meet their class teacher before 30 October. Parents have been informed.", priority: "urgent", audience: "parents", departmentId: null, channels: ["inapp", "push", "sms"], createdBy: "usr-ops", createdAt: "2026-10-19T03:30:00.000Z", publishAt: "2026-10-19T03:30:00.000Z", recipients: 1260, readCount: 904 },
    { id: "an-4", title: "Faculty meeting — submission discipline", body: "All faculty are requested to submit attendance within the period. Registers still pending 30 minutes after the session will trigger reminders.", priority: "normal", audience: "staff", departmentId: null, channels: ["inapp", "email"], createdBy: "usr-principal", createdAt: "2026-10-14T07:00:00.000Z", publishAt: "2026-10-14T07:00:00.000Z", recipients: 166, readCount: 151 },
    { id: "an-5", title: "COMP: Industry visit to TCS Olympus, Thane", body: "TE COMP students will visit TCS Olympus on 28 October. Report at the college gate by 8:00 AM.", priority: "normal", audience: "department", departmentId: "dep-comp", channels: ["inapp", "push"], createdBy: "usr-stf-comp-01", createdAt: "2026-10-22T10:00:00.000Z", publishAt: "2026-10-22T10:00:00.000Z", recipients: 171, readCount: 140 },
  );

  store.imports.push(
    { id: "imp-1", kind: "students", fileName: "FE_2026_admissions_round3.xlsx", createdBy: "usr-ops", createdAt: "2026-08-05T06:40:00.000Z", status: "committed", totalRows: 1140, okRows: 1140, errorRows: 0 },
    { id: "imp-2", kind: "students", fileName: "DSE_2026_admissions.xlsx", createdBy: "usr-ops", createdAt: "2026-08-11T09:10:00.000Z", status: "committed", totalRows: 118, okRows: 116, errorRows: 2 },
    { id: "imp-3", kind: "timetable", fileName: "SE_odd_term_timetable_rev2.xlsx", createdBy: "usr-ops", createdAt: "2026-07-20T11:00:00.000Z", status: "committed", totalRows: 912, okRows: 912, errorRows: 0 },
    { id: "imp-4", kind: "staff", fileName: "staff_master_2026.xlsx", createdBy: "usr-admin", createdAt: "2026-06-25T04:30:00.000Z", status: "committed", totalRows: 166, okRows: 166, errorRows: 0 },
  );

  const audit: Omit<AuditEntry, "id">[] = [
    { at: "2026-10-23T12:40:00.000Z", actorId: "usr-ops", actorName: "Neha Patil", action: "attendance.correction.approved", entity: "attendance_records", entityId: "cr-9", summary: "Approved correction A → P for a SE COMP student", before: { status: "A" }, after: { status: "P" }, reason: "Student was present; marked absent by mistake" },
    { at: "2026-10-22T08:15:00.000Z", actorId: "usr-stf-comp-01", actorName: store.profiles.find((p) => p.id === "usr-stf-comp-01")?.name ?? "HOD COMP", action: "session.cancelled", entity: "class_sessions", entityId: "—", summary: "Cancelled TE COMP-A Computer Network (P3) for industry talk", before: { status: "scheduled" }, after: { status: "cancelled" }, reason: "Industry expert talk in seminar hall" },
    { at: "2026-10-21T05:30:00.000Z", actorId: "usr-principal", actorName: "Dr. Shalini Deshmukh", action: "announcement.published", entity: "announcements", entityId: "an-1", summary: "Published “Diwali vacation: 7–11 November” to whole college", before: null, after: { recipients: 12140 }, reason: null },
    { at: "2026-10-18T10:05:00.000Z", actorId: "usr-admin", actorName: "Rohan Kulkarni", action: "policy.updated", entity: "attendance_policies", entityId: "college", summary: "Changed warning threshold from 78% to 80%", before: { warnPercent: 78 }, after: { warnPercent: 80 }, reason: "Academic council resolution AC/2026/14" },
    { at: "2026-10-16T09:20:00.000Z", actorId: "usr-ops", actorName: "Neha Patil", action: "student.transferred", entity: "student_enrollments", entityId: "stu-118", summary: "Moved a SE COMP student from Division A to Division B", before: { division: "A" }, after: { division: "B" }, reason: "Elective group balancing" },
    { at: "2026-10-12T04:00:00.000Z", actorId: "usr-admin", actorName: "Rohan Kulkarni", action: "role_permission.updated", entity: "role_permissions", entityId: "operations", summary: "Granted Operations attendance.reopen @ all", before: null, after: { scope: "all" }, reason: "Exam-week late marking" },
    { at: "2026-07-08T11:00:00.000Z", actorId: "usr-ops", actorName: "Neha Patil", action: "timetable.published", entity: "timetable_versions", entityId: "ttv-comp-se", summary: "Published SE COMP timetable (revision 2), 1,240 sessions generated", before: { status: "draft" }, after: { status: "published" }, reason: null },
    { at: "2026-06-02T10:30:00.000Z", actorId: "usr-admin", actorName: "Rohan Kulkarni", action: "blueprint.activated", entity: "blueprint_versions", entityId: "bp-3", summary: "Activated blueprint v3 — Mumbai University Engineering (12 branches)", before: { version: 2 }, after: { version: 3 }, reason: "Added CSE and DS divisions for 2026-27" },
  ];
  audit.forEach((a, i) => store.audit.push({ id: `au-seed-${i}`, ...a }));
}
