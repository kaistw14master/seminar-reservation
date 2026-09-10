"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MonthGrid from "./MonthGrid";
import ReservationDetail from "./ReservationDetail";
import ReservationDialog, { type DialogSeed } from "./ReservationDialog";
import { CLOSE_HOUR, OPEN_HOUR, SLOT_MINUTES } from "@/lib/hours";
import {
  DAY_LABELS,
  addMinutes,
  dateKey,
  dateKeyOfDayStart,
  dayStart,
  formatMonth,
  minutesBetween,
  monthGridKeys,
  monthKeyOf,
  partsInZone,
  shiftMonth,
  timeLabel,
  weekDayKeys,
  weekStartKey,
} from "@/lib/time";
import { LABS, labColor, labLabel, reservationLabel } from "@/lib/labs";
import { useIsNarrow } from "@/lib/use-media";
import { weekendCell, weekendTone } from "@/lib/weekend";
import type { Reservation, Room } from "@/lib/types";

const SLOT_PX = 22;
const SLOTS_PER_DAY = ((CLOSE_HOUR - OPEN_HOUR) * 60) / SLOT_MINUTES;
const GRID_HEIGHT = SLOTS_PER_DAY * SLOT_PX;
const DEFAULT_DURATION_SLOTS = Math.max(1, Math.round(60 / SLOT_MINUTES));
/** 하루 전체를 그리면 세로가 길어지므로, 처음엔 이 시각이 보이도록 스크롤한다 */
const INITIAL_SCROLL_HOUR = 9;

// 자동 갱신 정책: 마지막 상호작용으로부터 얼마나 지났는지로 주기를 정한다.
// 화면이 가려져 있으면 아예 쉬고, 오래 방치되면 멈춰서 DB 가 절전하도록 둔다.
const POLL_CHECK_MS = 30_000;
const POLL_ACTIVE_MS = 60_000; // 최근에 만졌을 때
const POLL_IDLE_MS = 5 * 60_000; // 띄워만 두고 안 만질 때 (분할 화면 등)
const ACTIVE_WINDOW_MS = 10 * 60_000;
const POLL_STOP_AFTER_MS = 4 * 60 * 60_000;

type View = "week" | "month";
type Selection = { dayKey: string; from: number; to: number };

type Props = {
  rooms: Room[];
  currentEmail: string;
  isAdmin: boolean;
  initialWeek: string;
  initialMonth: string;
  initialReservations: Reservation[];
  initialToday: string;
};

/** dayKey + 슬롯 인덱스 -> 실제 시각 */
function slotTime(dayKey: string, slot: number): Date {
  return addMinutes(dayStart(dayKey), OPEN_HOUR * 60 + slot * SLOT_MINUTES);
}

