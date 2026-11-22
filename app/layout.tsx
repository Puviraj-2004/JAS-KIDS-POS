import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { PwaRegistration } from "@/components/pwa/PwaRegistration";

export const metadata: Metadata = {
  title: "JAS Kids POS",
  description: "JAS Kids point of sale",
  applicationName: "JAS Kids POS",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/Jaskids_Logo.png",
    shortcut: "/Jaskids_Logo.png",
    apple: "/Jaskids_Logo.png?app-icon=2",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "JAS Kids POS",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><ConfirmProvider>{children}</ConfirmProvider><PwaRegistration /></body>
    </html>
  );
}
