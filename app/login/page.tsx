import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ALLOWED_EMAIL_DOMAINS } from "@/lib/config";
import LoginButton from "@/components/LoginButton";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "접근이 허용되지 않은 계정입니다. 기관 구글 계정으로 로그인해 주세요.",
  Configuration: "로그인 설정에 문제가 있습니다. 관리자에게 문의해 주세요.",
  Verification: "인증 링크가 만료되었습니다. 다시 시도해 주세요.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const { callbackUrl, error } = await searchParams;

  if (session?.user) redirect(callbackUrl || "/");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">세미나실 예약</h1>
        <p className="mt-2 text-sm text-muted">
          구글 계정으로 로그인하면 예약 현황을 확인하고 예약할 수 있습니다.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {ERROR_MESSAGES[error] ?? "로그인에 실패했습니다. 다시 시도해 주세요."}
          </p>
        ) : null}

        <div className="mt-6">
          <LoginButton callbackUrl={callbackUrl || "/"} />
        </div>

        {ALLOWED_EMAIL_DOMAINS.length > 0 ? (
          <p className="mt-4 text-xs text-muted">
            {ALLOWED_EMAIL_DOMAINS.map((domain) => `@${domain}`).join(", ")} 계정만 로그인할 수
            있습니다.
          </p>
        ) : null}
      </div>
    </div>
  );
}
