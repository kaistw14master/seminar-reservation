import { purgeOldReservations } from "@/lib/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 보관 기간이 지난 예약을 지우는 정기 작업. vercel.json 의 crons 설정으로 하루 한 번 호출된다.
 * Vercel 은 CRON_SECRET 이 설정돼 있으면 Authorization 헤더에 담아 보낸다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await purgeOldReservations();
    console.log(
      `예약 정리: ${result.deleted}건 삭제 (${result.retentionMonths}개월 이전), 남은 ${result.remaining}건`,
    );
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("예약 정리 실패", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
