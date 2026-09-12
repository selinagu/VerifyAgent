import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "VerifyAgent",
  description: "Identity-gated authorization for AI actions",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
