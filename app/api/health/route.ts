import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 상태 점검용. DB 왕복 시간을 재서 느려질 때 원인을 가릴 수 있게 한다.
 * (실행 지역과 응답 시간만 노출하고 연결 정보는 담지 않는다)
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await sql`SELECT 1`;
    const dbMs = Date.now() - startedAt;
    return Response.json(
      { ok: true, dbMs, region: process.env.VERCEL_REGION ?? "local" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, dbMs: Date.now() - startedAt, region: process.env.VERCEL_REGION ?? "local" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
