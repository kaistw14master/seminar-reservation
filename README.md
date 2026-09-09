# 세미나실 예약 시스템

Next.js(App Router) + Vercel Postgres + Google 로그인 + 구글 캘린더 연동으로 만든 세미나실 예약 시스템입니다.

- 주간 그리드에서 **드래그로 시간 선택 → 바로 예약**
- 방 단위 advisory lock + Postgres `EXCLUDE` 제약으로 **중복 예약 원천 차단**
- 예약 생성/수정/취소가 **구글 캘린더에 자동 반영** (서비스 계정)
- 캘린더 설정 없이도 쓸 수 있는 **ICS 구독 피드** 와 "내 캘린더에 추가" 링크
- 기관 도메인 제한 로그인, 관리자 전용 세미나실 관리 화면
- 모든 시각은 `Asia/Seoul` 고정 기준으로 처리 (접속 지역과 무관하게 동일하게 보임)

---

## 1. 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run db:seed              # 스키마 생성 + 기본 세미나실 3개 등록
npm run dev
```

`http://localhost:3100` 으로 접속합니다.

> 스키마만 만들고 세미나실은 직접 등록하려면 `npm run db:init` 을 쓰세요.

---

## 2. 환경변수 준비

### 2-1. 데이터베이스

Vercel 프로젝트에서 **Storage → Create Database → Neon(Postgres)** 를 연결하면
`DATABASE_URL` 이 자동으로 주입됩니다. 로컬에서는 그 값을 `.env.local` 에 복사하세요.

```bash
vercel env pull .env.local   # Vercel CLI 를 쓰면 한 번에 가져올 수 있습니다
```

### 2-2. 구글 로그인 (필수)

1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 생성
2. **API 및 서비스 → OAuth 동의 화면** 구성 (내부 조직이면 "내부" 선택)
3. **사용자 인증 정보 → OAuth 클라이언트 ID → 웹 애플리케이션**
4. 승인된 리디렉션 URI 에 아래 두 개를 등록

   ```
   http://localhost:3100/api/auth/callback/google
   https://<배포도메인>/api/auth/callback/google
   ```

5. 발급된 값을 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 에 넣습니다.
6. `AUTH_SECRET` 은 `npx auth secret` 으로 생성합니다.
7. `ALLOWED_EMAIL_DOMAINS="kaist.ac.kr"` 처럼 도메인을 제한하고,
   `ADMIN_EMAILS` 에 본인 이메일을 넣어 관리자 권한을 받습니다.

### 2-3. 구글 캘린더 연동 (선택)

설정하지 않아도 예약 시스템은 정상 동작합니다. 설정하면 예약이 지정한 구글 캘린더에
자동으로 생성/수정/삭제됩니다.

1. Google Cloud Console 에서 **Google Calendar API** 사용 설정
2. **사용자 인증 정보 → 서비스 계정 만들기** → 키(JSON) 생성
3. JSON 안의 `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
   `private_key` → `GOOGLE_PRIVATE_KEY` (개행을 `\n` 으로 바꿔 한 줄로)
4. 구글 캘린더에서 예약용 캘린더를 만들고
   **설정 → 특정 사용자와 공유 → 서비스 계정 이메일 추가 → "일정 변경 권한"** 부여
5. 그 캘린더의 **캘린더 ID** 를 `GOOGLE_CALENDAR_ID` 에 넣습니다.
   (방마다 다른 캘린더를 쓰려면 관리 화면에서 방별 캘린더 ID 를 지정하세요.)

### 2-4. 캘린더 구독 (설정 불필요)

서비스 계정을 만들지 않아도, 각 세미나실 화면의 **캘린더 구독(ICS)** 버튼 주소를
구글 캘린더의 *다른 캘린더 → URL로 추가* 에 붙여넣으면 예약 현황을 구독할 수 있습니다.

```
https://<배포도메인>/api/ics/<세미나실 id>     # 특정 방
https://<배포도메인>/api/ics/all               # 전체
```

`ICS_TOKEN` 을 설정하면 `?token=...` 이 있어야 접근할 수 있습니다.

---

## 3. Vercel 배포

```bash
npm i -g vercel
vercel            # 프로젝트 연결
vercel env add    # 또는 대시보드에서 환경변수 입력
vercel --prod
```

배포 후 **한 번은 DB 스키마를 적용**해야 합니다. 로컬에서 프로덕션 `DATABASE_URL` 을
`.env.local` 에 넣고 아래를 실행하면 됩니다.

```bash
npm run db:seed
```

배포 도메인이 정해지면 Google OAuth 클라이언트의 리디렉션 URI 에
`https://<배포도메인>/api/auth/callback/google` 을 꼭 추가하세요.

