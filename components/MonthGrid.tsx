"use client";

import { DAY_LABELS, dayStart, partsInZone, timeLabel } from "@/lib/time";
import { labColor, reservationLabel } from "@/lib/labs";
import { weekendCell, weekendTone } from "@/lib/weekend";
import type { Reservation } from "@/lib/types";

const MAX_CHIPS = 3;

type Props = {
  monthKey: string;
  days: string[];
  byDay: Map<string, Reservation[]>;
  todayKey: string;
  nowMs: number;
  /** 좁은 화면: 칸을 줄이고 예약을 점으로만 표시한다 */
  compact?: boolean;
  currentEmail: string;
  onOpenDetail: (reservation: Reservation) => void;
  onCreateAt: (dayKey: string) => void;
  onOpenWeek: (dayKey: string) => void;
  canEdit: (reservation: Reservation) => boolean;
  onBlockPointerDown: (reservation: Reservation, event: React.PointerEvent) => void;
  /** 끌고 있는 예약의 id 와 현재 대상 날짜 */
  drag: { id: number; dayKey: string } | null;
};

export default function MonthGrid({
  monthKey,
  days,
  byDay,
  todayKey,
  nowMs,
  compact = false,
  currentEmail,
  onOpenDetail,
  onCreateAt,
  onOpenWeek,
  canEdit,
  onBlockPointerDown,
  drag,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <div className={compact ? "min-w-0" : "min-w-[700px]"}>
        <div className="grid grid-cols-7 border-b border-line">
          {days.slice(0, 7).map((day) => {
            const weekday = partsInZone(dayStart(day)).weekday;
            return (
              <div
                key={day}
                className={`px-2 py-2 text-center text-xs font-medium ${
                  weekendTone(weekday) || "text-muted"
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
            // 오늘 이전 날짜는 예약할 수 없다
            const isPast = nowMs > 0 && todayKey !== "" && day < todayKey;
            const items = byDay.get(day) ?? [];
            const visible = items.slice(0, MAX_CHIPS);
            const hidden = items.length - visible.length;

            return (
              <div
                key={day}
                data-month-day={day}
                onClick={(event) => {
                  // 빈 영역을 눌렀을 때만 새 예약 창을 연다
                  if (isPast) return;
                  if (event.target === event.currentTarget) onCreateAt(day);
                }}
                title={isPast ? "지난 날짜에는 예약할 수 없습니다" : undefined}
                className={`border-b border-l border-line transition ${
                  compact ? "min-h-[62px] p-1" : "min-h-[112px] p-1.5"
                } ${isPast ? "slot-past" : "cell-hover cursor-pointer"} ${
                  drag && drag.dayKey === day ? "ring-2 ring-inset ring-blue-500" : ""
                } ${weekendCell(parts.weekday)} ${inMonth ? "" : "opacity-50"}`}
              >
                <button
                  type="button"
                  onClick={() => onOpenWeek(day)}
                  title="이 주를 주간 보기로 열기"
                  className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs transition hover:bg-black/10 dark:hover:bg-white/10 ${
                    isToday
                      ? "bg-blue-600 font-semibold text-white hover:bg-blue-700"
                      : inMonth
                        ? weekendTone(parts.weekday) || "text-ink"
                        : "text-muted opacity-60"
                  }`}
                >
                  {parts.day}
                </button>

                {compact ? (
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {items.slice(0, 6).map((reservation) => (
                      <button
                        key={reservation.id}
                        type="button"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (canEdit(reservation)) onBlockPointerDown(reservation, event);
                        }}
                        onClick={() => onOpenDetail(reservation)}
                        title={`${timeLabel(new Date(reservation.starts_at))}–${timeLabel(
                          new Date(reservation.ends_at),
                        )} ${reservationLabel(reservation)}`}
                        aria-label={reservationLabel(reservation)}
                        className={`h-2 w-2 rounded-full ${
                          reservation.user_email === currentEmail ? "mine-dot" : ""
                        } ${drag?.id === reservation.id ? "opacity-40" : ""}`}
                        style={{ backgroundColor: labColor(reservation.lab) }}
                      />
                    ))}
                  </div>
                ) : (
                <div className="space-y-1.5">
                  {visible.map((reservation) => {
                    const mine = reservation.user_email === currentEmail;
                    return (
                      <button
                        key={reservation.id}
                        type="button"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (canEdit(reservation)) onBlockPointerDown(reservation, event);
                        }}
                        onClick={() => onOpenDetail(reservation)}
                        title={`${reservationLabel(reservation)} · 예약자 ${reservation.user_name ?? reservation.user_email}`}
                        className={`flex w-full items-center gap-1 overflow-hidden rounded px-1 py-0.5 text-left text-[11px] leading-tight text-white transition hover:brightness-110 ${
                          mine ? "mine" : ""
                        } ${canEdit(reservation) ? "cursor-grab active:cursor-grabbing" : ""} ${
                          drag?.id === reservation.id ? "opacity-40" : ""
                        }`}
                        style={{ backgroundColor: labColor(reservation.lab) }}
                      >
                        <span className="shrink-0 font-medium">
                          {timeLabel(new Date(reservation.starts_at))}–
                          {timeLabel(new Date(reservation.ends_at))}
                        </span>
                        {reservation.series_id ? <span className="shrink-0 opacity-80">↻</span> : null}
                        <span className="truncate opacity-90">{reservationLabel(reservation)}</span>
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
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
