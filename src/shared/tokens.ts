// Design tokens shared by web and mobile. The web maps these into Tailwind's
// @theme (src/app/globals.css); mobile maps them into NativeWind.

export const brand = {
  light: { navy: "#163a70", primary: "#1d4ed8", canvas: "#f4f7fb", surface: "#ffffff", line: "#dbe4f0", ink: "#0f1f3d", muted: "#5b6b85" },
  dark: { navy: "#1f4a8c", primary: "#7aa7ff", canvas: "#0b1220", surface: "#111a2b", line: "#26344d", ink: "#e6edf7", muted: "#9aa9c0" },
} as const;

export type DepartmentCode = string;

export interface DepartmentTone {
  /** strong colour: text, icons, chart series */
  fg: string;
  /** pastel card background */
  bg: string;
  /** card border */
  border: string;
  /** dark-theme counterparts */
  fgDark: string;
  bgDark: string;
  borderDark: string;
}

const tone = (fg: string, bg: string, border: string, fgDark: string, bgDark: string, borderDark: string): DepartmentTone => ({
  fg, bg, border, fgDark, bgDark, borderDark,
});

export const departmentTones: Record<string, DepartmentTone> = {
  COMP: tone("#1d5fd1", "#eaf2ff", "#a9c8f5", "#8db7ff", "#13233f", "#284a80"),
  CSE: tone("#6d3fd6", "#f2edff", "#c9b8f2", "#bba4ff", "#1f1838", "#46357a"),
  IT: tone("#0e8a7e", "#e5f6f3", "#9fd9cf", "#5fd4c4", "#0f2a28", "#22564f"),
  AIML: tone("#d96c0c", "#fff3e3", "#f5c98f", "#ffb46b", "#2d1f0f", "#6a4317"),
  AIDS: tone("#d6264f", "#ffecf0", "#f3aebd", "#ff8ea8", "#331520", "#6b2a3d"),
  DS: tone("#4b46d6", "#eeefff", "#b9bbf3", "#a3a6ff", "#1a1b3d", "#3a3c80"),
  ENTC: tone("#0b85a6", "#e5f6fb", "#9cd6e8", "#5fcdee", "#0d2731", "#1f5568"),
  ELEX: tone("#b07a05", "#fff8dc", "#ecd27c", "#f5c94f", "#2b230b", "#5e4b16"),
  ELEC: tone("#cf2d2d", "#ffeeee", "#f2b0b0", "#ff8f8f", "#331616", "#6c2b2b"),
  MECH: tone("#4a5a72", "#eef2f7", "#bfcadb", "#a9b8d0", "#19212e", "#384559"),
  CIVIL: tone("#1b8f45", "#e9f8ee", "#a6dcb7", "#5fd98a", "#10291a", "#265a37"),
  CHEM: tone("#8f37d6", "#f6edff", "#d5b4f3", "#d29bff", "#25163a", "#55307a"),
};

const FALLBACK = tone("#163a70", "#eef3fb", "#c7d6ee", "#a9c3f0", "#17243c", "#2b3f63");

export function toneOf(code: string): DepartmentTone {
  return departmentTones[code] ?? FALLBACK;
}

/** Program-year accents (FE / SE / TE / BE), as in the year/semester table. */
export const programYearTones = {
  FE: { fg: "#b4650a", bg: "#fff3e3", fgDark: "#ffb46b", bgDark: "#2d1f0f" },
  SE: { fg: "#5b45c9", bg: "#efecff", fgDark: "#bba4ff", bgDark: "#1f1838" },
  TE: { fg: "#0e8a7e", bg: "#e5f6f3", fgDark: "#5fd4c4", bgDark: "#0f2a28" },
  BE: { fg: "#b4650a", bg: "#fff1de", fgDark: "#ffb46b", bgDark: "#2d1f0f" },
} as const;

/** Fallback status colours; live values come from attendance_status_codes.color. */
export const statusColors = {
  P: "#16a34a",
  A: "#dc2626",
  L: "#d97706",
  OD: "#2563eb",
  ML: "#9333ea",
  EX: "#64748b",
} as const;

export const radius = { sm: 6, md: 10, lg: 14, xl: 18 } as const;
