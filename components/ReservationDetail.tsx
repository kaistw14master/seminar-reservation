"use client";

import { useState } from "react";
import Modal from "./Modal";
import { formatRange } from "@/lib/time";
import { googleCalendarTemplateUrl } from "@/lib/calendar-link";
import { labColor, labLabel, reservationLabel } from "@/lib/labs";
import type { Reservation } from "@/lib/types";

type Props = {
  reservation: Reservation;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelled: (id: number) => void;
};

export default function ReservationDetail({
  reservation,
  canManage,
  onClose,
  onEdit,
  onCancelled,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [choosingScope, setChoosingScope] = useState(false);

  const isSeries = Boolean(reservation.series_id);

  async function cancel(scope: "single" | "following") {
    const message =
      scope === "following"
        ? "이 회차와 이후의 모든 회차를 취소할까요?"
        : "이 예약을 취소할까요?";
    if (!window.confirm(message)) return;

    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/reservations/${reservation.id}?scope=${scope}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "예약 취소에 실패했습니다.");
        return;
      }
      onCancelled(reservation.id);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setWorking(false);
    }
  }

  const addToMyCalendar = googleCalendarTemplateUrl({
    title: `[${reservation.room_name}] ${reservationLabel(reservation)}`,
    details: null,
    startsAt: new Date(reservation.starts_at),
    endsAt: new Date(reservation.ends_at),
  });

  return (
    <Modal title="예약 상세" onClose={onClose}>
      <dl className="space-y-3 text-sm">
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 text-muted">연구실</dt>
          <dd className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: labColor(reservation.lab) }}
            />
            {labLabel(reservation.lab)}
          </dd>
        </div>
        <Row label="세미나실" value={reservation.room_name ?? "-"} />
        <Row label="시간" value={formatRange(reservation.starts_at, reservation.ends_at)} />
        <Row
          label="예약자"
          value={`${reservation.user_name ?? ""} (${reservation.user_email})`.trim()}
        />
        {reservation.participants ? <Row label="참가자" value={reservation.participants} /> : null}
        {isSeries ? (
          <Row label="반복" value="반복 예약의 한 회차입니다." />
        ) : null}
      </dl>


      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(addToMyCalendar);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setError("클립보드 복사에 실패했습니다. 주소창에서 직접 복사해 주세요.");
            }
          }}
          title="이 링크를 단톡방에 공유하면, 받은 사람이 눌러서 자기 캘린더에 담을 수 있습니다"
          className="mr-auto rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          {copied ? "복사됨 ✓" : "공유 링크 복사"}
        </button>
        <a
          href={addToMyCalendar}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          내 캘린더에 추가
        </a>
        {canManage ? (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-line px-3 py-2 text-sm transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => (isSeries ? setChoosingScope(true) : cancel("single"))}
              disabled={working}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {working ? "취소 중..." : "예약 취소"}
            </button>
          </>
        ) : null}
      </div>

      {choosingScope ? (
        <div className="mt-4 rounded-xl border border-line p-3">
          <p className="text-sm font-medium">어디까지 취소할까요?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={working}
              onClick={() => cancel("single")}
              className="rounded-lg border border-line px-3 py-2 text-sm transition hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/10"
            >
              이 회차만
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => cancel("following")}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              이 회차 이후 전체
            </button>
            <button
              type="button"
              onClick={() => setChoosingScope(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              그만두기
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            &ldquo;이후 전체&rdquo;는 지난 회차는 건드리지 않습니다.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}
