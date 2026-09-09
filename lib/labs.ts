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
