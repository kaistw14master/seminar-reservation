"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import {
  addMinutes,
  dateKey,
  dateKeyOfDayStart,
  formatDateKey,
  fromLocalInput,
  minutesBetween,
  partsInZone,
  timeLabel,
  toLocalInput,
  zonedTime,
} from "@/lib/time";
import { CLOSE_HOUR, OPEN_HOUR, SLOT_MINUTES } from "@/lib/hours";
import {
  MAX_OCCURRENCES,
  RecurrenceError,
  WEEKDAY_LABELS,
  expandOccurrences,
  type RecurrenceRule,
} from "@/lib/recurrence";
import { LABS, rememberLab, rememberedLab } from "@/lib/labs";
import type { Reservation, Room } from "@/lib/types";

export type DialogSeed = {
  mode: "create" | "edit";
  reservationId?: number;
  roomId: number;
  startsAt: Date;
  endsAt: Date;
  lab?: string;
  participants?: string;
  seriesId?: string | null;
};

type Conflict = { startsAt: string; endsAt: string; conflictWith: string };

type Props = {
  seed: DialogSeed;
  rooms: Room[];
  onClose: () => void;
  onSaved: (
    reservation: Reservation,
    summary: { created: number; skipped: number; updated: number },
  ) => void;
};

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

/** 달력과 같은 일~토 순서 */
const WEEKDAY_ORDER = [0, 1, 2, 3, 4, 5, 6];

const INTERVALS = [
  { value: 1, label: "매주" },
  { value: 2, label: "격주" },
  { value: 3, label: "3주마다" },
  { value: 4, label: "4주마다" },
];