---

## 4. 구조

```
app/
  page.tsx                     주간 예약 현황 (메인)
  my/page.tsx                  내 예약
  admin/page.tsx               세미나실 관리 (관리자 전용)
  login/page.tsx               구글 로그인
  api/reservations/            예약 목록/생성/수정/취소
  api/rooms/                   세미나실 CRUD (관리자)
  api/ics/[roomId]/            ICS 구독 피드
components/                    주간 그리드, 예약 폼, 관리 UI
lib/
  db.ts                        Postgres 커넥션
  schema.sql                   테이블 정의 (반복 실행 안전)
  reservations.ts              예약 검증 · 중복 방지 · 캘린더 동기화
  google-calendar.ts           서비스 계정으로 캘린더 API 호출
  time.ts                      Asia/Seoul 고정 시간 계산
auth.ts                        NextAuth(Google) 설정
middleware.ts                  비로그인 접근 차단
```

### 중복 예약 방지

1. 예약 생성 시 `pg_advisory_xact_lock(room_id)` 으로 같은 방에 대한 동시 요청을 직렬화
2. 트랜잭션 안에서 겹치는 예약을 조회해 있으면 409 반환
3. `btree_gist` 를 쓸 수 있는 DB 에서는 `EXCLUDE` 제약이 2차 방어선으로 동작

### 캘린더 동기화 실패 처리

캘린더 호출이 실패해도 예약 자체는 유지되고 `reservations.sync_error` 에 원인이 기록됩니다.
예약 상세 화면에 경고가 표시되며, 예약을 수정하면 동기화를 다시 시도합니다.

---

## 5. 운영 정책 바꾸기

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `NEXT_PUBLIC_OPEN_HOUR` / `NEXT_PUBLIC_CLOSE_HOUR` | 8 / 22 | 예약 가능 시간대 |
| `NEXT_PUBLIC_SLOT_MINUTES` | 30 | 예약 슬롯 단위(분) |
| `MAX_DURATION_MINUTES` | 480 | 1건당 최대 예약 시간 |
| `MAX_ADVANCE_DAYS` | 90 | 며칠 뒤까지 예약 가능 |
| `NEXT_PUBLIC_TIME_ZONE` | Asia/Seoul | 기준 타임존 |

---

## 6. 운영 자산 (인수인계용)

코드는 이 저장소에 다 있지만, **접근 권한은 저장소에서 알 수 없습니다.** 담당자가 바뀔 때
아래 항목의 실제 값과 비밀번호 소재를 함께 넘겨주세요.

| 자산 | 무엇인지 | 확인 위치 |
| --- | --- | --- |
| 운영 구글 계정 | 아래 모든 구글 자산의 소유자 | 연구실 비밀번호 보관처 |
| 예약용 구글 캘린더 | 예약이 실제로 올라가는 캘린더. **소유 계정이 삭제되면 함께 사라집니다** | `GOOGLE_CALENDAR_ID` |
| 구글 클라우드 프로젝트 | OAuth 클라이언트 + 서비스 계정 | console.cloud.google.com |
| 서비스 계정 키 | 캘린더 쓰기 권한. 유출 시 즉시 폐기·재발급 | `GOOGLE_PRIVATE_KEY` |
| Vercel 프로젝트 | 배포 + 환경변수 | vercel.com 대시보드 |
| Postgres (Neon) | 예약 데이터 원본 | Vercel Storage 탭, `DATABASE_URL` |
| 관리자 | 세미나실 관리·모든 예약 취소 권한 | `ADMIN_EMAILS` |

담당자가 바뀌면 최소한 **`ADMIN_EMAILS` 에 후임자를 추가**하고, 구글 클라우드 프로젝트와
캘린더에 후임자를 소유자/관리 권한으로 초대해 두세요.

환경변수 실제 값은 `vercel env pull` 로 받거나 Vercel 대시보드에서 확인합니다.
로컬 `.env.local` 은 커밋되지 않으므로 저장소만 받아서는 실행할 수 없습니다.
