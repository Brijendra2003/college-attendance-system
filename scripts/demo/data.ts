// Deterministic randomness and name pools for the demo dataset.

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;
export const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
export const intBetween = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
export const digits = (rng: Rng, n: number) => Array.from({ length: n }, () => Math.floor(rng() * 10)).join("");

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
