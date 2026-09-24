import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZYNTH — Wealth, Compounded",
  description: "Goal-based savings and wealth-building platform.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}