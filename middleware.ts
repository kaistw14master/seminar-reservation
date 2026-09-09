import { auth } from "@/auth";

export default auth((req) => {
  if (!req.auth) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return Response.redirect(url);
  }
});

export const config = {
  // API, 정적 파일, 로그인 페이지는 미들웨어에서 제외 (API 는 각 라우트에서 직접 인증 확인)
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
