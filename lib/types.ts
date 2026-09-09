export type Room = {
  id: number;
  name: string;
  location: string | null;
  capacity: number | null;
  color: string;
  calendar_id: string | null;
  active: boolean;
  sort_order: number;
};

export type ReservationStatus = "confirmed" | "cancelled";

export type Reservation = {
  id: number;
  room_id: number;
  room_name?: string;
  room_color?: string;
  title: string;
  purpose: string | null;
  starts_at: string; // ISO
  ends_at: string; // ISO
  user_email: string;
  user_name: string | null;
  status: ReservationStatus;
  series_id: string | null;
  google_event_id: string | null;
  sync_error: string | null;
  created_at: string;
};
