"use client";

import { useMemo, useState } from "react";
import Modal from "./Modal";
import { dateKey, dateKeyOfDayStart, formatDateKey, fromLocalInput, partsInZone, toLocalInput } from "@/lib/time";
import { CLOSE_HOUR, OPEN_HOUR, SLOT_MINUTES } from "@/lib/hours";
import {
  MAX_OCCURRENCES,
  RecurrenceError,
  WEEKDAY_LABELS,
  expandOccurrences,
  type RecurrenceRule,
} from "@/lib/recurrence";
import { DEFAULT_LAB, LABS } from "@/lib/labs";
import type { Reservation, Room } from "@/lib/types";

export type DialogSeed = {
  mode: "create" | "edit";
  reservationId?: number;
  roomId: number;
  startsAt: Date;
  endsAt: Date;
  lab?: string;
  participants?: string;
};

type Conflict = { startsAt: string; endsAt: string; conflictWith: string };

type Props = {
  seed: DialogSeed;
  rooms: Room[];
  onClose: () => void;
  onSaved: (reservation: Reservation, summary: { created: number; skipped: number }) => void;
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
  const [lab, setLab] = useState<string>(seed.lab ?? DEFAULT_LAB);
  const [participants, setParticipants] = useState(seed.participants ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);

  const isEdit = seed.mode === "edit";

  // 반복 설정
  const [repeat, setRepeat] = useState(false);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([partsInZone(seed.startsAt).weekday]);
  const [until, setUntil] = useState(() => dateKeyOfDayStart(dateKey(seed.startsAt), 56));

  const rule: RecurrenceRule = { intervalWeeks, weekdays, until };

  // 미리보기: 규칙이 만들어낼 회차를 클라이언트에서도 똑같이 계산한다
  const preview = useMemo(() => {
    if (!repeat) return null;
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
  }, [repeat, start, end, intervalWeeks, weekdays.join(","), until]);

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

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );
  }

  async function submit(event: React.FormEvent | null, skipConflicts = false) {
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
    if (repeat && !isEdit) {
      payload.recurrence = rule;
      payload.skipConflicts = skipConflicts;
    }

    try {
      const response = await fetch(
        isEdit ? `/api/reservations/${seed.reservationId}` : "/api/reservations",
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

      onSaved(data.reservation as Reservation, {
        created: Number(data.created ?? 1),
        skipped: Array.isArray(data.skipped) ? data.skipped.length : 0,
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
              <span>→ &ldquo;{conflict.conflictWith}&rdquo;</span>
            </li>
          ))}
        </ul>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setConflicts(null)}
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            다시 설정
          </button>
          <button
            type="button"
            disabled={saving || remaining <= 0}
            onClick={() => submit(null, true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {remaining <= 0
              ? "예약 가능한 회차 없음"
              : saving
                ? "예약 중..."
                : `겹치는 회차 빼고 ${remaining}회 예약`}
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

        {repeat ? (
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
                onChange={(event) => setStart(`${startDate}T${event.target.value}`)}
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
                onChange={(event) => setEnd(`${startDate}T${event.target.value}`)}
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
                onChange={(event) => setStart(event.target.value)}
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
                onChange={(event) => setEnd(event.target.value)}
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

        {!isEdit ? (
          <div className="rounded-xl border border-line p-3">
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

            {repeat ? (
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
                ? "수정하기"
                : repeat && preview && preview.occurrences.length > 0
                  ? `${preview.occurrences.length}회 예약하기`
                  : "예약하기"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
