// "Mumbai University – Engineering" blueprint template (§7.6, §11.1): the 12
// branches, FE–BE, Sem 1–8, divisions A–C, batches 1–3, and a starting
// subject catalogue. The college edits all of it in the blueprint editor.
import type { BlueprintDoc, BlueprintSubject, ProgramYearCode } from "./schema";

type Family = "computing" | "electronics" | "electrical" | "mech" | "civil" | "chem";

export const MU_DEPARTMENTS: { code: string; name: string; established: number; divisions: number; family: Family }[] = [
  { code: "COMP", name: "Computer Engineering", established: 2001, divisions: 3, family: "computing" },
  { code: "CSE", name: "Computer Science & Engineering", established: 2019, divisions: 2, family: "computing" },
  { code: "IT", name: "Information Technology", established: 2001, divisions: 2, family: "computing" },
  { code: "AIML", name: "Artificial Intelligence & Machine Learning", established: 2020, divisions: 2, family: "computing" },
  { code: "AIDS", name: "AI & Data Science", established: 2020, divisions: 1, family: "computing" },
  { code: "DS", name: "Data Science", established: 2021, divisions: 1, family: "computing" },
  { code: "ENTC", name: "Electronics & Telecommunication Engineering", established: 2001, divisions: 2, family: "electronics" },
  { code: "ELEX", name: "Electronics Engineering", established: 2004, divisions: 1, family: "electronics" },
  { code: "ELEC", name: "Electrical Engineering", established: 2004, divisions: 1, family: "electrical" },
  { code: "MECH", name: "Mechanical Engineering", established: 2001, divisions: 2, family: "mech" },
  { code: "CIVIL", name: "Civil Engineering", established: 2008, divisions: 1, family: "civil" },
  { code: "CHEM", name: "Chemical Engineering", established: 2010, divisions: 1, family: "chem" },
];

const FE: Record<1 | 2, string[]> = {
  1: ["Engineering Mathematics-I", "Engineering Physics-I", "Engineering Chemistry-I", "Engineering Mechanics", "Basic Electrical Engineering"],
  2: ["Engineering Mathematics-II", "Engineering Physics-II", "Engineering Chemistry-II", "Engineering Graphics", "C Programming"],
};

