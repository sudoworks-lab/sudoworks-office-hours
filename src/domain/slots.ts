import type { SlotCatalogue } from "./model.ts";

const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const WEEKDAYS = new Set([1, 2, 3, 4, 5]);
const SLOT_WINDOW_START_MINUTES = 9 * 60;
const SLOT_WINDOW_END_MINUTES = 12 * 60;
const SLOT_DURATION_MS = 30 * 60 * 1_000;
const MINIMUM_LEAD_TIME_MS = 60 * 60 * 1_000;

function slotId(start: Date): string {
  return `slot_${start.toISOString().replace(/\.000Z$/u, "Z").replaceAll(":", "-")}`;
}

export class RollingSlotCatalogue implements SlotCatalogue {
  readonly horizonBusinessDays: number;

  constructor(horizonBusinessDays = 14) {
    this.horizonBusinessDays = horizonBusinessDays;
  }

  list(now: Date) {
    const slots: { id: string; startAt: string; endAt: string }[] = [];
    const nowInJst = new Date(now.getTime() + JST_OFFSET_MS);
    const firstDay = new Date(Date.UTC(
      nowInJst.getUTCFullYear(),
      nowInJst.getUTCMonth(),
      nowInJst.getUTCDate(),
    ));
    let dayOffset = 0;
    let offeredBusinessDays = 0;

    while (offeredBusinessDays < this.horizonBusinessDays) {
      const day = new Date(firstDay.getTime() + dayOffset * 86_400_000);
      dayOffset += 1;
      if (!WEEKDAYS.has(day.getUTCDay())) continue;

      const daySlots: { id: string; startAt: string; endAt: string }[] = [];
      for (let minute = SLOT_WINDOW_START_MINUTES; minute < SLOT_WINDOW_END_MINUTES; minute += 30) {
        const start = new Date(day.getTime() - JST_OFFSET_MS + minute * 60 * 1_000);
        if (start.getTime() <= now.getTime() + MINIMUM_LEAD_TIME_MS) continue;
        const end = new Date(start.getTime() + SLOT_DURATION_MS);
        daySlots.push({ id: slotId(start), startAt: start.toISOString(), endAt: end.toISOString() });
      }
      if (daySlots.length === 0) continue;
      slots.push(...daySlots);
      offeredBusinessDays += 1;
    }

    return slots;
  }
}
