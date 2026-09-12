import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackjack",
  description: "A blackjack game with a locally managed bankroll.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}