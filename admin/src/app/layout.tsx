import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "ClawForge Admin Console",
  description: "Enterprise governance for OpenClaw",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="clawforge">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
