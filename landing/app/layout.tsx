import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-inter",
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "FiscalMind — הצד החכם של הנהלת החשבונות",
  description:
    "FiscalMind בונה פתרונות בינה מלאכותית מותאמים אישית שמייעלים את העבודה השגרתית — כדי שתוכלו להתמקד בלקוחות.",
  openGraph: {
    title: "FiscalMind — הצד החכם של הנהלת החשבונות",
    description: "אוטומציה מבוססת AI שנבנתה בלעדית עבור משרדי רואי חשבון.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