const FAMILY: Record<Family, Record<3 | 4 | 5 | 6 | 7 | 8, string[]>> = {
  computing: {
    3: ["Data Structures", "Digital Logic & Computer Architecture", "Computer Graphics", "Engineering Mathematics-III", "Discrete Structures & Graph Theory"],
    4: ["Analysis of Algorithms", "Database Management System", "Operating System", "Engineering Mathematics-IV", "Microprocessor"],
    5: ["Computer Network", "Software Engineering", "Data Warehousing & Mining", "Theoretical Computer Science", "DLOC-I: Internet Programming"],
    6: ["System Programming & Compiler Construction", "Cryptography & System Security", "Mobile Computing", "Artificial Intelligence", "DLOC-II: Internet of Things"],
    7: ["Machine Learning", "Big Data Analytics", "DLOC-III: Natural Language Processing", "DLOC-IV: Blockchain Technology", "ILOC-I: Project Management"],
    8: ["Distributed Computing", "DLOC-V: Deep Learning", "Major Project-II", "DLOC-VI: Social Media Analytics", "ILOC-II: Cyber Security & Laws"],
  },
  electronics: {
    3: ["Electronic Devices & Circuits", "Digital System Design", "Network Theory", "Engineering Mathematics-III", "Electronic Instrumentation & Control"],
    4: ["Microcontrollers", "Linear Integrated Circuits", "Signals & Systems", "Engineering Mathematics-IV", "Principles of Communication Engineering"],
    5: ["Digital Communication", "Discrete Time Signal Processing", "Digital VLSI", "Random Signal Analysis", "DLOC-I: Data Compression & Encryption"],
    6: ["Electromagnetics & Antenna", "Computer Communication Networks", "Image Processing & Machine Vision", "Artificial Neural Networks & Fuzzy Logic", "DLOC-II: Radar Engineering"],
    7: ["Microwave Engineering", "Mobile Communication System", "DLOC-III: Optical Communication", "DLOC-IV: Internet of Things", "ILOC-I: Product Lifecycle Management"],
    8: ["Wireless Networks", "Satellite Communication", "Major Project-II", "DLOC-V: Optical Networks", "ILOC-II: Cyber Security & Laws"],
  },
  electrical: {
    3: ["Electrical Circuit Analysis", "Electrical Machines-I", "Electrical Measurements", "Engineering Mathematics-III", "Electromagnetic Fields & Waves"],
    4: ["Electrical Machines-II", "Electrical Power System-I", "Analog & Digital Integrated Circuits", "Engineering Mathematics-IV", "Signals & Systems"],
    5: ["Power Electronics", "Electrical Machines-III", "Control System-I", "Power System-II", "DLOC-I: Renewable Energy"],
    6: ["Protection & Switchgear", "Electrical Machines-IV", "Control System-II", "Signal Processing", "DLOC-II: Utilization of Electrical Energy"],
    7: ["Power System Operation & Control", "Electrical Machine Design", "DLOC-III: High Voltage Engineering", "DLOC-IV: Smart Grid", "ILOC-I: Project Management"],
    8: ["Design & Management of Electrical Systems", "Power System Planning & Reliability", "Major Project-II", "DLOC-V: Flexible AC Transmission Systems", "ILOC-II: Energy Audit & Management"],
  },
  mech: {
    3: ["Strength of Materials", "Production Processes", "Thermodynamics", "Engineering Mathematics-III", "Materials & Metallurgy"],
    4: ["Fluid Mechanics", "Kinematics of Machinery", "CAD/CAM", "Engineering Mathematics-IV", "Industrial Electronics"],
    5: ["Heat Transfer", "Dynamics of Machinery", "Mechanical Measurements", "Turbo Machinery", "DLOC-I: Automobile Engineering"],
    6: ["Machine Design-I", "Heating, Ventilation & Air Conditioning", "Automation & Artificial Intelligence", "Production Planning & Control", "DLOC-II: Press Tool Design"],
    7: ["Machine Design-II", "Finite Element Analysis", "Refrigeration & Air Conditioning", "DLOC-III: Robotics", "ILOC-I: Operations Research"],
    8: ["Design of Mechanical Systems", "Logistics & Supply Chain Management", "Major Project-II", "DLOC-V: Power Engineering", "ILOC-II: Project Management"],
  },
  civil: {
    3: ["Mechanics of Solids", "Fluid Mechanics-I", "Engineering Geology", "Engineering Mathematics-III", "Architectural Planning & Design"],
    4: ["Structural Analysis", "Fluid Mechanics-II", "Building Design & Drawing", "Engineering Mathematics-IV", "Surveying"],
    5: ["Theory of Reinforced Concrete Structures", "Applied Hydraulics", "Geotechnical Engineering-I", "Transportation Engineering-I", "DLOC-I: Advanced Surveying"],
    6: ["Geotechnical Engineering-II", "Design & Drawing of Steel Structures", "Transportation Engineering-II", "Water Resources Engineering", "DLOC-II: Advanced Structural Analysis"],
    7: ["Limit State Design of Steel Structures", "Environmental Engineering", "Quantity Survey, Estimation & Valuation", "DLOC-III: Bridge Engineering", "ILOC-I: Disaster Management"],
    8: ["Design & Drawing of RC Structures", "Construction Management", "Major Project-II", "DLOC-V: Earthquake Engineering", "ILOC-II: Project Management"],
  },
  chem: {
    3: ["Fluid Flow Operations", "Chemical Engineering Thermodynamics-I", "Process Calculations", "Engineering Mathematics-III", "Engineering Chemistry"],
    4: ["Mechanical Equipment Design", "Solid Fluid Mechanical Operations", "Chemical Engineering Thermodynamics-II", "Engineering Mathematics-IV", "Chemical Technology"],
    5: ["Mass Transfer Operations-I", "Heat Transfer Operations", "Chemical Reaction Engineering-I", "Business Communication & Ethics", "DLOC-I: Petroleum Refining"],
    6: ["Mass Transfer Operations-II", "Chemical Reaction Engineering-II", "Transport Phenomena", "Plant Engineering", "DLOC-II: Petrochemical Technology"],
    7: ["Process Equipment Design", "Process Dynamics & Control", "Process Engineering", "DLOC-III: Polymer Technology", "ILOC-I: Energy Audit & Management"],
    8: ["Plant Design", "Environmental Engineering", "Major Project-II", "DLOC-V: Pharmaceutical Technology", "ILOC-II: Project Management"],
  },
};

