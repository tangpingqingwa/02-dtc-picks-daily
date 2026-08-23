import assert from "node:assert/strict";
import { test } from "node:test";
import { boardTimeZone, dayKey, formatIssueDate } from "../src/core/day.js";
import { formatFolioDate } from "../src/views/html.js";

test("BOARD_TZ unset defaults to UTC", () => {
  assert.equal(boardTimeZone(undefined), "UTC");
  assert.equal(boardTimeZone(""), "UTC");
  assert.equal(boardTimeZone("   "), "UTC");
  assert.equal(boardTimeZone("America/New_York"), "America/New_York");
});

test("dayKey is YYYY-MM-DD in BOARD_TZ", () => {
  const noonUtc = new Date("2026-08-23T12:00:00.000Z");
  assert.equal(dayKey(noonUtc, "UTC"), "2026-08-23");
  assert.equal(dayKey(new Date("2026-08-23T00:30:00.000Z"), "UTC"), "2026-08-23");
  assert.equal(dayKey(new Date("2026-08-23T00:30:00.000Z"), "America/New_York"), "2026-08-22");
});

test("yesterday is gone after midnight in BOARD_TZ", () => {
  const before = new Date("2026-08-22T23:59:00.000Z");
  const after = new Date("2026-08-23T00:01:00.000Z");
  assert.equal(dayKey(before, "UTC"), "2026-08-22");
  assert.equal(dayKey(after, "UTC"), "2026-08-23");
  assert.notEqual(dayKey(before, "UTC"), dayKey(after, "UTC"));
});

test("formatIssueDate prints the morning issue from the day key", () => {
  assert.equal(formatIssueDate("2026-08-23", "UTC"), "Sunday, August 23, 2026");
  assert.equal(formatFolioDate("2026-08-23"), "Aug 23, 2026");
  assert.equal(formatIssueDate("not-a-day"), "not-a-day");
  assert.equal(formatFolioDate("later"), "later");
});
