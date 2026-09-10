"use client";

import { useState } from "react";
import type { Room } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const EMPTY_DRAFT = {
  name: "",
  location: "",
  capacity: "",
  color: "#2563eb",
  sortOrder: "0",
};

export default function AdminRooms({ initial }: { initial: Room[] }) {
  const [rooms, setRooms] = useState(initial);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function request(url: string, method: string, body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "요청에 실패했습니다.");
        return null;
      }
      return data;
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const data = await request("/api/rooms", "POST", {
      name: draft.name,
      location: draft.location || null,
      capacity: draft.capacity || null,
      color: draft.color,
      sortOrder: Number(draft.sortOrder) || 0,
    });
    if (!data) return;
    setRooms((current) => [...current, data.room as Room]);
    setDraft(EMPTY_DRAFT);
  }

  async function patch(id: number, changes: Record<string, unknown>) {
    const data = await request(`/api/rooms/${id}`, "PATCH", changes);
    if (!data) return;
    setRooms((current) => current.map((room) => (room.id === id ? (data.room as Room) : room)));
  }

  // 세미나실 삭제는 지난 예약까지 함께 지워지는 데 비해 쓸 일이 없어 제공하지 않는다.
  // 방을 막아야 하면 "사용"을 꺼서 예약 화면에서 숨긴다 (되돌릴 수 있다).

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {rooms.map((room) => (
          <li key={room.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={room.color}
                onChange={(event) => patch(room.id, { color: event.target.value })}
                className="h-8 w-8 cursor-pointer rounded border border-line bg-transparent"
                aria-label={`${room.name} 색상`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{room.name}</p>
                <p className="truncate text-xs text-muted">
                  {[room.location, room.capacity ? `${room.capacity}인` : null]
                    .filter(Boolean)
                    .join(" · ") || "위치 미지정"}
                </p>
              </div>

              <label
                className="flex items-center gap-2 text-xs text-muted"
                title="끄면 예약 화면에서 숨겨지고 새 예약을 받지 않습니다. 기존 예약은 그대로 남습니다."
              >
                <input
                  type="checkbox"
                  checked={room.active}
                  onChange={(event) => patch(room.id, { active: event.target.checked })}
                  className="h-4 w-4"
                />
                사용
              </label>
            </div>

          </li>
        ))}
      </ul>

      <form onSubmit={create} className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">세미나실 추가</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="이름">
            <input
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="세미나실 A"
              className={inputClass}
            />
          </Field>
          <Field label="위치">
            <input
              value={draft.location}
              onChange={(event) => setDraft({ ...draft, location: event.target.value })}
              placeholder="3층 301호"
              className={inputClass}
            />
          </Field>
          <Field label="수용 인원">
            <input
              type="number"
              min={1}
              value={draft.capacity}
              onChange={(event) => setDraft({ ...draft, capacity: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="정렬 순서">
            <input
              type="number"
              value={draft.sortOrder}
              onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="색상">
            <input
              type="color"
              value={draft.color}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
              className="h-10 w-full cursor-pointer rounded-lg border border-line bg-transparent"
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          추가하기
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
