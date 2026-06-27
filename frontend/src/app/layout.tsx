import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TechMind AI — Voice Interview Agent",
  description:
    "AI-powered voice interview system with real-time feedback, grounded evaluation, and multilingual support.",
  keywords: ["technical interview", "AI", "voice", "practice"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="theme-color" content="#0f0f23" />
      </head>
      <body>{children}</body>
    </html>
  );
}
