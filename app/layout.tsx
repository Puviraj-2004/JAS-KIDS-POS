import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";

export const metadata: Metadata = {
  title: "JAS Kids POS",
  icons: {
    icon: "/Jaskids_Logo.png",
    shortcut: "/Jaskids_Logo.png",
    apple: "/Jaskids_Logo.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><ConfirmProvider>{children}</ConfirmProvider></body>
    </html>
  );
}
