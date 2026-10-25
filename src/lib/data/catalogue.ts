// Static reference data for the "Mumbai University – Engineering" blueprint
// template (§7.6). In production this lives in Webapp/supabase/seed.
import type { DepartmentCode } from "@/shared/tokens";
import type { Period, ProgramYear, ProgramYearCode } from "./types";

export const DEPARTMENT_SEED: {
  code: DepartmentCode;
  name: string;
  established: number;
  divisions: number;
}[] = [
  { code: "COMP", name: "Computer Engineering", established: 1994, divisions: 3 },
  { code: "CSE", name: "Computer Science & Engineering", established: 2019, divisions: 2 },
  { code: "IT", name: "Information Technology", established: 1999, divisions: 2 },
  { code: "AIML", name: "Artificial Intelligence & Machine Learning", established: 2020, divisions: 2 },
  { code: "AIDS", name: "AI & Data Science", established: 2020, divisions: 1 },
  { code: "DS", name: "Data Science", established: 2021, divisions: 1 },
  { code: "ENTC", name: "Electronics & Telecommunication Engineering", established: 1994, divisions: 2 },
  { code: "ELEX", name: "Electronics Engineering", established: 1996, divisions: 1 },
  { code: "ELEC", name: "Electrical Engineering", established: 1998, divisions: 1 },
  { code: "MECH", name: "Mechanical Engineering", established: 1994, divisions: 2 },
  { code: "CIVIL", name: "Civil Engineering", established: 2001, divisions: 1 },
  { code: "CHEM", name: "Chemical Engineering", established: 2004, divisions: 1 },
];

export const PROGRAM_YEARS: ProgramYear[] = [
  { code: "FE", name: "First Year Engineering", order: 1, semesters: [1, 2] },
  { code: "SE", name: "Second Year Engineering", order: 2, semesters: [3, 4] },
  { code: "TE", name: "Third Year Engineering", order: 3, semesters: [5, 6] },
  { code: "BE", name: "Final Year Engineering", order: 4, semesters: [7, 8] },
];

export const PROGRAM_YEAR_CODES: ProgramYearCode[] = ["FE", "SE", "TE", "BE"];

export const PERIODS: Period[] = [
  { index: 1, label: "P1", start: 540, end: 600, kind: "lecture" },
  { index: 2, label: "P2", start: 600, end: 660, kind: "lecture" },
  { index: 0, label: "Short break", start: 660, end: 675, kind: "break" },
  { index: 3, label: "P3", start: 675, end: 735, kind: "lecture" },
  { index: 4, label: "P4", start: 735, end: 795, kind: "lecture" },
  { index: 0, label: "Lunch", start: 795, end: 840, kind: "break" },
  { index: 5, label: "P5–P6", start: 840, end: 960, kind: "practical" },
];

type Family = "computing" | "electronics" | "electrical" | "mech" | "civil" | "chem";

export const DEPARTMENT_FAMILY: Record<DepartmentCode, Family> = {
  COMP: "computing",
  CSE: "computing",
  IT: "computing",
  AIML: "computing",
  AIDS: "computing",
  DS: "computing",
  ENTC: "electronics",
  ELEX: "electronics",
  ELEC: "electrical",
  MECH: "mech",
  CIVIL: "civil",
  CHEM: "chem",
};

/** Five theory subjects per odd semester; the first three also have a 2-hour practical. */
export const FE_SEM1 = [
  "Engineering Mathematics-I",
  "Engineering Physics-I",
  "Engineering Chemistry-I",
  "Engineering Mechanics",
  "Basic Electrical Engineering",
];

