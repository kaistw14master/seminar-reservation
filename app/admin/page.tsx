import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import AdminRooms from "@/components/AdminRooms";
import type { Room } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/");

  const rooms = await sql<Room[]>`
    SELECT id, name, location, capacity, color, active, sort_order
    FROM rooms
    ORDER BY sort_order, name
  `;


  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">세미나실 관리</h1>
        <p className="mt-1 text-sm text-muted">
          세미나실을 추가·수정하고 사용 여부를 관리합니다.
        </p>
      </div>


      <AdminRooms initial={rooms} />
    </div>
  );
}
