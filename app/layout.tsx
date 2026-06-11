import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FretFlow",
  description: "Animated high-position guitar chord learning."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
