import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAdminEmail, isAllowedEmail } from "@/lib/config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    signIn({ profile, user }) {
      const email = (profile?.email as string | undefined) ?? user?.email;
      // 구글 계정의 이메일 인증 여부 + 허용 도메인 확인
      if (profile && profile.email_verified === false) return false;
      return isAllowedEmail(email);
    },
    jwt({ token }) {
      token.isAdmin = isAdminEmail(token.email);
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
});
