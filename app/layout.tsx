import type { Metadata } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const ui = Schibsted_Grotesk({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const formula = JetBrains_Mono({
  variable: "--font-formula",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Alpha Factory — LLM Strategy Discovery",
  description:
    "Quant lab: formulaic alphas, multi-agent filter/backtest, regime-adaptive weights. Demo inspired by Kou et al., Findings of EMNLP 2025.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${formula.variable} h-full`}>
      <body className="min-h-full bg-charcoal text-paper antialiased">{children}</body>
    </html>
  );
}
