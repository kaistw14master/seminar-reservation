function list(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

/** 로그인 허용 이메일 도메인. 비어 있으면 모든 구글 계정 허용 */
export const ALLOWED_EMAIL_DOMAINS = list(process.env.ALLOWED_EMAIL_DOMAINS);

/** 관리자 이메일 목록 */
export const ADMIN_EMAILS = list(process.env.ADMIN_EMAILS);

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true;
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export { OPEN_HOUR, CLOSE_HOUR, SLOT_MINUTES } from "./hours";

/** 1건당 최대 예약 시간(분) */
export const MAX_DURATION_MINUTES = Number(process.env.MAX_DURATION_MINUTES ?? 480);
/** 며칠 뒤까지 예약 가능한지 */
export const MAX_ADVANCE_DAYS = Number(process.env.MAX_ADVANCE_DAYS ?? 90);
