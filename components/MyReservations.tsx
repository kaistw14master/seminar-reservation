"use client";

import { useState } from "react";
import { formatRange } from "@/lib/time";
import { googleCalendarTemplateUrl } from "@/lib/calendar-link";
import type { Reservation } from "@/lib/types";

export default function MyReservations({ initial }: { initial: Reservation[] }) {
  const [reservations, setReservations] = useState(initial);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = Date.now();
  const upcoming = reservations.filter((r) => new Date(r.ends_at).getTime() >= now);
  const past = reservations.filter((r) => new Date(r.ends_at).getTime() < now);

  async function cancel(id: number) {
    if (!window.confirm("이 예약을 취소할까요? 연동된 구글 캘린더 일정도 함께 삭제됩니다.")) return;
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "예약 취소에 실패했습니다.");
        return;
      }
      setReservations((current) => current.filter((r) => r.id !== id));
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <Section title="예정된 예약" empty="예정된 예약이 없습니다.">
        {upcoming.map((reservation) => (
          <Item
            key={reservation.id}
            reservation={reservation}
            busy={busyId === reservation.id}
            onCancel={() => cancel(reservation.id)}
          />
        ))}
      </Section>

      <Section title="지난 예약 (최근 30일)" empty="지난 예약이 없습니다.">
        {past.map((reservation) => (
          <Item key={reservation.id} reservation={reservation} past />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-muted">{title}</h2>
      {children.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          {empty}
        </p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

function Item({
  reservation,
  busy,
  past,
  onCancel,
}: {
  reservation: Reservation;
  busy?: boolean;
  past?: boolean;
  onCancel?: () => void;
}) {
  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 ${
        past ? "opacity-60" : ""
      }`}
    >
      <span
        className="h-9 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: reservation.room_color ?? "#2563eb" }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{reservation.title}</p>
        <p className="truncate text-xs text-muted">
          {reservation.room_name} · {formatRange(reservation.starts_at, reservation.ends_at)}
        </p>
      </div>

      {!past ? (
        <div className="flex items-center gap-2">
          <a
            href={googleCalendarTemplateUrl({
              title: `[${reservation.room_name}] ${reservation.title}`,
              details: reservation.purpose,
              startsAt: new Date(reservation.starts_at),
              endsAt: new Date(reservation.ends_at),
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            캘린더에 추가
          </a>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:hover:bg-red-950"
          >
            {busy ? "취소 중..." : "예약 취소"}
          </button>
        </div>
      ) : null}
    </li>
  );
}
