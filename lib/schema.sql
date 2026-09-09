-- 세미나실 예약 시스템 스키마 (반복 실행해도 안전)

CREATE TABLE IF NOT EXISTS rooms (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  location    TEXT,
  capacity    INTEGER,
  color       TEXT NOT NULL DEFAULT '#2563eb',
  calendar_id TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservations (
  id              SERIAL PRIMARY KEY,
  room_id         INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  purpose         TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  user_email      TEXT NOT NULL,
  user_name       TEXT,
  status          TEXT NOT NULL DEFAULT 'confirmed',
  google_event_id TEXT,
  sync_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reservations_status_check CHECK (status IN ('confirmed', 'cancelled')),
  CONSTRAINT reservations_time_check CHECK (ends_at > starts_at)
);

-- 반복 예약은 회차마다 개별 행으로 저장하고 series_id 로 묶는다.
-- (규칙만 저장하면 아래 EXCLUDE 제약으로 중복을 막을 수 없다)
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS series_id TEXT;

CREATE INDEX IF NOT EXISTS reservations_series_idx
  ON reservations (series_id, starts_at)
  WHERE series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reservations_room_time_idx
  ON reservations (room_id, starts_at, ends_at)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS reservations_user_idx
  ON reservations (user_email, starts_at DESC);

-- 겹치는 예약을 DB 레벨에서 차단 (btree_gist 사용 가능한 경우에만)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  BEGIN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_no_overlap
      EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      ) WHERE (status = 'confirmed');
  EXCEPTION
    WHEN duplicate_table THEN NULL;   -- 제약 조건이 이미 존재
    WHEN duplicate_object THEN NULL;
  END;
EXCEPTION
  WHEN insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'btree_gist 를 설치할 수 없어 애플리케이션 레벨 중복 검사만 사용합니다.';
END $$;
