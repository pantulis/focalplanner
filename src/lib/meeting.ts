import type { EventDto } from "@/lib/api";

export interface MeetingLink {
  url: string;
  provider: string;
}

// Ordered patterns for the common videoconference providers. First match wins.
const PROVIDERS: { provider: string; re: RegExp }[] = [
  { provider: "Microsoft Teams", re: /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/\S+/i },
  { provider: "Microsoft Teams", re: /https:\/\/teams\.live\.com\/meet\/\S+/i },
  { provider: "Google Meet", re: /https:\/\/meet\.google\.com\/[a-z]{3,}-[a-z]{3,}-[a-z]{3,}/i },
  { provider: "Zoom", re: /https:\/\/[\w.-]*zoom\.us\/(?:j|my|w)\/\S+/i },
  { provider: "Webex", re: /https:\/\/[\w.-]*webex\.com\/\S+/i },
  { provider: "Whereby", re: /https:\/\/[\w.-]*whereby\.com\/\S+/i },
];

/**
 * Find a videoconference join link in an event's url / location / notes.
 * Returns the link and a friendly provider name, or null if none is found.
 */
export function findMeetingLink(event: EventDto): MeetingLink | null {
  const haystack = [event.url, event.location, event.notes].filter(Boolean).join("\n");
  if (!haystack) return null;
  for (const { provider, re } of PROVIDERS) {
    const m = haystack.match(re);
    if (m) return { url: m[0].replace(/[)\].,;]+$/, ""), provider };
  }
  return null;
}
