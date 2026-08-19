import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const fontSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AeroCore",
  description:
    "Scheduling, attendance, payroll, and reimbursements for AeroCoole employees.",
};

export const viewport: Viewport = {
  themeColor: "#0284c7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        Browser extensions write to <body> before React hydrates — Grammarly
        adds data-gr-ext-installed and friends, password managers do the same —
        and React reports the difference as a hydration mismatch the app has no
        way to prevent.

        This suppresses it for <body> only. The flag reaches exactly one level:
        this element’s own attributes and text, never its children, so a genuine
        mismatch anywhere inside the app still reports as loudly as before.
      */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
