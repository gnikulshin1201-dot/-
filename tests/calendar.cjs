const vm = require("node:vm"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync("calendar.js", "utf8"), ctx);
const c = ctx.window.ScheduleCalendar;
const d = (s) => new Date(s + "T12:00:00");
const key = (x) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
for (const [mode, date, start, end, count] of [
  ["week", "2026-11-01", "2026-10-26", "2026-11-01", 7],
  ["fortnight", "2026-12-28", "2026-12-28", "2027-01-10", 14],
  ["month", "2024-02-29", "2024-01-29", "2024-03-03", 35],
  ["month", "2021-02-10", "2021-02-01", "2021-02-28", 28],
  ["month", "2026-08-31", "2026-07-27", "2026-09-06", 42],
]) {
  const r = c.range(mode, d(date));
  assert.equal(key(r.start), start);
  assert.equal(key(r.end), end);
  assert.equal(r.count, count);
  assert.equal(r.start.getDay(), 1);
  assert.equal(r.end.getDay(), 0);
}
assert.equal(key(c.move("month", d("2026-12-31"), 1)), "2027-01-01");
assert.equal(key(c.move("month", d("2026-03-31"), -1)), "2026-02-01");
assert.equal(key(c.move("fortnight", d("2026-12-30"), 1)), "2027-01-11");
console.log(
  "PASS: week/fortnight/month ranges, leap February, 28/35/42 cells, Sunday anchoring, year and month navigation.",
);
