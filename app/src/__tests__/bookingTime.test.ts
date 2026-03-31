import { describe, it, expect } from "vitest";
import {
  computeBlocks,
  roundUpTo15,
  slotsInRange,
  windowForDate,
  fmtDuration,
  parseLocalDate,
  addDays,
  minutesFromMidnight,
  fmtTime,
  fmtDate,
  fmtDateShort,
  type SerializedBooking,
} from "../lib/bookingTime";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeBooking(overrides: Partial<SerializedBooking> & { startAt: string; endAt: string }): SerializedBooking {
  return {
    id: "b1",
    memberName: "Alice",
    ...overrides,
  };
}

// Fixed reference date — 2025-06-15 (a Sunday, irrelevant to logic)
const DATE = "2025-06-15";

// Midnight that day, as a local Date, for assertions
function midnightOn(dateStr: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function nextMidnight(dateStr: string): Date {
  const base = midnightOn(dateStr);
  return new Date(base.getTime() + 24 * 60 * 60 * 1000);
}

// ── computeBlocks ────────────────────────────────────────────────────────────

describe("computeBlocks", () => {
  it("returns a single free block when there are no bookings", () => {
    const blocks = computeBlocks([], DATE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("free");
    expect(blocks[0].start).toEqual(midnightOn(DATE));
    expect(blocks[0].end).toEqual(nextMidnight(DATE));
  });

  it("interleaves free and booked blocks correctly", () => {
    const bookings = [
      makeBooking({ id: "b1", startAt: "2025-06-15T08:00:00", endAt: "2025-06-15T10:00:00" }),
      makeBooking({ id: "b2", startAt: "2025-06-15T12:00:00", endAt: "2025-06-15T14:00:00" }),
    ];
    const blocks = computeBlocks(bookings, DATE);
    // free | booked | free | booked | free
    expect(blocks).toHaveLength(5);
    expect(blocks[0].type).toBe("free");
    expect(blocks[1].type).toBe("booked");
    expect(blocks[2].type).toBe("free");
    expect(blocks[3].type).toBe("booked");
    expect(blocks[4].type).toBe("free");
  });

  it("clips a booking that starts before the day window", () => {
    const booking = makeBooking({
      startAt: "2025-06-14T23:00:00", // previous day
      endAt:   "2025-06-15T02:00:00",
    });
    const blocks = computeBlocks([booking], DATE);
    const bookedBlock = blocks.find(b => b.type === "booked");
    expect(bookedBlock).toBeDefined();
    if (bookedBlock?.type === "booked") {
      expect(bookedBlock.clippedStart).toBe(true);
      expect(bookedBlock.clippedEnd).toBe(false);
      expect(bookedBlock.start).toEqual(midnightOn(DATE));
    }
  });

  it("clips a booking that ends after the day window", () => {
    const booking = makeBooking({
      startAt: "2025-06-15T22:00:00",
      endAt:   "2025-06-16T02:00:00", // next day
    });
    const blocks = computeBlocks([booking], DATE);
    const bookedBlock = blocks.find(b => b.type === "booked");
    expect(bookedBlock).toBeDefined();
    if (bookedBlock?.type === "booked") {
      expect(bookedBlock.clippedEnd).toBe(true);
      expect(bookedBlock.clippedStart).toBe(false);
      expect(bookedBlock.end).toEqual(nextMidnight(DATE));
    }
  });

  it("clips a booking that spans the entire day (midnight to midnight)", () => {
    const booking = makeBooking({
      startAt: "2025-06-14T00:00:00",
      endAt:   "2025-06-16T01:00:00", // ends 1h past window — genuinely clipped
    });
    const blocks = computeBlocks([booking], DATE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("booked");
    if (blocks[0].type === "booked") {
      expect(blocks[0].clippedStart).toBe(true);
      expect(blocks[0].clippedEnd).toBe(true);
      expect(blocks[0].start).toEqual(midnightOn(DATE));
      expect(blocks[0].end).toEqual(nextMidnight(DATE));
    }
  });

  it("excludes bookings entirely outside the day window", () => {
    const bookings = [
      makeBooking({ id: "past", startAt: "2025-06-14T10:00:00", endAt: "2025-06-14T12:00:00" }),
      makeBooking({ id: "future", startAt: "2025-06-16T10:00:00", endAt: "2025-06-16T12:00:00" }),
    ];
    const blocks = computeBlocks(bookings, DATE);
    expect(blocks.every(b => b.type === "free")).toBe(true);
  });

  it("handles overlapping bookings — later booking rendered from cursor, not from its own start", () => {
    // Two bookings where the second one starts before the first ends
    const bookings = [
      makeBooking({ id: "b1", startAt: "2025-06-15T08:00:00", endAt: "2025-06-15T10:00:00" }),
      makeBooking({ id: "b2", startAt: "2025-06-15T09:00:00", endAt: "2025-06-15T11:00:00" }),
    ];
    const blocks = computeBlocks(bookings, DATE);
    // b1 occupies 08:00–10:00; cursor moves to 10:00
    // b2's clipped start is max(09:00, cursor=10:00) = 10:00, so it abuts b1 with no free gap
    const bookedBlocks = blocks.filter(b => b.type === "booked");
    expect(bookedBlocks).toHaveLength(2);
    // No free block between the two booked blocks
    const firstBookedIdx = blocks.findIndex(b => b.type === "booked");
    expect(blocks[firstBookedIdx + 1].type).toBe("booked");
  });

  it("a booking ending exactly at day start is excluded (end <= windowStart)", () => {
    const booking = makeBooking({
      startAt: "2025-06-14T22:00:00",
      endAt:   "2025-06-15T00:00:00", // ends exactly at day boundary
    });
    const blocks = computeBlocks([booking], DATE);
    expect(blocks.every(b => b.type === "free")).toBe(true);
  });

  it("a booking starting exactly at day end is excluded (start >= windowEnd)", () => {
    const booking = makeBooking({
      startAt: "2025-06-16T00:00:00",
      endAt:   "2025-06-16T02:00:00",
    });
    const blocks = computeBlocks([booking], DATE);
    expect(blocks.every(b => b.type === "free")).toBe(true);
  });

  it("a single booking filling the entire day leaves no free blocks", () => {
    const booking = makeBooking({
      startAt: "2025-06-15T00:00:00",
      endAt:   "2025-06-16T00:00:00",
    });
    const blocks = computeBlocks([booking], DATE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("booked");
  });
});

// ── roundUpTo15 ──────────────────────────────────────────────────────────────

describe("roundUpTo15", () => {
  it("returns the same Date when already on a 15-minute boundary", () => {
    const d = new Date("2025-06-15T10:15:00.000Z");
    expect(roundUpTo15(d).getTime()).toBe(d.getTime());
  });

  it("rounds up to the next 15-minute mark when 1ms past a boundary", () => {
    const d = new Date("2025-06-15T10:15:00.001Z");
    const expected = new Date("2025-06-15T10:30:00.000Z");
    expect(roundUpTo15(d).getTime()).toBe(expected.getTime());
  });

  it("rounds up from 1 minute past the hour to :15", () => {
    const d = new Date("2025-06-15T10:01:00.000Z");
    const expected = new Date("2025-06-15T10:15:00.000Z");
    expect(roundUpTo15(d).getTime()).toBe(expected.getTime());
  });

  it("rounds up from 14 minutes past to the next :15", () => {
    const d = new Date("2025-06-15T10:14:00.000Z");
    const expected = new Date("2025-06-15T10:15:00.000Z");
    expect(roundUpTo15(d).getTime()).toBe(expected.getTime());
  });

  it("handles midnight boundary — exactly midnight returns midnight", () => {
    const d = new Date("2025-06-15T00:00:00.000Z");
    expect(roundUpTo15(d).getTime()).toBe(d.getTime());
  });

  it("1ms before :45 rounds up to :45", () => {
    const d = new Date("2025-06-15T10:44:59.999Z");
    const expected = new Date("2025-06-15T10:45:00.000Z");
    expect(roundUpTo15(d).getTime()).toBe(expected.getTime());
  });
});

// ── slotsInRange ─────────────────────────────────────────────────────────────

describe("slotsInRange", () => {
  it("returns the correct number of slots for a 1-hour range (4 slots)", () => {
    const start = new Date("2025-06-15T08:00:00.000Z");
    const end   = new Date("2025-06-15T09:00:00.000Z");
    const slots = slotsInRange(start, end);
    expect(slots).toHaveLength(4);
  });

  it("first slot equals start", () => {
    const start = new Date("2025-06-15T08:00:00.000Z");
    const end   = new Date("2025-06-15T09:00:00.000Z");
    const slots = slotsInRange(start, end);
    expect(slots[0].getTime()).toBe(start.getTime());
  });

  it("stops before end — last slot is end minus 15 min", () => {
    const start = new Date("2025-06-15T08:00:00.000Z");
    const end   = new Date("2025-06-15T09:00:00.000Z");
    const slots = slotsInRange(start, end);
    const last = slots[slots.length - 1];
    expect(last.getTime()).toBe(new Date("2025-06-15T08:45:00.000Z").getTime());
  });

  it("returns empty array when start equals end", () => {
    const t = new Date("2025-06-15T10:00:00.000Z");
    expect(slotsInRange(t, t)).toHaveLength(0);
  });

  it("returns empty array when start is after end", () => {
    const start = new Date("2025-06-15T11:00:00.000Z");
    const end   = new Date("2025-06-15T10:00:00.000Z");
    expect(slotsInRange(start, end)).toHaveLength(0);
  });

  it("returns exactly 1 slot for a 15-minute range", () => {
    const start = new Date("2025-06-15T10:00:00.000Z");
    const end   = new Date("2025-06-15T10:15:00.000Z");
    const slots = slotsInRange(start, end);
    expect(slots).toHaveLength(1);
    expect(slots[0].getTime()).toBe(start.getTime());
  });

  it("slots are 15 minutes apart", () => {
    const start = new Date("2025-06-15T08:00:00.000Z");
    const end   = new Date("2025-06-15T09:00:00.000Z");
    const slots = slotsInRange(start, end);
    const fifteen = 15 * 60 * 1000;
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].getTime() - slots[i - 1].getTime()).toBe(fifteen);
    }
  });
});

// ── windowForDate ────────────────────────────────────────────────────────────

describe("windowForDate", () => {
  it("start is midnight (00:00:00.000) on the given date", () => {
    const { start } = windowForDate(DATE);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(5); // June = index 5
    expect(start.getDate()).toBe(15);
  });

  it("end is midnight (00:00:00.000) on the next date", () => {
    const { end } = windowForDate(DATE);
    // end is exactly 24 hours after start
    const { start } = windowForDate(DATE);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("start and end differ by exactly 24 hours", () => {
    const { start, end } = windowForDate("2025-01-31");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("works at a year boundary", () => {
    const { start, end } = windowForDate("2025-12-31");
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(11);
    expect(start.getDate()).toBe(31);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

// ── fmtDuration ──────────────────────────────────────────────────────────────

describe("fmtDuration", () => {
  it("returns '0 min' for 0 ms", () => {
    expect(fmtDuration(0)).toBe("0 min");
  });

  it("returns '0 min' for negative ms", () => {
    expect(fmtDuration(-5000)).toBe("0 min");
  });

  it("returns minutes only when less than an hour", () => {
    expect(fmtDuration(30 * 60 * 1000)).toBe("30 min");
  });

  it("returns '1 min' for 60 000 ms", () => {
    expect(fmtDuration(60 * 1000)).toBe("1 min");
  });

  it("returns hours only when there are no remaining minutes", () => {
    expect(fmtDuration(2 * 60 * 60 * 1000)).toBe("2 h");
  });

  it("returns '1 h' for exactly one hour", () => {
    expect(fmtDuration(60 * 60 * 1000)).toBe("1 h");
  });

  it("returns mixed 'Xh Ym' for durations with both hours and minutes", () => {
    expect(fmtDuration((1 * 60 + 30) * 60 * 1000)).toBe("1 h 30 min");
  });

  it("rounds to the nearest minute", () => {
    // 90 minutes + 29 seconds → rounds to 90 min → 1 h 30 min
    expect(fmtDuration((90 * 60 + 29) * 1000)).toBe("1 h 30 min");
    // 90 minutes + 30 seconds → rounds to 91 min → 1 h 31 min
    expect(fmtDuration((90 * 60 + 30) * 1000)).toBe("1 h 31 min");
  });
});

// ── parseLocalDate ───────────────────────────────────────────────────────────

describe("parseLocalDate", () => {
  it("parses a standard date string", () => {
    const d = parseLocalDate("2025-06-15");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(5);   // 0-indexed
    expect(d.getDate()).toBe(15);
  });

  it("handles month boundaries (Jan 31)", () => {
    const d = parseLocalDate("2025-01-31");
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(31);
  });

  it("handles year start", () => {
    const d = parseLocalDate("2026-01-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("returns a Date object", () => {
    expect(parseLocalDate("2025-06-15")).toBeInstanceOf(Date);
  });
});

// ── addDays ──────────────────────────────────────────────────────────────────

describe("addDays", () => {
  it("adds days within the same month", () => {
    expect(addDays("2025-06-15", 5)).toBe("2025-06-20");
  });

  it("crosses a month boundary", () => {
    expect(addDays("2025-06-28", 5)).toBe("2025-07-03");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2025-12-28", 5)).toBe("2026-01-02");
  });

  it("handles negative days", () => {
    expect(addDays("2025-06-15", -10)).toBe("2025-06-05");
  });

  it("handles negative days crossing a month boundary", () => {
    expect(addDays("2025-06-03", -5)).toBe("2025-05-29");
  });

  it("returns the same date for 0", () => {
    expect(addDays("2025-06-15", 0)).toBe("2025-06-15");
  });

  it("pads single-digit month and day", () => {
    expect(addDays("2025-01-01", 0)).toBe("2025-01-01");
  });
});

// ── minutesFromMidnight ──────────────────────────────────────────────────────

describe("minutesFromMidnight", () => {
  it("returns 0 at midnight", () => {
    const d = new Date(2025, 5, 15, 0, 0, 0);
    expect(minutesFromMidnight(d)).toBe(0);
  });

  it("returns 60 at 1:00am", () => {
    const d = new Date(2025, 5, 15, 1, 0, 0);
    expect(minutesFromMidnight(d)).toBe(60);
  });

  it("returns 750 at 12:30pm", () => {
    const d = new Date(2025, 5, 15, 12, 30, 0);
    expect(minutesFromMidnight(d)).toBe(750);
  });

  it("returns 1439 at 23:59", () => {
    const d = new Date(2025, 5, 15, 23, 59, 0);
    expect(minutesFromMidnight(d)).toBe(1439);
  });
});

// ── fmtTime ──────────────────────────────────────────────────────────────────

describe("fmtTime", () => {
  it("returns a time string in 12-hour format", () => {
    const d = new Date("2025-06-15T14:30:00Z");
    const result = fmtTime(d, "UTC");
    expect(result).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
  });

  it("reflects the correct time for UTC noon", () => {
    const d = new Date("2025-06-15T12:00:00Z");
    expect(fmtTime(d, "UTC")).toMatch(/12:00\s*PM/i);
  });

  it("adjusts for timezone offset", () => {
    // UTC midnight = 8pm (20:00) on prior day in America/New_York (UTC-4 summer)
    const d = new Date("2025-06-15T00:00:00Z");
    const utc    = fmtTime(d, "UTC");
    const eastern = fmtTime(d, "America/New_York");
    expect(utc).not.toBe(eastern);
  });
});

// ── fmtDate ──────────────────────────────────────────────────────────────────

describe("fmtDate", () => {
  it("returns a string with weekday, month, and day", () => {
    const d = new Date("2025-06-15T12:00:00Z");
    const result = fmtDate(d, "UTC");
    // e.g. "Sun, Jun 15"
    expect(result).toMatch(/[A-Z][a-z]{2},\s+[A-Z][a-z]{2}\s+\d{1,2}/);
  });
});

// ── fmtDateShort ─────────────────────────────────────────────────────────────

describe("fmtDateShort", () => {
  it("returns a short month + day string", () => {
    const result = fmtDateShort("2025-06-15T12:00:00Z", "UTC");
    // e.g. "Jun 15"
    expect(result).toMatch(/[A-Z][a-z]{2}\s+\d{1,2}/);
  });

  it("produces different output for different dates", () => {
    const a = fmtDateShort("2025-06-15T12:00:00Z", "UTC");
    const b = fmtDateShort("2025-07-04T12:00:00Z", "UTC");
    expect(a).not.toBe(b);
  });
});