export default function ReservationDialog({ seed, rooms, onClose, onSaved }: Props) {
  const [roomId, setRoomId] = useState(seed.roomId);
  const [start, setStart] = useState(toLocalInput(seed.startsAt));
  const [end, setEnd] = useState(toLocalInput(seed.endsAt));
  // 수정할 때는 그 예약의 연구실을, 새로 만들 때는 지난번에 고른 연구실을 기본값으로
  const [lab, setLab] = useState<string>(() => seed.lab ?? rememberedLab());
  const [participants, setParticipants] = useState(seed.participants ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  // 반복 예약 수정 범위
  const [editScope, setEditScope] = useState<"single" | "following">("single");

  const isEdit = seed.mode === "edit";

  // 반복 설정
  const [repeat, setRepeat] = useState(false);
  const [ruleLoaded, setRuleLoaded] = useState(false);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([partsInZone(seed.startsAt).weekday]);
  const [until, setUntil] = useState(() => dateKeyOfDayStart(dateKey(seed.startsAt), 56));

  const rule: RecurrenceRule = { intervalWeeks, weekdays, until };

  // 반복 예약을 "이후 전체" 로 고칠 때는 생성과 같은 반복 설정을 그대로 쓴다
  const seriesEdit = isEdit && Boolean(seed.seriesId) && editScope === "following";
  const showRecurrence = !isEdit || seriesEdit;
  const useRecurrence = seriesEdit || (repeat && !isEdit);

  // 기존 시리즈의 규칙을 불러와 기본값으로 채운다
  useEffect(() => {
    if (!seriesEdit || ruleLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/reservations/${seed.reservationId}`);
        const data = await response.json();
        if (cancelled || !data.rule) return;
        setIntervalWeeks(data.rule.intervalWeeks);
        setWeekdays(data.rule.weekdays);
        setUntil(data.rule.until);
      } catch {
        // 실패하면 기본값 그대로 둔다
      } finally {
        if (!cancelled) setRuleLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seriesEdit, ruleLoaded, seed.reservationId]);

  // 미리보기: 규칙이 만들어낼 회차를 클라이언트에서도 똑같이 계산한다
  const preview = useMemo(() => {
    if (!repeat && !seriesEdit) return null;
    try {
      const occurrences = expandOccurrences(fromLocalInput(start), fromLocalInput(end), rule);
      return { occurrences, error: null as string | null };
    } catch (e) {
      return {
        occurrences: [],
        error: e instanceof RecurrenceError ? e.message : "반복 설정을 확인해 주세요.",
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeat, seriesEdit, start, end, intervalWeeks, weekdays.join(","), until]);

  // 반복 모드에서는 "날짜 + 시각"을 따로 입력받아 datetime-local 값으로 합친다
  const startDate = start.slice(0, 10);
  const startTime = start.slice(11, 16);
  const endTime = end.slice(11, 16);

  function changeStartDate(value: string) {
    if (!value) return;
    setStart(`${value}T${startTime}`);
    setEnd(`${value}T${endTime}`); // 하루를 넘기는 예약은 허용하지 않는다
    if (until < value) setUntil(dateKeyOfDayStart(value, 56));
  }

  /**
   * 시작을 옮기면 길이를 유지한 채 종료도 함께 옮긴다.
   * 자정을 넘기는 예약은 만들 수 없으므로 그럴 땐 그 날의 마지막 슬롯으로 맞춘다.
   */
  function changeStart(nextStart: string) {
    setStart(nextStart);
    const moved = fromLocalInput(nextStart);
    if (Number.isNaN(moved.getTime())) return;

    const previousStart = fromLocalInput(start);
    const previousEnd = fromLocalInput(end);
    const duration =
      Number.isNaN(previousStart.getTime()) || Number.isNaN(previousEnd.getTime())
        ? SLOT_MINUTES
        : Math.max(SLOT_MINUTES, minutesBetween(previousStart, previousEnd));

    let nextEnd = addMinutes(moved, duration);
    if (dateKey(nextEnd) !== dateKey(moved)) {
      const day = partsInZone(moved);
      nextEnd = zonedTime(day.year, day.month, day.day, 23, 60 - SLOT_MINUTES);
    }
    setEnd(toLocalInput(nextEnd));
  }

  /** 종료만 바꾸면 길이가 바뀐다. 시작보다 앞서면 한 칸 뒤로 되돌린다. */
  function changeEnd(nextEnd: string) {
    const startAt = fromLocalInput(start);
    const endAt = fromLocalInput(nextEnd);
    if (!Number.isNaN(startAt.getTime()) && !Number.isNaN(endAt.getTime()) && endAt <= startAt) {
      setEnd(toLocalInput(addMinutes(startAt, SLOT_MINUTES)));
      return;
    }
    setEnd(nextEnd);
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );
  }

  async function submit(
    event: React.FormEvent | null,
    conflictMode: "abort" | "skip" | "keep" = "abort",
  ) {
    event?.preventDefault();
    setError(null);
    setSaving(true);

    const payload: Record<string, unknown> = {
      roomId,
      lab,
      participants: participants.trim(),
      startsAt: fromLocalInput(start).toISOString(),
      endsAt: fromLocalInput(end).toISOString(),
    };
    if (useRecurrence) {
      payload.recurrence = rule;
      payload.skipConflicts = conflictMode === "skip";
      payload.conflictMode = conflictMode;
    }

    try {
      const response = await fetch(
        isEdit
          ? `/api/reservations/${seed.reservationId}?scope=${editScope}`
          : "/api/reservations",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        if (Array.isArray(data.conflicts) && data.conflicts.length > 0) {
          setConflicts(data.conflicts as Conflict[]);
          setError(null);
        } else {
          setError(data.error ?? "저장에 실패했습니다.");
        }
        return;
      }

      rememberLab(lab);
      onSaved(data.reservation as Reservation, {
        created: Number(data.created ?? 1),
        skipped: Array.isArray(data.skipped) ? data.skipped.length : 0,
        updated: Number(data.updated ?? 1),
      });
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  // 충돌 확인 화면
  if (conflicts) {
    const total = preview?.occurrences.length ?? conflicts.length;
    const remaining = total - conflicts.length;
    return (
      <Modal title="겹치는 시간이 있습니다" onClose={onClose}>
        <p className="text-sm">
          총 {total}회 중 <span className="font-semibold text-red-600">{conflicts.length}회</span>가
          기존 예약과 겹칩니다.
        </p>

        <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line p-3 text-sm">
          {conflicts.map((conflict) => (
            <li key={conflict.startsAt} className="flex flex-wrap gap-x-2 text-muted">
              <span className="font-medium text-ink">
                {formatDateKey(dateKey(new Date(conflict.startsAt)))}
              </span>
              <span>
                {timeLabel(new Date(conflict.startsAt))}–{timeLabel(new Date(conflict.endsAt))}
              </span>
              <span>{conflict.conflictWith}</span>
            </li>
          ))}
        </ul>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled={saving || remaining <= 0}
            onClick={() => submit(null, "skip")}
            className="w-full rounded-lg border border-line px-4 py-2.5 text-left text-sm font-medium transition hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/10"
          >
            {remaining <= 0 ? (
              "진행할 수 있는 회차가 없습니다"
            ) : (
              <>
                겹치는 {conflicts.length}회는{" "}
                <strong className="font-bold text-red-600 dark:text-red-400">{seriesEdit ? "삭제하고" : "빼고"}</strong> 나머지{" "}
                {remaining}회 {seriesEdit ? "변경" : "예약"}
              </>
            )}
            <span className="mt-0.5 block text-xs font-normal text-muted">
              {seriesEdit
                ? "겹치는 날짜에는 예약이 남지 않습니다."
                : "겹치는 날짜는 만들지 않습니다."}
            </span>
          </button>

          {seriesEdit ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(null, "keep")}
              className="w-full rounded-lg border border-line px-4 py-2.5 text-left text-sm font-medium transition hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/10"
            >
              겹치는 주는 <strong className="font-bold text-emerald-600 dark:text-emerald-400">그대로 두고</strong> 나머지만 변경
              <span className="mt-0.5 block text-xs font-normal text-muted">
                겹친 주는 기존 일정이 그대로 남습니다.
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setConflicts(null)}
            className="w-full rounded-lg px-4 py-2 text-sm text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            전체 일정 다시 설정
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={isEdit ? "예약 수정" : "세미나실 예약"} onClose={onClose}>
      <form onSubmit={(event) => submit(event)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">세미나실</label>
          <select
            value={roomId}
            disabled={isEdit}
            onChange={(event) => setRoomId(Number(event.target.value))}
            className={inputClass + (isEdit ? " opacity-60" : "")}
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.location ? ` · ${room.location}` : ""}
              </option>
            ))}
          </select>
        </div>

        {repeat || seriesEdit ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">반복 시작 날짜</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(event) => changeStartDate(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">시작 시각</label>
              <input
                type="time"
                required
                step={SLOT_MINUTES * 60}
                value={startTime}
                onChange={(event) => changeStart(`${startDate}T${event.target.value}`)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">종료 시각</label>
              <input
                type="time"
                required
                step={SLOT_MINUTES * 60}
                value={endTime}
                onChange={(event) => changeEnd(`${startDate}T${event.target.value}`)}
                className={inputClass}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">시작</label>
              <input
                type="datetime-local"
                required
                step={SLOT_MINUTES * 60}
                value={start}
                onChange={(event) => changeStart(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">종료</label>
              <input
                type="datetime-local"
                required
                step={SLOT_MINUTES * 60}
                value={end}
                onChange={(event) => changeEnd(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        )}
        <p className="text-xs text-muted">
          예약 가능 시간 {OPEN_HOUR}:00 ~ {CLOSE_HOUR}:00 (한국 표준시)
        </p>

        <div>
          <label className="mb-1 block text-sm font-medium">연구실</label>
          <div className="flex gap-2">
            {LABS.map((option) => {
              const active = lab === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setLab(option.id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    active
                      ? "border-transparent font-medium text-white"
                      : "border-line text-muted hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                  style={active ? { backgroundColor: option.color } : undefined}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: active ? "rgba(255,255,255,0.9)" : option.color }}
                  />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            참가자 <span className="font-normal text-muted">(선택)</span>
          </label>
          <input
            type="text"
            maxLength={300}
            placeholder="예: 김OO, 이OO 외 3명"
            value={participants}
            onChange={(event) => setParticipants(event.target.value)}
            className={inputClass}
          />
        </div>

        {isEdit && seed.seriesId ? (
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 text-sm font-medium">어디까지 반영할까요?</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "single", label: "이 회차만" },
                  { value: "following", label: "이 회차 이후 전체" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setEditScope(option.value)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    editScope === option.value
                      ? "border-transparent bg-blue-600 font-medium text-white"
                      : "border-line text-muted hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {editScope === "following" ? (
              <p className="mt-2 text-xs text-muted">
이 회차부터 아래 설정대로 다시 만듭니다. 요일·주기·종료 날짜를 바꿀 수 있고, 이전 회차는 그대로 둡니다.
              </p>
            ) : null}
          </div>
        ) : null}

        {showRecurrence ? (
          <div className="rounded-xl border border-line p-3">
            {seriesEdit ? (
              <p className="text-sm font-medium">반복 설정</p>
            ) : (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(event) => {
                  setRepeat(event.target.checked);
                  // 반복은 하루 안에서만 다루므로 종료 날짜를 시작 날짜에 맞춘다
                  if (event.target.checked) setEnd(`${startDate}T${endTime}`);
                }}
                className="h-4 w-4"
              />
              반복 예약
            </label>
            )}

            {repeat || seriesEdit ? (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted">반복 주기</label>
                  <select
                    value={intervalWeeks}
                    onChange={(event) => setIntervalWeeks(Number(event.target.value))}
                    className={inputClass}
                  >
                    {INTERVALS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted">요일 (여러 개 선택 가능)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_ORDER.map((day) => {
                      const active = weekdays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleWeekday(day)}
                          className={`h-9 w-9 rounded-full border text-sm transition ${
                            active
                              ? "border-transparent bg-blue-600 font-medium text-white"
                              : "border-line text-muted hover:bg-black/5 dark:hover:bg-white/10"
                          }`}
                        >
                          {WEEKDAY_LABELS[day]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted">반복 종료 날짜 (이 날짜 포함)</label>
                  <input
                    type="date"
                    value={until}
                    min={startDate}
                    onChange={(event) => setUntil(event.target.value)}
                    className={inputClass}
                  />
                </div>

                {preview?.error ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {preview.error}
                  </p>
                ) : preview && preview.occurrences.length > 0 ? (
                  <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    총 <span className="font-semibold">{preview.occurrences.length}회</span> ·{" "}
                    {formatDateKey(dateKey(preview.occurrences[0].startsAt))} ~{" "}
                    {formatDateKey(dateKey(preview.occurrences.at(-1)!.startsAt))}
                    {preview.occurrences.length >= MAX_OCCURRENCES ? " (최대치에 근접)" : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={saving || Boolean(repeat && preview?.error)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving
              ? "저장 중..."
              : isEdit
                ? seed.seriesId && editScope === "following"
                  ? "이후 전체 수정"
                  : "수정하기"
                : repeat && preview && preview.occurrences.length > 0
                  ? `${preview.occurrences.length}회 예약하기`
                  : "예약하기"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
