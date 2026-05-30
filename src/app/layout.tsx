import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GiveWars2 | A Guild Wars 2 Discord Activity",
  description: "Make Guild giveaways fun, transparent, and epic! Roll virtual d20s and check item unlocks automatically using the official Guild Wars 2 API.",
  openGraph: {
    title: "GiveWars2 | A Guild Wars 2 Discord Activity",
    description: "Make Guild giveaways fun, transparent, and epic!",
    type: "website",
  }
};

export default function RootLayout({
  children,
  }: Readonly<{
    children: React.ReactNode;
  }>) {
  return (
    <html lang="en">
      <body style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {children}
      </body>
    </html>
  );
}
