import { auth } from "@/auth";
import { ValidationError } from "./reservations";

export type CurrentUser = {
  email: string;
  name: string | null;
  isAdmin: boolean;
};

/** 로그인한 사용자 반환. 없으면 401 에러를 던진다. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new ValidationError("로그인이 필요합니다.", 401);
  return {
    email,
    name: session.user?.name ?? null,
    isAdmin: Boolean(session.user?.isAdmin),
  };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new ValidationError("관리자 권한이 필요합니다.", 403);
  return user;
}

/** API 라우트에서 던져진 에러를 JSON 응답으로 변환 */
export function errorResponse(error: unknown): Response {
  if (error instanceof ValidationError) {
    return Response.json(
      { error: error.message, ...(error.details ?? {}) },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  // 중복 예약을 EXCLUDE 제약이 잡은 경우
  if (/reservations_no_overlap/.test(message)) {
    return Response.json({ error: "해당 시간에 이미 다른 예약이 있습니다." }, { status: 409 });
  }
  console.error("API 오류", error);
  return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
}
