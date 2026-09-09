import { TIME_ZONE } from "./time";

/** 개인 구글 캘린더에 담기 위한 "일정 추가" 링크 (서버 설정 없이도 동작) */
export function googleCalendarTemplateUrl(input: {
  title: string;
  details?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: fmt(input.startsAt) + "/" + fmt(input.endsAt),
    ctz: TIME_ZONE,
  });
  if (input.details) params.set("details", input.details);
  if (input.location) params.set("location", input.location);
  return "https://calendar.google.com/calendar/render?" + params.toString();
}
