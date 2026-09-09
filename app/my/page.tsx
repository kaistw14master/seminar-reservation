import { auth } from "@/auth";
import { listUserReservations } from "@/lib/reservations";
import MyReservations from "@/components/MyReservations";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const reservations = email ? await listUserReservations(email) : [];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold tracking-tight">내 예약</h1>
      <MyReservations initial={reservations} />
    </div>
  );
}
