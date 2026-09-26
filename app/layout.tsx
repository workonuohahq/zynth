import "./globals.css";
import "./dashboard/dashboard-features.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZYNTH — Strategy Performance Platform",
  description: "Investor portfolios, strategy performance and controlled daily settlement.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
