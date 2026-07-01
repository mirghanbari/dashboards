// Build "add to calendar" links for a match fixture. One CalEvent describes the
// event; the per-provider helpers turn it into a URL (Google/Outlook/Yahoo) or a
// downloadable .ics blob (Apple Calendar, desktop Outlook, and any other client).
// Kickoff-only data → every event defaults to a 2-hour block.

export const EVENT_DURATION_MIN = 120;

export interface CalEvent {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
}

/** Kickoff + 2h, from a match's ISO date. */
export function matchEventTimes(iso: string): { start: Date; end: Date } {
  const start = new Date(iso);
  const end = new Date(start.getTime() + EVENT_DURATION_MIN * 60_000);
  return { start, end };
}

// UTC basic format: 20260611T190000Z. Used by ICS, Google and Yahoo.
function utcBasic(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// ICS TEXT values escape commas, semicolons, backslashes and newlines.
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function icsContent(e: CalEvent): string {
  const uid = `${utcBasic(e.start)}-${Math.random().toString(36).slice(2, 8)}@wc2026`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//World Cup 2026 Dashboard//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${utcBasic(new Date())}`,
    `DTSTART:${utcBasic(e.start)}`,
    `DTEND:${utcBasic(e.end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `DESCRIPTION:${icsEscape(e.description)}`,
    `LOCATION:${icsEscape(e.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Object URL for an .ics download; caller revokes it when done. */
export function icsObjectUrl(e: CalEvent): string {
  const blob = new Blob([icsContent(e)], { type: "text/calendar;charset=utf-8" });
  return URL.createObjectURL(blob);
}

export function googleCalUrl(e: CalEvent): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${utcBasic(e.start)}/${utcBasic(e.end)}`,
    details: e.description,
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// Outlook.com web deeplink (also covers Microsoft 365 web / Outlook mobile app).
export function outlookCalUrl(e: CalEvent): string {
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    startdt: e.start.toISOString(),
    enddt: e.end.toISOString(),
    body: e.description,
    location: e.location,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
}

export function yahooCalUrl(e: CalEvent): string {
  const p = new URLSearchParams({
    v: "60",
    title: e.title,
    st: utcBasic(e.start),
    et: utcBasic(e.end),
    desc: e.description,
    in_loc: e.location,
  });
  return `https://calendar.yahoo.com/?${p.toString()}`;
}
