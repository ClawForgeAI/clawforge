import type { Metadata } from "next";
import Script from "next/script";
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
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
