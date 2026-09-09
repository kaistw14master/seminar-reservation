import { auth } from "@/auth";
import { sql } from "@/lib/db";
import Calendar from "@/components/Calendar";
import { monthKeyOf, weekStartKey } from "@/lib/time";
import type { Room } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();

  const rooms = await sql<Room[]>`
    SELECT id, name, location, capacity, color, active, sort_order
    FROM rooms
    WHERE active = TRUE
    ORDER BY sort_order, name
  `;

  if (rooms.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold">등록된 세미나실이 없습니다</h1>
        <p className="mt-2 text-sm text-muted">
          관리자가 <span className="font-medium">관리 &gt; 세미나실</span> 에서 먼저 세미나실을
          등록해야 합니다. (또는 <code className="rounded bg-black/5 px-1 dark:bg-white/10">npm run db:seed</code>)
        </p>
      </div>
    );
  }

  return (
    <Calendar
      rooms={rooms}
      currentEmail={session?.user?.email ?? ""}
      isAdmin={Boolean(session?.user?.isAdmin)}
      initialWeek={weekStartKey(new Date())}
      initialMonth={monthKeyOf(new Date())}
    />
  );
}
