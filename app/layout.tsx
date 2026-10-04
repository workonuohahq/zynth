import "./globals.css";
import "./dashboard/dashboard-features.css";
import "./zynth-notifications.css";
import "./../components/security-center.css";
import ZynthNotifications from "@/components/zynth-notifications";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "ZYNTH — Strategy Performance Platform",
  description: "Investor portfolios, strategy performance and controlled daily settlement.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: {
    icon: "/icons/zynth-icon.svg",
    apple: "/icons/zynth-apple-touch-icon.png"
  },
  appleWebApp: {
    capable: true,
    title: "ZYNTH",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#0b0d0f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<ZynthNotifications /></body></html>;
}