export const FAMILY_SUBJECTS: Record<Family, Record<3 | 5 | 7, string[]>> = {
  computing: {
    3: [
      "Data Structures",
      "Digital Logic & Computer Architecture",
      "Computer Graphics",
      "Engineering Mathematics-III",
      "Discrete Structures & Graph Theory",
    ],
    5: [
      "Computer Network",
      "Software Engineering",
      "Data Warehousing & Mining",
      "Theoretical Computer Science",
      "DLOC-I: Internet Programming",
    ],
    7: [
      "Machine Learning",
      "Big Data Analytics",
      "DLOC-III: Natural Language Processing",
      "DLOC-IV: Blockchain Technology",
      "ILOC-I: Project Management",
    ],
  },
  electronics: {
    3: [
      "Electronic Devices & Circuits",
      "Digital System Design",
      "Network Theory",
      "Engineering Mathematics-III",
      "Electronic Instrumentation & Control",
    ],
    5: [
      "Digital Communication",
      "Discrete Time Signal Processing",
      "Digital VLSI",
      "Random Signal Analysis",
      "DLOC-I: Data Compression & Encryption",
    ],
    7: [
      "Microwave Engineering",
      "Mobile Communication System",
      "DLOC-III: Optical Communication",
      "DLOC-IV: Internet of Things",
      "ILOC-I: Product Lifecycle Management",
    ],
  },
  electrical: {
    3: [
      "Electrical Circuit Analysis",
      "Electrical Machines-I",
      "Electrical Measurements",
      "Engineering Mathematics-III",
      "Electromagnetic Fields & Waves",
    ],
    5: [
      "Power Electronics",
      "Electrical Machines-III",
      "Control System-I",
      "Power System-II",
      "DLOC-I: Renewable Energy",
    ],
    7: [
      "Power System Operation & Control",
      "Electrical Machine Design",
      "DLOC-III: High Voltage Engineering",
      "DLOC-IV: Smart Grid",
      "ILOC-I: Project Management",
    ],
  },
  mech: {
    3: [
      "Strength of Materials",
      "Production Processes",
      "Thermodynamics",
      "Engineering Mathematics-III",
      "Materials & Metallurgy",
    ],
    5: [
      "Heat Transfer",
      "Dynamics of Machinery",
      "CAD/CAM",
      "Turbo Machinery",
      "DLOC-I: Automobile Engineering",
    ],
    7: [
      "Machine Design",
      "Finite Element Analysis",
      "Refrigeration & Air Conditioning",
      "DLOC-III: Robotics",
      "ILOC-I: Operations Research",
    ],
  },
  civil: {
    3: [
      "Mechanics of Solids",
      "Fluid Mechanics-I",
      "Engineering Geology",
      "Engineering Mathematics-III",
      "Architectural Planning & Design",
    ],
    5: [
      "Theory of Reinforced Concrete Structures",
      "Applied Hydraulics",
      "Geotechnical Engineering-II",
      "Transportation Engineering",
      "DLOC-I: Advanced Surveying",
    ],
    7: [
      "Limit State Design of Steel Structures",
      "Environmental Engineering",
      "Quantity Survey, Estimation & Valuation",
      "DLOC-III: Bridge Engineering",
      "ILOC-I: Disaster Management",
    ],
  },
  chem: {
    3: [
      "Fluid Flow Operations",
      "Chemical Engineering Thermodynamics-I",
      "Process Calculations",
      "Engineering Mathematics-III",
      "Engineering Chemistry",
    ],
    5: [
      "Mass Transfer Operations-I",
      "Heat Transfer Operations",
      "Chemical Reaction Engineering-I",
      "Business Communication & Ethics",
      "DLOC-I: Petroleum Refining",
    ],
    7: [
      "Process Equipment Design",
      "Process Dynamics & Control",
      "Process Engineering",
      "DLOC-III: Polymer Technology",
      "ILOC-I: Energy Audit & Management",
    ],
  },
};

/** Per-branch substitutions so related branches don't look identical. */
export const SUBJECT_OVERRIDES: Partial<Record<DepartmentCode, Partial<Record<3 | 5 | 7, string[]>>>> = {
  AIML: { 5: ["Computer Network", "Artificial Intelligence", "Data Warehousing & Mining", "Web Computing", "DLOC-I: Statistics for AI"] },
  AIDS: { 5: ["Computer Network", "Artificial Intelligence", "Data Analytics & Visualization", "Theoretical Computer Science", "DLOC-I: Statistics for AI"] },
  DS: { 5: ["Computer Network", "Statistical Inference", "Data Warehousing & Mining", "Database Management Systems", "DLOC-I: Time Series Analysis"] },
  IT: { 5: ["Computer Network & Security", "Internet Programming", "Entrepreneurship & E-business", "Software Engineering", "DLOC-I: Advanced Data Management"] },
  ELEX: { 5: ["Microcontrollers & Applications", "Digital Communication", "Design With Linear Integrated Circuits", "Electrical Machines", "DLOC-I: Digital Signal Processing"] },
};

export const FIRST_NAMES_M = [
  "Aarav", "Aditya", "Akash", "Amey", "Aniket", "Arjun", "Atharva", "Chinmay", "Darshan", "Dhruv",
  "Gaurav", "Harsh", "Ishaan", "Jay", "Kunal", "Manas", "Mihir", "Nikhil", "Omkar", "Parth",
  "Pranav", "Prathamesh", "Rahul", "Rohit", "Sahil", "Sanket", "Saurabh", "Shreyas", "Siddhesh", "Soham",
  "Tanmay", "Tejas", "Varun", "Vedant", "Vinay", "Yash", "Yogesh", "Kartik", "Rudra", "Nishant",
];
export const FIRST_NAMES_F = [
  "Aditi", "Aishwarya", "Ananya", "Anushka", "Apurva", "Bhakti", "Diksha", "Gauri", "Isha", "Janhavi",
  "Kavya", "Khushi", "Mansi", "Mrunal", "Neha", "Nidhi", "Pooja", "Prachi", "Priya", "Riya",
  "Rutuja", "Sakshi", "Saloni", "Samruddhi", "Sanika", "Shravani", "Shruti", "Sneha", "Tanvi", "Vaishnavi",
  "Vidhi", "Yashika", "Zoya", "Mitali", "Payal", "Ritika", "Sayali", "Tejal", "Urvi", "Ira",
];
export const SURNAMES = [
  "Patil", "Kulkarni", "Deshmukh", "Joshi", "Shinde", "Pawar", "Jadhav", "More", "Gaikwad", "Chavan",
  "Sawant", "Naik", "Kadam", "Bhosale", "Desai", "Mehta", "Shah", "Iyer", "Nair", "Pillai",
  "Gupta", "Sharma", "Verma", "Mishra", "Yadav", "Rane", "Salunkhe", "Mane", "Thakur", "Khan",
  "Shaikh", "D'Souza", "Fernandes", "Menon", "Rao", "Kamat", "Parab", "Raut", "Wagh", "Gokhale",
];