export default function Calendar({
  rooms,
  currentEmail,
  isAdmin,
  initialWeek,
  initialMonth,
  initialReservations,
  initialToday,
}: Props) {
  const [view, setView] = useState<View>("week");
  const [weekKey, setWeekKey] = useState(initialWeek);
  const [monthKey, setMonthKey] = useState(initialMonth);
  const [roomId, setRoomId] = useState(rooms[0].id);
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [dialogSeed, setDialogSeed] = useState<DialogSeed | null>(null);
  const [detail, setDetail] = useState<Reservation | null>(null);
  const [todayKey, setTodayKey] = useState("");
  const [nowMs, setNowMs] = useState(0);
  // 좁은 화면에서는 주간 대신 하루씩 본다
  const isNarrow = useIsNarrow();
  const [selectedDay, setSelectedDay] = useState(initialToday);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const loadedAtRef = useRef(Date.now());

  const dragging = useRef(false);
  const loadRef = useRef<(options?: { silent?: boolean; fresh?: boolean }) => void>(() => {});
  const lastInteractionRef = useRef(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(
    () => (view === "week" ? weekDayKeys(weekKey) : monthGridKeys(monthKey)),
    [view, weekKey, monthKey],
  );
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];

  useEffect(() => {
    const tick = () => {
      setTodayKey(dateKey(new Date()));
      setNowMs(Date.now());
    };
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  // 주간 보기는 하루 24시간을 모두 그리므로 업무 시간대로 스크롤을 맞춰 둔다
  useEffect(() => {
    if (view !== "week" || !scrollRef.current) return;
    const offset = ((INITIAL_SCROLL_HOUR - OPEN_HOUR) * 60) / SLOT_MINUTES;
    scrollRef.current.scrollTop = Math.max(0, offset * SLOT_PX);
  }, [view, isNarrow]);

  /**
   * options.silent : 배경 갱신이라 로딩 표시를 띄우지 않는다
   * options.fresh  : 서버 캐시를 건너뛴다 (예약 직후처럼 최신이 확실해야 할 때)
   */
  const load = useCallback(
    async (options: { silent?: boolean; fresh?: boolean } = {}) => {
      if (!options.silent) setLoading(true);
      setLoadError(null);
      const from = dayStart(days[0]);
      const to = addMinutes(dayStart(days[days.length - 1]), 24 * 60);
      try {
        const response = await fetch(
          `/api/reservations?from=${from.toISOString()}&to=${to.toISOString()}&roomId=${roomId}` +
            (options.fresh ? "&fresh=1" : ""),
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "불러오기 실패");
        setReservations(data.reservations as Reservation[]);
        setLoadedAt(Date.now());
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "예약을 불러오지 못했습니다.");
      } finally {
        if (!options.silent) setLoading(false);
      }
    },
    [days, roomId],
  );

  // 첫 렌더는 서버가 내려준 데이터를 그대로 쓰고, 주/월/방이 바뀔 때부터 다시 불러온다
  const skipFirstLoad = useRef(true);
  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    void load();
  }, [load]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // 다른 사람이 만든 예약을 화면에 반영한다 (부하를 줄이려고 상황에 따라 주기를 바꾼다)
  useEffect(() => {
    const touch = () => {
      lastInteractionRef.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const type of events) window.addEventListener(type, touch, { passive: true });

    const refreshNow = () => {
      touch();
      loadRef.current({ silent: true });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshNow();
    };
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const idle = Date.now() - lastInteractionRef.current;
      if (idle > POLL_STOP_AFTER_MS) return;
      const wanted = idle <= ACTIVE_WINDOW_MS ? POLL_ACTIVE_MS : POLL_IDLE_MS;
      if (Date.now() - loadedAtRef.current >= wanted) loadRef.current({ silent: true });
    }, POLL_CHECK_MS);

    return () => {
      for (const type of events) window.removeEventListener(type, touch);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  // 드래그로 시간 범위를 선택한 뒤 손을 떼면 예약 창을 연다
  useEffect(() => {
    function finish() {
      if (!dragging.current) return;
      dragging.current = false;
      setSelection((current) => {
        if (current) {
          const from = Math.min(current.from, current.to);
          const to = Math.max(current.from, current.to) + 1;
          setDialogSeed({
            mode: "create",
            roomId,
            startsAt: slotTime(current.dayKey, from),
            endsAt: slotTime(current.dayKey, to),
          });
        }
        return null;
      });
    }
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [roomId]);

  const byDay = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const reservation of reservations) {
      const key = dateKey(new Date(reservation.starts_at));
      const list = map.get(key);
      if (list) list.push(reservation);
      else map.set(key, [reservation]);
    }
    return map;
  }, [reservations]);

  useEffect(() => {
    if (view !== "week") return;
    if (days.includes(selectedDay)) return;
    setSelectedDay(days.includes(todayKey) ? todayKey : days[0]);
  }, [days, selectedDay, todayKey, view]);

  function shift(direction: -1 | 1) {
    if (view === "week") setWeekKey(dateKeyOfDayStart(weekKey, direction * 7));
    else setMonthKey(shiftMonth(monthKey, direction));
  }

  function goToday() {
    const now = new Date();
    setWeekKey(weekStartKey(now));
    setMonthKey(monthKeyOf(now));
  }

  function openWeekOf(day: string) {
    setWeekKey(weekStartKey(dayStart(day), 0));
    setView("week");
  }

  /** 월간 보기에서 날짜를 눌렀을 때 쓸 기본 시간대 */
  function createAt(day: string) {
    const startsAt = day === todayKey ? nextRoundedSlot() : slotTime(day, (9 * 60) / SLOT_MINUTES);
    setDialogSeed({
      mode: "create",
      roomId,
      startsAt,
      endsAt: addMinutes(startsAt, DEFAULT_DURATION_SLOTS * SLOT_MINUTES),
    });
  }

  /** 터치에서는 드래그 대신 탭으로 만든다 (스크롤과 구분하기 위해 click 이벤트를 쓴다) */
  function tapSlot(dayKey: string, slot: number) {
    const startsAt = slotTime(dayKey, slot);
    if (startsAt <= new Date()) return;
    setDialogSeed({
      mode: "create",
      roomId,
      startsAt,
      endsAt: addMinutes(startsAt, DEFAULT_DURATION_SLOTS * SLOT_MINUTES),
    });
  }

  function startDrag(dayKey: string, slot: number) {
    if (slotTime(dayKey, slot + 1) <= new Date()) return; // 지난 시간은 선택 불가
    dragging.current = true;
    setSelection({ dayKey, from: slot, to: slot + DEFAULT_DURATION_SLOTS - 1 });
  }

  function extendDrag(dayKey: string, slot: number) {
    if (!dragging.current) return;
    setSelection((current) =>
      current && current.dayKey === dayKey ? { ...current, to: slot } : current,
    );
  }

  const shownDays = view === "week" && isNarrow ? [selectedDay] : days;
  const gridCols = isNarrow ? "grid-cols-[46px_1fr]" : "grid-cols-[56px_repeat(7,1fr)]";

  // nowMs 가 1분마다 갱신되므로 이 값도 함께 다시 계산된다
  const staleMinutes = nowMs > 0 ? Math.floor((nowMs - loadedAt) / 60_000) : 0;

  const rangeLabel =
    view === "week"
      ? `${weekKey.replace(/-/g, ".")} ~ ${days[6].slice(5).replace(/-/g, ".")}`
      : formatMonth(monthKey);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <NavButton onClick={() => shift(-1)} label={view === "week" ? "이전 주" : "이전 달"}>
            ‹
          </NavButton>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-line px-3 py-1.5 text-sm transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            오늘
          </button>
          <NavButton onClick={() => shift(1)} label={view === "week" ? "다음 주" : "다음 달"}>
            ›
          </NavButton>
        </div>

        <h1 className="text-lg font-semibold tracking-tight">{rangeLabel}</h1>

        <div className="flex overflow-hidden rounded-md border border-line">
          {(["week", "month"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={`px-3 py-1.5 text-sm transition ${
                view === value
                  ? "bg-blue-600 text-white"
                  : "text-muted hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              {value === "week" ? "주" : "월"}
            </button>
          ))}
        </div>

        {rooms.length === 1 ? (
          <span className="flex items-center gap-2 text-sm text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: room.color }} />
            {room.name}
            {room.location ? ` · ${room.location}` : ""}
          </span>
        ) : null}

        {loading ? (
          <span className="text-xs text-muted">불러오는 중…</span>
        ) : staleMinutes >= 2 ? (
          <button
            type="button"
            onClick={() => void load({ fresh: true })}
            title="눌러서 지금 새로고침"
            className="text-xs text-muted underline underline-offset-2"
          >
            {staleMinutes}분 전 기준
          </button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const startsAt = nextRoundedSlot();
              setDialogSeed({
                mode: "create",
                roomId,
                startsAt,
                endsAt: addMinutes(startsAt, DEFAULT_DURATION_SLOTS * SLOT_MINUTES),
              });
            }}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            + 예약하기
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        {LABS.map((lab) => (
          <span key={lab.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: lab.color }} />
            {lab.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="mine-dot h-2 w-2 rounded-full bg-muted" />
          테두리 표시는 내 예약
        </span>
      </div>

      {/* 세미나실이 하나뿐이면 선택 탭은 의미가 없으므로 숨긴다 */}
      <div className={`flex-wrap gap-1.5 ${rooms.length > 1 ? "flex" : "hidden"}`}>
        {rooms.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setRoomId(item.id)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              item.id === roomId
                ? "border-transparent text-white"
                : "border-line text-muted hover:bg-black/5 dark:hover:bg-white/10"
            }`}
            style={item.id === roomId ? { backgroundColor: item.color } : undefined}
          >
            {item.name}
          </button>
        ))}
      </div>

      {notice ? (
        <div className="flex items-start gap-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-300">
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs underline underline-offset-2"
          >
            닫기
          </button>
        </div>
      ) : null}

      {loadError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {loadError}
        </p>
      ) : null}

      {view === "week" ? (
        <>
        {isNarrow ? (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {days.map((day) => {
              const parts = partsInZone(dayStart(day));
              const active = day === selectedDay;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`flex min-w-[46px] flex-1 flex-col items-center rounded-lg border px-1 py-1.5 text-xs transition ${
                    active
                      ? "border-transparent bg-blue-600 text-white"
                      : day === todayKey
                        ? "border-blue-400 text-blue-600"
                        : "border-line text-muted"
                  }`}
                >
                  <span className={active ? "" : weekendTone(parts.weekday)}>
                    {DAY_LABELS[parts.weekday]}
                  </span>
                  <span className={`font-medium ${active ? "" : weekendTone(parts.weekday)}`}>
                    {parts.day}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <div className={isNarrow ? "min-w-0" : "min-w-[720px]"}>
            <div
              ref={scrollRef}
              className="max-h-[calc(100vh-260px)] min-h-[360px] overflow-y-auto"
            >
              <div className={`sticky top-0 z-20 grid border-b border-line bg-surface ${gridCols}`}>
                <div />
                {shownDays.map((day) => {
                  const parts = partsInZone(dayStart(day));
                  const isToday = day === todayKey;
                  return (
                    <div
                      key={day}
                      className={`border-l border-line px-2 py-2 text-center ${weekendCell(
                        parts.weekday,
                        "soft",
                      )}`}
                    >
                      <div className={`text-xs ${weekendTone(parts.weekday) || "text-muted"}`}>
                        {DAY_LABELS[parts.weekday]}
                      </div>
                      <div className="text-sm">
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 ${
                            isToday
                              ? "bg-blue-600 font-semibold text-white"
                              : weekendTone(parts.weekday)
                          }`}
                        >
                          {parts.month}/{parts.day}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={`no-select grid ${gridCols}`}>
                <div className="relative" style={{ height: GRID_HEIGHT }}>
                  {Array.from({ length: SLOTS_PER_DAY }).map((_, slot) => {
                    const minutes = OPEN_HOUR * 60 + slot * SLOT_MINUTES;
                    if (minutes % 60 !== 0) return null;
                    return (
                      <div
                        key={slot}
                        className="absolute right-2 -translate-y-1/2 text-[11px] text-muted"
                        style={{ top: slot * SLOT_PX }}
                      >
                        {String(minutes / 60).padStart(2, "0")}:00
                      </div>
                    );
                  })}
                </div>

                {shownDays.map((day) => (
                  <DayColumn
                    key={day}
                    dayKey={day}
                    isToday={day === todayKey}
                    nowMs={nowMs}
                    reservations={byDay.get(day) ?? []}
                    currentEmail={currentEmail}
                    selection={selection?.dayKey === day ? selection : null}
                    onStartDrag={startDrag}
                    onExtendDrag={extendDrag}
                    onTapSlot={tapSlot}
                    onOpenDetail={setDetail}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        </>
      ) : (
        <MonthGrid
          monthKey={monthKey}
          days={days}
          byDay={byDay}
          todayKey={todayKey}
          nowMs={nowMs}
          compact={isNarrow}
          currentEmail={currentEmail}
          onOpenDetail={setDetail}
          onCreateAt={createAt}
          onOpenWeek={openWeekOf}
        />
      )}

      <p className="text-xs text-muted">
        {view === "week"
          ? "빈 시간대를 클릭하거나 드래그하면 예약 창이 열립니다. 예약 블록을 클릭하면 상세 정보를 볼 수 있습니다."
          : "날짜 칸의 빈 곳을 누르면 그날 예약을 만들고, 날짜 숫자를 누르면 그 주의 주간 보기로 이동합니다."}
      </p>

      {dialogSeed ? (
        <ReservationDialog
          seed={dialogSeed}
          rooms={rooms}
          onClose={() => setDialogSeed(null)}
          onSaved={(saved, summary) => {
            setDialogSeed(null);
            setDetail(null);
            setNotice(
              summary.created > 1
                ? `반복 예약 ${summary.created}회를 등록했습니다.` +
                    (summary.skipped > 0 ? ` (겹치는 ${summary.skipped}회 제외)` : "")
                : summary.updated > 1
                  ? `반복 예약 ${summary.updated}회를 수정했습니다.`
                  : null,
            );
            if (saved.room_id !== roomId) setRoomId(saved.room_id);
            else void load({ fresh: true });
          }}
        />
      ) : null}

      {detail ? (
        <ReservationDetail
          reservation={detail}
          canManage={isAdmin || detail.user_email === currentEmail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDialogSeed({
              mode: "edit",
              reservationId: detail.id,
              roomId: detail.room_id,
              startsAt: new Date(detail.starts_at),
              endsAt: new Date(detail.ends_at),
              lab: detail.lab,
              participants: detail.participants ?? "",
              seriesId: detail.series_id,
            });
            setDetail(null);
          }}
          onCancelled={(id, scope) => {
            const target = detail;
            setDetail(null);
            // 서버 응답을 기다리지 않고 먼저 화면에서 지워 바로 사라지게 한다
            setReservations((current) =>
              current.filter((item) => {
                if (item.id === id) return false;
                if (
                  scope === "following" &&
                  target?.series_id &&
                  item.series_id === target.series_id
                ) {
                  return new Date(item.starts_at) < new Date(target.starts_at);
                }
                return true;
              }),
            );
            void load({ silent: true, fresh: true });
          }}
        />
      ) : null}
    </div>
  );
}

function DayColumn({
  dayKey,
  isToday,
  nowMs,
  reservations,
  currentEmail,
  selection,
  onStartDrag,
  onExtendDrag,
  onTapSlot,
  onOpenDetail,
}: {
  dayKey: string;
  isToday: boolean;
  nowMs: number;
  reservations: Reservation[];
  currentEmail: string;
  selection: Selection | null;
  onStartDrag: (dayKey: string, slot: number) => void;
  onExtendDrag: (dayKey: string, slot: number) => void;
  onTapSlot: (dayKey: string, slot: number) => void;
  onOpenDetail: (reservation: Reservation) => void;
}) {
  const open = dayStart(dayKey);
  const weekday = partsInZone(open).weekday;
  // 마우스면 드래그, 터치면 탭. click 은 스크롤 제스처 뒤에는 발생하지 않아 오작동이 없다.
  const pointerKind = useRef("mouse");

  return (
    <div
      className={`relative border-l border-line ${weekendCell(weekday, "soft")}`}
      style={{ height: GRID_HEIGHT }}
    >
      {Array.from({ length: SLOTS_PER_DAY }).map((_, slot) => {
        const isHour = (OPEN_HOUR * 60 + slot * SLOT_MINUTES) % 60 === 0;
        // 슬롯이 끝나는 시각이 이미 지났으면 예약할 수 없다
        const past =
          nowMs > 0 &&
          open.getTime() + (OPEN_HOUR * 60 + (slot + 1) * SLOT_MINUTES) * 60_000 <= nowMs;
        return (
          <div
            key={slot}
            onPointerDown={(event) => {
              pointerKind.current = event.pointerType || "mouse";
              if (!past && pointerKind.current === "mouse") onStartDrag(dayKey, slot);
            }}
            onPointerEnter={past ? undefined : () => onExtendDrag(dayKey, slot)}
            onClick={() => {
              if (!past && pointerKind.current !== "mouse") onTapSlot(dayKey, slot);
            }}
            title={past ? "이미 지난 시간은 예약할 수 없습니다" : undefined}
            className={`absolute inset-x-0 transition-colors ${
              past ? "slot-past" : "cursor-pointer hover:bg-blue-500/10"
            } ${isHour ? "border-t border-line" : "border-t border-line/40"}`}
            style={{ top: slot * SLOT_PX, height: SLOT_PX }}
          />
        );
      })}

      {/* 오늘 칸에는 현재 시각선을 그린다 */}
      {isToday && nowMs > 0
        ? (() => {
            const offset = ((nowMs - open.getTime()) / 60_000 - OPEN_HOUR * 60) / SLOT_MINUTES;
            if (offset < 0 || offset > SLOTS_PER_DAY) return null;
            return (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                style={{ top: offset * SLOT_PX }}
              >
                <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
              </div>
            );
          })()
        : null}

      {selection ? (
        <div
          className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-blue-500 bg-blue-500/20"
          style={{
            top: Math.min(selection.from, selection.to) * SLOT_PX,
            height: (Math.abs(selection.to - selection.from) + 1) * SLOT_PX,
          }}
        />
      ) : null}

      {reservations.map((reservation) => {
        const startsAt = new Date(reservation.starts_at);
        const endsAt = new Date(reservation.ends_at);
        const startMinutes = minutesBetween(open, startsAt) - OPEN_HOUR * 60;
        const top = Math.max(0, (startMinutes / SLOT_MINUTES) * SLOT_PX);
        const rawHeight = (minutesBetween(startsAt, endsAt) / SLOT_MINUTES) * SLOT_PX;
        const height = Math.max(SLOT_PX - 2, Math.min(rawHeight, GRID_HEIGHT - top));
        const mine = reservation.user_email === currentEmail;
        // 내 예약은 바깥 링이 붙어 있으므로 조금 더 안쪽으로 그려 이웃 일정을 덜 침범한다
        const inset = mine ? 3 : 1;

        return (
          <button
            key={reservation.id}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onOpenDetail(reservation)}
            title={`${reservationLabel(reservation)} · 예약자 ${reservation.user_name ?? reservation.user_email}`}
            className={`absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight text-white transition hover:brightness-110 ${
              mine ? "mine" : "shadow-sm"
            }`}
            style={{
              top: top + inset,
              height: Math.max(12, height - inset * 2),
              backgroundColor: labColor(reservation.lab),
            }}
          >
            <span className="block font-medium">
              {timeLabel(startsAt)}–{timeLabel(endsAt)}
              {reservation.series_id ? <span className="ml-1 opacity-80">↻</span> : null}
            </span>
            <span className="block truncate opacity-90">{reservationLabel(reservation)}</span>
          </button>
        );
      })}
    </div>
  );
}

function NavButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-md border border-line px-3 py-1.5 text-sm leading-5 transition hover:bg-black/5 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

/** 지금 이후 가장 가까운 슬롯 (오늘 안에 남은 슬롯이 없으면 다음 날 시작) */
function nextRoundedSlot(): Date {
  const now = new Date();
  const parts = partsInZone(now);
  const key = dateKey(now);
  const minutes = parts.hour * 60 + parts.minute;

  if (minutes < OPEN_HOUR * 60) return slotTime(key, 0);

  const slot = Math.ceil((minutes - OPEN_HOUR * 60) / SLOT_MINUTES);
  if (slot + DEFAULT_DURATION_SLOTS > SLOTS_PER_DAY) {
    return slotTime(dateKeyOfDayStart(key, 1), 0);
  }
  return slotTime(key, slot);
}
