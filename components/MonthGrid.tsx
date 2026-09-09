"use client";

import { DAY_LABELS, dayStart, partsInZone, timeLabel } from "@/lib/time";
import type { Reservation } from "@/lib/types";

const MAX_CHIPS = 3;

type Props = {
  monthKey: string;
  days: string[];
  byDay: Map<string, Reservation[]>;
  todayKey: string;
  currentEmail: string;
  fallbackColor: string;
  onOpenDetail: (reservation: Reservation) => void;
  onCreateAt: (dayKey: string) => void;
  onOpenWeek: (dayKey: string) => void;
};

export default function MonthGrid({
  monthKey,
  days,
  byDay,
  todayKey,
  currentEmail,
  fallbackColor,
  onOpenDetail,
  onCreateAt,
  onOpenWeek,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-7 border-b border-line">
          {days.slice(0, 7).map((day) => {
            const weekday = partsInZone(dayStart(day)).weekday;
            return (
              <div
                key={day}
                className={`px-2 py-2 text-center text-xs ${
                  weekday === 0 ? "text-red-500" : weekday === 6 ? "text-blue-500" : "text-muted"
                }`}
              >
                {DAY_LABELS[weekday]}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const parts = partsInZone(dayStart(day));
            const inMonth = day.slice(0, 7) === monthKey;
            const isToday = day === todayKey;
            const items = byDay.get(day) ?? [];
            const visible = items.slice(0, MAX_CHIPS);
            const hidden = items.length - visible.length;

            return (
              <div
                key={day}
                onClick={(event) => {
                  // 빈 영역을 눌렀을 때만 새 예약 창을 연다
                  if (event.target === event.currentTarget) onCreateAt(day);
                }}
                className={`min-h-[112px] cursor-pointer border-b border-l border-line p-1.5 transition hover:bg-blue-500/5 ${
                  inMonth ? "" : "bg-black/[0.02] dark:bg-white/[0.02]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onOpenWeek(day)}
                  title="이 주를 주간 보기로 열기"
                  className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs transition hover:bg-black/10 dark:hover:bg-white/10 ${
                    isToday
                      ? "bg-blue-600 font-semibold text-white hover:bg-blue-700"
                      : inMonth
                        ? "text-ink"
                        : "text-muted"
                  }`}
                >
                  {parts.day}
                </button>

                <div className="space-y-1">
                  {visible.map((reservation) => {
                    const mine = reservation.user_email === currentEmail;
                    return (
                      <button
                        key={reservation.id}
                        type="button"
                        onClick={() => onOpenDetail(reservation)}
                        title={`${reservation.title} · ${reservation.user_name ?? reservation.user_email}`}
                        className="flex w-full items-center gap-1 overflow-hidden rounded px-1 py-0.5 text-left text-[11px] leading-tight text-white transition hover:brightness-110"
                        style={{
                          backgroundColor: reservation.room_color ?? fallbackColor,
                          outline: mine ? "1.5px solid rgba(255,255,255,0.8)" : undefined,
                          outlineOffset: mine ? "-1.5px" : undefined,
                        }}
                      >
                        <span className="shrink-0 font-medium">
                          {timeLabel(new Date(reservation.starts_at))}
                        </span>
                        {reservation.series_id ? <span className="shrink-0 opacity-80">↻</span> : null}
                        <span className="truncate opacity-90">{reservation.title}</span>
                      </button>
                    );
                  })}

                  {hidden > 0 ? (
                    <button
                      type="button"
                      onClick={() => onOpenWeek(day)}
                      className="w-full rounded px-1 text-left text-[11px] text-muted underline underline-offset-2"
                    >
                      +{hidden}개 더
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
