import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Attendance — St. John College of Engineering and Management", template: "%s · SJCEM Attendance" },
  description: "Engineering attendance management: academics, people, timetables, attendance and reports.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

// Resolves the theme before first paint so there is no flash: an explicit
// choice in localStorage wins, otherwise the OS preference.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)');function a(){var d=t==='dark'||((!t||t==='system')&&m.matches);document.documentElement.dataset.theme=d?'dark':'light';}a();m.addEventListener('change',function(){t=localStorage.getItem('theme');a();});}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full font-sans">
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
