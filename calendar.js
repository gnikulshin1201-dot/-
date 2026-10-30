"use strict";
// Calendar arithmetic uses local noon to avoid daylight-saving boundary shifts.
window.ScheduleCalendar = (() => {
  const labels = { week: "Неделя", fortnight: "2 недели", month: "Месяц" };
  const day = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const monday = (date) => {
    const d = day(date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  };
  function range(mode, anchor) {
    let start = monday(anchor),
      count = mode === "fortnight" ? 14 : 7;
    if (mode === "month") {
      start = monday(new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12));
      const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
      const end = monday(last);
      end.setDate(end.getDate() + 6);
      count = Math.round((end - start) / 86400000) + 1;
    }
    const end = day(start);
    end.setDate(end.getDate() + count - 1);
    return { start, end, count };
  }
  function move(mode, anchor, direction) {
    if (mode === "month")
      return new Date(
        anchor.getFullYear(),
        anchor.getMonth() + direction,
        1,
        12,
      );
    const d = monday(anchor);
    d.setDate(d.getDate() + direction * (mode === "fortnight" ? 14 : 7));
    return d;
  }
  function title(mode, anchor) {
    if (mode === "month")
      return anchor.toLocaleDateString("ru-RU", {
        month: "long",
        year: "numeric",
      });
    const r = range(mode, anchor),
      format = (d) =>
        d.toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
    return `${format(r.start)} — ${format(r.end)}`;
  }
  function controls(mode, onChange) {
    const group = document.createElement("div");
    group.className = "calendar-views";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Период календаря");
    for (const [key, label] of Object.entries(labels)) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.dataset.view = key;
      b.setAttribute("aria-pressed", String(mode === key));
      b.onclick = () => onChange(key);
      group.append(b);
    }
    return group;
  }
  function sync(group, mode) {
    group
      .querySelectorAll("button")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.view === mode)),
      );
  }
  return { range, move, title, controls, sync };
})();
