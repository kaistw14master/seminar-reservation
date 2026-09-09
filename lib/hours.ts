/** 클라이언트/서버 양쪽에서 쓰는 운영 시간 상수 (NEXT_PUBLIC_* 만 사용) */
export const OPEN_HOUR = Number(process.env.NEXT_PUBLIC_OPEN_HOUR ?? 0);
export const CLOSE_HOUR = Number(process.env.NEXT_PUBLIC_CLOSE_HOUR ?? 24);
export const SLOT_MINUTES = Number(process.env.NEXT_PUBLIC_SLOT_MINUTES ?? 30);
