/**
 * 세미나실을 함께 쓰는 연구실 목록.
 * 연구실이 늘거나 이름이 바뀌면 이 배열만 고치면 된다 (DB 제약은 걸지 않았다).
 */
export const LABS = [
  { id: "SBML", label: "SBML", color: "#2563eb" },
  { id: "MOLSIM", label: "MOLSIM", color: "#d97706" },
] as const;

export type LabId = (typeof LABS)[number]["id"];

export const DEFAULT_LAB: LabId = LABS[0].id;

export function isLabId(value: unknown): value is LabId {
  return LABS.some((lab) => lab.id === value);
}

export function labColor(id: string | null | undefined): string {
  return LABS.find((lab) => lab.id === id)?.color ?? "#64748b";
}

export function labLabel(id: string | null | undefined): string {
  return LABS.find((lab) => lab.id === id)?.label ?? (id ?? "미지정");
}

/** 목록·캘린더에 쓰는 표시 이름 */
export function reservationLabel(reservation: {
  lab: string;
  participants: string | null;
}): string {
  return reservation.participants
    ? `${labLabel(reservation.lab)} · ${reservation.participants}`
    : labLabel(reservation.lab);
}

/** 마지막으로 고른 연구실을 브라우저에 기억해 두는 키 */
export const LAB_STORAGE_KEY = "seminar.lastLab";

/** 저장해 둔 연구실. 없거나 값이 이상하면 기본값을 돌려준다. */
export function rememberedLab(): LabId {
  try {
    const saved = window.localStorage.getItem(LAB_STORAGE_KEY);
    if (isLabId(saved)) return saved;
  } catch {
    // 사생활 보호 모드 등에서 localStorage 접근이 막힐 수 있다
  }
  return DEFAULT_LAB;
}

export function rememberLab(lab: string): void {
  try {
    if (isLabId(lab)) window.localStorage.setItem(LAB_STORAGE_KEY, lab);
  } catch {
    // 저장 실패는 무시한다 (기본값으로 동작)
  }
}
