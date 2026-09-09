import { JWT } from "google-auth-library";
import { TIME_ZONE } from "./time";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
const API = "https://www.googleapis.com/calendar/v3";

function privateKey(): string {
  // 환경변수에는 개행이 리터럴 "\n" 두 글자로 들어가므로 실제 개행으로 복원한다
  return (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
}

/** 서비스 계정이 설정되어 있는지 */
export function isCalendarConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && privateKey());
}

let cachedClient: JWT | null = null;

function client(): JWT {
  if (!cachedClient) {
    cachedClient = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKey(),
      scopes: SCOPES,
    });
  }
  return cachedClient;
}

async function callCalendar(path: string, init: RequestInit): Promise<Response> {
  const { token } = await client().getAccessToken();
  if (!token) throw new Error("구글 액세스 토큰을 발급받지 못했습니다.");
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export function resolveCalendarId(roomCalendarId?: string | null): string | null {
  return roomCalendarId || process.env.GOOGLE_CALENDAR_ID || null;
}

export type EventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
};

function toEventBody(input: EventInput) {
  return {
    summary: input.title,
    description: input.description || undefined,
    location: input.location || undefined,
    start: { dateTime: input.startsAt.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: input.endsAt.toISOString(), timeZone: TIME_ZONE },
  };
}

/** 이벤트 생성. 성공 시 eventId 반환 */
export async function createCalendarEvent(
  calendarId: string,
  input: EventInput,
): Promise<string> {
  const res = await callCalendar(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(toEventBody(input)) },
  );
  if (!res.ok) throw new Error(`캘린더 이벤트 생성 실패 (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function updateCalendarEvent(
  calendarId: string,
  eventId: string,
  input: EventInput,
): Promise<void> {
  const res = await callCalendar(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(toEventBody(input)) },
  );
  if (!res.ok) throw new Error(`캘린더 이벤트 수정 실패 (${res.status}): ${await res.text()}`);
}

export async function deleteCalendarEvent(
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await callCalendar(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  // 이미 지워진 이벤트는 성공으로 취급
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`캘린더 이벤트 삭제 실패 (${res.status}): ${await res.text()}`);
  }
}
