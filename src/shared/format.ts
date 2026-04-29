import {
  SolidTimeClient,
  SolidTimeProject,
  SolidTimeTask,
  SolidTimeTimeEntry
} from './types.js';
import { findUserByMemberId } from './users.js';

const DEFAULT_TZ = 'Europe/Paris';

export function timezoneForMember(memberId?: string): string {
  if (!memberId) return DEFAULT_TZ;
  return findUserByMemberId(memberId)?.timezone ?? DEFAULT_TZ;
}

export function formatLocalDateTime(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // sv-SE gives YYYY-MM-DD HH:mm with 24h
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
    .format(d)
    .replace(',', '');
}

export function formatLocalTime(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
}

export function formatLocalDay(iso: string, tz: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

export function formatDurationSec(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h && m) return `${h}h ${m.toString().padStart(2, '0')}min`;
  if (h) return `${h}h`;
  return `${m}min`;
}

export function durationOf(entry: SolidTimeTimeEntry): number {
  if (typeof entry.duration === 'number' && entry.duration > 0) return entry.duration;
  const start = new Date(entry.start).getTime();
  if (Number.isNaN(start)) return 0;
  const end = entry.end ? new Date(entry.end).getTime() : Date.now();
  if (Number.isNaN(end)) return 0;
  return Math.floor((end - start) / 1000);
}

export interface FormatContext {
  tz: string;
  projectsById: Map<string, SolidTimeProject>;
  clientsById: Map<string, SolidTimeClient>;
  tasksById: Map<string, SolidTimeTask>;
}

export interface EnrichedEntry {
  id: string;
  start: string;
  end: string | null;
  startLocal: string | null;
  endLocal: string | null;
  startTimeLocal: string | null;
  endTimeLocal: string | null;
  dayLocal: string;
  durationSec: number;
  durationHuman: string;
  description: string;
  active: boolean;
  billable: boolean;
  projectId: string | null;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  taskId: string | null;
  taskName: string | null;
  tags: string[];
  memberId: string | null;
  userId: string;
  timezone: string;
}

export function enrichEntry(
  e: SolidTimeTimeEntry,
  ctx: FormatContext
): EnrichedEntry {
  const project = e.project_id ? ctx.projectsById.get(e.project_id) ?? null : null;
  const clientId = project?.client_id ?? null;
  const client = clientId ? ctx.clientsById.get(clientId) ?? null : null;
  const task = e.task_id ? ctx.tasksById.get(e.task_id) ?? null : null;
  const dur = durationOf(e);
  return {
    id: e.id,
    start: e.start,
    end: e.end,
    startLocal: formatLocalDateTime(e.start, ctx.tz),
    endLocal: formatLocalDateTime(e.end, ctx.tz),
    startTimeLocal: formatLocalTime(e.start, ctx.tz),
    endTimeLocal: formatLocalTime(e.end, ctx.tz),
    dayLocal: formatLocalDay(e.start, ctx.tz),
    durationSec: dur,
    durationHuman: formatDurationSec(dur),
    description: e.description ?? '',
    active: !e.end,
    billable: e.billable,
    projectId: e.project_id,
    projectName: project?.name ?? null,
    clientId,
    clientName: client?.name ?? null,
    taskId: e.task_id,
    taskName: task?.name ?? null,
    tags: e.tags ?? [],
    memberId: e.member_id ?? null,
    userId: e.user_id,
    timezone: ctx.tz
  };
}

export function summarizeEntry(e: EnrichedEntry): string {
  const time = e.endTimeLocal
    ? `${e.startTimeLocal} – ${e.endTimeLocal}`
    : `${e.startTimeLocal} – ⏵ en cours`;
  const projectStr = e.projectName
    ? ` [${e.projectName}${e.clientName ? ` / ${e.clientName}` : ''}]`
    : '';
  const taskStr = e.taskName ? ` · ${e.taskName}` : '';
  const desc = e.description?.trim() ? e.description : '(sans description)';
  return `${time} (${e.durationHuman}) — ${desc}${projectStr}${taskStr}`;
}

export function summarizeEntries(entries: EnrichedEntry[]): string {
  if (entries.length === 0) return 'Aucune entrée.';

  const tz = entries[0].timezone;
  const totalSec = entries.reduce(
    (sum, e) => sum + (e.active ? 0 : e.durationSec),
    0
  );
  const activeCount = entries.filter((e) => e.active).length;

  const byDay = new Map<string, EnrichedEntry[]>();
  for (const e of entries) {
    if (!byDay.has(e.dayLocal)) byDay.set(e.dayLocal, []);
    byDay.get(e.dayLocal)!.push(e);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start));
  }
  const days = Array.from(byDay.keys()).sort();
  const lines: string[] = [];

  if (days.length === 1) {
    lines.push(
      `${entries.length} entrée${entries.length > 1 ? 's' : ''} (${tz}):`
    );
    for (const e of byDay.get(days[0])!) lines.push(`- ${summarizeEntry(e)}`);
  } else {
    lines.push(
      `${entries.length} entrées sur ${days.length} jours (${tz}):`
    );
    for (const day of days) {
      const dayEntries = byDay.get(day)!;
      const daySec = dayEntries.reduce(
        (s, e) => s + (e.active ? 0 : e.durationSec),
        0
      );
      lines.push('');
      lines.push(`${day} (${formatDurationSec(daySec)}):`);
      for (const e of dayEntries) lines.push(`- ${summarizeEntry(e)}`);
    }
  }

  lines.push('');
  const totalLine =
    `Total: ${formatDurationSec(totalSec)}` +
    (activeCount ? ` + ${activeCount} actif${activeCount > 1 ? 's' : ''}` : '');
  lines.push(totalLine);
  return lines.join('\n');
}