/** Branch-specific substitutions so related branches don't look identical. */
const OVERRIDES: Record<string, Partial<Record<number, string[]>>> = {
  AIML: { 5: ["Computer Network", "Artificial Intelligence", "Data Warehousing & Mining", "Web Computing", "DLOC-I: Statistics for AI"] },
  AIDS: { 5: ["Computer Network", "Artificial Intelligence", "Data Analytics & Visualization", "Theoretical Computer Science", "DLOC-I: Statistics for AI"] },
  DS: { 5: ["Computer Network", "Statistical Inference", "Data Warehousing & Mining", "Database Management Systems", "DLOC-I: Time Series Analysis"] },
  IT: { 5: ["Computer Network & Security", "Internet Programming", "Entrepreneurship & E-business", "Software Engineering", "DLOC-I: Advanced Data Management"] },
  ELEX: { 5: ["Microcontrollers & Applications", "Digital Communication", "Design With Linear Integrated Circuits", "Electrical Machines", "DLOC-I: Digital Signal Processing"] },
};

export const MU_PERIODS: BlueprintDoc["periods"] = [
  { label: "P1", start: "09:00", end: "10:00", kind: "lecture" },
  { label: "P2", start: "10:00", end: "11:00", kind: "lecture" },
  { label: "Short break", start: "11:00", end: "11:15", kind: "break" },
  { label: "P3", start: "11:15", end: "12:15", kind: "lecture" },
  { label: "P4", start: "12:15", end: "13:15", kind: "lecture" },
  { label: "Lunch", start: "13:15", end: "14:00", kind: "break" },
  { label: "P5–P6", start: "14:00", end: "16:00", kind: "practical" },
];

function subjectsFor(prefix: string, department: string | null, semester: number, names: string[]): BlueprintSubject[] {
  return names.map((name, j) => ({
    code: `${prefix}${semester}0${j + 1}`,
    name,
    department,
    semester,
    credits: j < 3 ? 4 : 3,
    elective: /^(DLOC|ILOC)/.test(name),
    // First three subjects have a 2-hour practical; a project is practical-only.
    components: /Project-II$/.test(name)
      ? [{ kind: "PR" as const, hours: 6 }]
      : j < 3
        ? [{ kind: "TH" as const, hours: 3 }, { kind: "PR" as const, hours: 2 }]
        : [{ kind: "TH" as const, hours: 3 }],
  }));
}

export function muEngineeringBlueprint(): BlueprintDoc {
  const subjects: BlueprintSubject[] = [
    ...subjectsFor("FEC", null, 1, FE[1]),
    ...subjectsFor("FEC", null, 2, FE[2]),
  ];
  for (const d of MU_DEPARTMENTS) {
    for (const sem of [3, 4, 5, 6, 7, 8] as const) {
      subjects.push(...subjectsFor(d.code, d.code, sem, OVERRIDES[d.code]?.[sem] ?? FAMILY[d.family][sem]));
    }
  }
  return {
    scheme: { code: "MU-R2019-C", name: "Mumbai University Rev-2019 C-Scheme" },
    departments: MU_DEPARTMENTS.map((d) => ({
      code: d.code,
      name: d.name,
      established: d.established,
      active: true,
      divisions: Object.fromEntries(
        (["FE", "SE", "TE", "BE"] as ProgramYearCode[]).map((py) => [py, { count: d.divisions, batches: 3, capacity: 60 }]),
      ),
    })),
    subjects,
    periods: MU_PERIODS,
    workingSaturdays: [1, 3],
  };
}
