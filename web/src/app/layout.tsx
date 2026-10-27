import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "IELTS Simulator | Practice with purpose", template: "%s | IELTS Simulator" },
  description: "Your focused workspace for computer-based IELTS practice. Choose a Cambridge volume, test, skill, and study mode.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader />{children}<SiteFooter /></body></html>;
}
