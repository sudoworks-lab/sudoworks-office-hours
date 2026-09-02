import type { SlotCatalogue } from "./model.ts";

const SLOT_HOURS_UTC = [9, 16] as const;
const SLOT_DAYS_UTC = new Set([2, 4]); // Tuesday and Thursday.
const SLOT_DURATION_MS = 30 * 60 * 1_000;

function slotId(start: Date): string {
  return `slot_${start.toISOString().replace(/\.000Z$/u, "Z").replaceAll(":", "-")}`;
}

export class RollingSlotCatalogue implements SlotCatalogue {
  readonly horizonDays: number;

  constructor(horizonDays = 21) {
    this.horizonDays = horizonDays;
  }

  list(now: Date) {
    const slots: { id: string; startAt: string; endAt: string }[] = [];
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    for (let dayOffset = 0; dayOffset < this.horizonDays; dayOffset += 1) {
      const day = new Date(firstDay.getTime() + dayOffset * 86_400_000);
      if (!SLOT_DAYS_UTC.has(day.getUTCDay())) continue;

      for (const hour of SLOT_HOURS_UTC) {
        const start = new Date(Date.UTC(
          day.getUTCFullYear(),
          day.getUTCMonth(),
          day.getUTCDate(),
          hour,
        ));
        if (start.getTime() <= now.getTime() + 60 * 60 * 1_000) continue;
        const end = new Date(start.getTime() + SLOT_DURATION_MS);
        slots.push({ id: slotId(start), startAt: start.toISOString(), endAt: end.toISOString() });
      }
    }

    return slots;
  }
}
