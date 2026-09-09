import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "세미나실 예약",
  description: "세미나실 예약 시스템 · 구글 캘린더 연동",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="ko">
      <body className="min-h-dvh">
        <SessionProvider session={session}>
          {session?.user ? <Header user={session.user} /> : null}
          <main className="mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
