import postgres from "postgres";

type Client = ReturnType<typeof createClient>;

function createClient() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    "";

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL(또는 POSTGRES_URL) 환경변수가 설정되지 않았습니다. .env.local 을 확인하세요.",
    );
  }

  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
  const hasSslParam = /[?&]sslmode=/.test(connectionString);

  return postgres(connectionString, {
    // Neon / Supabase 등 서버리스 풀러와 호환되도록 prepared statement 비활성화
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    ...(hasSslParam || isLocal ? {} : { ssl: "require" as const }),
  });
}

// 개발 중 HMR 로 커넥션이 무한히 늘어나는 것을 방지
const globalForDb = globalThis as unknown as { __sql?: Client };

function client(): Client {
  if (!globalForDb.__sql) globalForDb.__sql = createClient();
  return globalForDb.__sql;
}

/**
 * 실제 커넥션은 첫 쿼리 시점에 만들어진다.
 * (빌드 타임에 DATABASE_URL 없이 모듈을 import 해도 실패하지 않도록 지연 생성)
 */
export const sql = new Proxy(function () {} as unknown as Client, {
  apply(_target, _thisArg, args: Parameters<Client>) {
    return (client() as (...a: Parameters<Client>) => unknown)(...args);
  },
  get(_target, property: string | symbol) {
    const active = client() as unknown as Record<string | symbol, unknown>;
    const value = active[property];
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as Client;
