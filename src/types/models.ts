/**
 * Firestore document shapes shared across the app.
 * `id` is the document id (not stored in the doc body unless noted).
 */

import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "coach" | "swimmer";

export type FireDate = Timestamp | number | null;

export interface AppUser {
  id: string;
  role: Role;
  email: string | null;
  displayName: string;
  age?: number | null;
  phone?: string | null;
  linkedParentEmail?: string | null;
  emergencyContact?: string | null;
  medicalNotes?: string | null;
  assignedTeams: string[];
  active?: boolean;
  consents?: Record<string, { version: string; at: number }>;
  createdAt?: FireDate;
  updatedAt?: FireDate;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  ageGroup?: string; // "8&U", "9-10", ...
  coaches: string[];
  swimmers: string[];
  color?: string;
  createdAt?: FireDate;
  updatedAt?: FireDate;
}

export type EventType = "practice" | "meet" | "social" | "meeting";

export interface SwimEvent {
  id: string;
  teamId: string;
  type: EventType;
  title: string;
  description?: string;
  location?: string;
  startTime: FireDate;
  endTime: FireDate;
  isRecurring?: boolean;
  recurrenceRule?: string | null;
  createdBy: string;
  createdAt?: FireDate;
  updatedAt?: FireDate;
}

export type RsvpStatus = "going" | "maybe" | "not_going";

export interface Signup {
  id: string;
  eventId: string;
  teamId: string;
  swimmerId: string;
  swimmerName?: string;
  status: RsvpStatus;
  timestamp?: FireDate;
}

export interface InviteToken {
  id: string;
  token: string;
  teamId: string;
  coachId: string;
  intendedSwimmerName?: string | null;
  parentEmail?: string | null;
  expiresAt: number;
  used: boolean;
  usedBy?: string | null;
}

export type ChatType = "team_chat" | "coach_chat" | "announcement_thread";

export interface Chat {
  id: string;
  teamId: string;
  type: ChatType;
  name?: string;
  mutedUsers?: string[];
  createdAt?: FireDate;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName?: string;
  text: string;
  attachments?: string[];
  createdAt?: FireDate;
}

export type NewsPriority = "normal" | "high";

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  priority: NewsPriority;
  visibleTo: string[]; // team IDs or 'all' | 'swimmers' | 'coaches'
  createdBy: string;
  createdAt?: FireDate;
}

export interface PerformanceLog {
  id: string;
  swimmerId: string;
  eventId?: string | null;
  stroke: string;
  distance: number;
  time: number; // seconds
  notes?: string;
  createdBy: string;
  createdAt?: FireDate;
}

export type AttendanceStatus = "present" | "absent" | "excused";

export interface Attendance {
  id: string;
  eventId: string;
  teamId: string;
  swimmerId: string;
  status: AttendanceStatus;
  timestamp?: FireDate;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  createdAt?: FireDate;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  target?: string;
  details?: Record<string, unknown>;
  at?: FireDate;
}
