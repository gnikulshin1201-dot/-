const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const teacher = "10000000-0000-0000-0000-000000000001",
    anna = "20000000-0000-0000-0000-000000000001",
    ivan = "20000000-0000-0000-0000-000000000002";
  const profiles = [
    { id: teacher, role: "teacher", display_name: "Валентина" },
    { id: anna, role: "student", display_name: "Анна" },
    { id: ivan, role: "student", display_name: "Иван" },
  ];
  let lessons = [],
    files = [],
    signed = 0,
    uploads = 0;
  async function pageFor(id) {
    const p = await b.newPage();
    await p.route("https://*.supabase.co/**", async (r) => {
      const req = r.request(),
        u = new URL(req.url()),
        path = u.pathname;
      const send = (status, data) =>
        r.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (req.method() === "OPTIONS")
        return r.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "*",
          },
        });
      if (path === "/auth/v1/token")
        return send(200, {
          access_token: id,
          refresh_token: "test-refresh",
          expires_in: 3600,
          user: {
            id,
            email: id === teacher ? "teacher@example.com" : "anna@example.com",
          },
        });
      if (path === "/auth/v1/logout") return r.fulfill({ status: 204 });
      if (
        path.startsWith("/storage/v1/object/sign/homework/") &&
        req.method() === "GET"
      )
        return r.fulfill({
          status: 200,
          body: "Текст задания",
          contentType: "text/plain",
        });
      assert.equal(req.headers().authorization, "Bearer " + id);
      if (path === "/rest/v1/portal_profiles") {
        if (req.method() === "PATCH") {
          profiles.find((p) => p.id === id).display_name =
            req.postDataJSON().display_name;
          return r.fulfill({ status: 204 });
        }
        return send(
          200,
          u.searchParams.has("id")
            ? profiles.filter((p) => p.id === id)
            : profiles.filter((p) => id === teacher || p.id === id),
        );
      }
      if (path === "/rest/v1/portal_lessons") {
        if (req.method() === "DELETE") {
          assert.equal(id, teacher);
          const removed = lessons.filter(
            (l) => "eq." + l.id === u.searchParams.get("id"),
          );
          lessons = lessons.filter(
            (l) => "eq." + l.id !== u.searchParams.get("id"),
          );
          return send(200, removed);
        }
        if (req.method() === "POST") {
          assert.equal(id, teacher);
          const x = req.postDataJSON();
          lessons.push({
            ...x,
            id: crypto.randomUUID(),
            homework: "",
            attention: "",
            version: 1,
          });
          return send(201, [lessons.at(-1)]);
        }
        if (req.method() === "PATCH") {
          assert.equal(id, teacher);
          const x = lessons.find(
            (l) => "eq." + l.id === u.searchParams.get("id"),
          );
          if (u.searchParams.get("version") !== "eq." + x.version)
            return send(200, []);
          Object.assign(x, req.postDataJSON(), { version: x.version + 1 });
          return send(200, [x]);
        }
        const dates = u.searchParams.getAll("lesson_date");
        return send(
          200,
          lessons.filter(
            (l) =>
              (id === teacher || l.student_id === id) &&
              l.lesson_date >= dates[0].slice(4) &&
              l.lesson_date <= dates[1].slice(4),
          ),
        );
      }
      if (path === "/rest/v1/rpc/portal_enroll_student") {
        assert.equal(id, teacher);
        return send(200, ivan);
      }
      if (path === "/storage/v1/object/list/homework") {
        const prefix = req.postDataJSON().prefix;
        return send(
          200,
          files.filter((f) => f.lesson === prefix),
        );
      }
      if (path.startsWith("/storage/v1/object/sign/homework/")) {
        signed++;
        return send(200, {
          signedURL: "/object/sign/homework/file.txt?token=test",
        });
      }
      if (
        path.startsWith("/storage/v1/object/homework/") &&
        req.method() === "POST"
      ) {
        assert.equal(id, teacher);
        const parts = decodeURIComponent(path).split("/");
        assert.match(parts.at(-1), /^[a-f0-9-]+--u8-[a-f0-9]+\.[a-z0-9]+$/i);
        assert.ok(parts.at(-1).length < 1024);
        uploads++;
        files.push({
          id: crypto.randomUUID(),
          name: parts.at(-1),
          lesson: parts.at(-2),
        });
        return send(200, { Key: path });
      }
      if (path === "/storage/v1/object/homework" && req.method() === "DELETE") {
        const names = req.postDataJSON().prefixes;
        files = files.filter((f) => !names.includes(f.lesson + "/" + f.name));
        return send(200, []);
      }
      throw Error("Unhandled " + req.method() + " " + path);
    });
    await p.goto(process.env.SITE_URL || "http://127.0.0.1:8000");
    await p.locator("#email").fill("test@example.com");
    await p.locator("#password").fill("test-password");
    await p.locator("#login-submit").click();
    await p.locator("#portal-app").waitFor({ state: "visible" });
    return p;
  }
  const t = await pageFor(teacher);
  assert.match(
    await t.locator("#portal-app").innerText(),
    /КАБИНЕТ ПРЕПОДАВАТЕЛЯ/,
  );
  await t.locator("#portal-app .day-title").nth(3).click();
  await t
    .getByLabel("Тема", { exact: true })
    .fill("Сочинение <img src=x onerror=alert(1)>");
  const chosen = await t
    .locator(".portal-dialog")
    .getByLabel("Дата", { exact: true })
    .inputValue();
  await t.locator(".portal-dialog button[type=submit]").click();
  await t.waitForFunction(
    () => document.querySelectorAll("#portal-app .lesson").length === 1,
  );
  assert.equal(lessons[0].lesson_date, chosen);
  assert.match(await t.locator(".student-name").textContent(), /Анна/);
  assert.equal(await t.locator("#portal-app .lesson img").count(), 0);
  await t
    .locator("#portal-app .lesson")
    .filter({ hasText: "Анна" })
    .getByRole("button", { name: "Занятие и задание", exact: true })
    .click();
  await t
    .getByLabel("Домашнее задание", { exact: true })
    .fill("Прочитать текст и написать сочинение.");
  await t
    .getByLabel("На что обратить внимание", { exact: true })
    .fill("Проверить аргументацию.");
  await t.locator(".portal-dialog input[type=file]").setInputFiles({
    name: "Тайна_имени_Ксения_A4.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("Текст домашнего задания"),
  });
  await t.getByRole("button", { name: "Загрузить выбранные файлы" }).click();
  await t.waitForFunction(() =>
    document
      .querySelector(".attachment-list")
      .textContent.includes("Тайна_имени_Ксения_A4.pdf"),
  );
  assert.equal(uploads, 1);
  await t.locator(".portal-dialog button[type=submit]").click();
  await t.waitForFunction(() => document.querySelector(".homework-badge"));
  assert.match(lessons[0].attention, /аргументацию/);
  lessons.push({
    ...lessons[0],
    id: crypto.randomUUID(),
    student_id: ivan,
    start_time: "12:00",
    topic: "Чужое занятие",
    homework: "Чужое задание",
  });
  const s = await pageFor(anna);
  assert.equal(
    await s.getByRole("button", { name: "+ Занятие", exact: true }).count(),
    0,
  );
  assert.equal(await s.locator("#portal-app .lesson").count(), 1);
  assert.equal(await s.getByText("Чужое занятие", { exact: true }).count(), 0);
  await s
    .getByRole("button", { name: "Занятие и задание", exact: true })
    .click();
  assert.match(
    await s.locator(".portal-dialog").textContent(),
    /Прочитать текст/,
  );
  assert.match(
    await s.locator(".portal-dialog").textContent(),
    /Проверить аргументацию/,
  );
  assert.equal(await s.locator(".portal-dialog textarea").count(), 0);
  assert.equal(await s.locator(".portal-dialog input[type=file]").count(), 0);
  assert.equal(
    await s
      .locator(".portal-dialog")
      .getByRole("button", { name: "Удалить", exact: true })
      .count(),
    0,
  );
  const downloadPromise = s.waitForEvent("download");
  await s.getByRole("button", { name: "Скачать", exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "Тайна_имени_Ксения_A4.pdf");
  assert.equal(signed, 1);
  await s
    .locator(".portal-dialog")
    .getByRole("button", { name: "Закрыть", exact: true })
    .click();
  for (const p of [t, s])
    for (const width of [1440, 390, 320]) {
      await p.setViewportSize({ width, height: 900 });
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await p.screenshot({
        path: `/tmp/portal-${p === t ? "teacher" : "student"}-${width}.png`,
        fullPage: true,
      });
    }
  for (const page of [t, s]) {
    const views = page.locator("#portal-app .calendar-views");
    await views.getByRole("button", { name: "2 недели", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll("#portal-app .day").length === 14,
    );
    assert.equal(
      await views
        .getByRole("button", { name: "2 недели", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await views.getByRole("button", { name: "Месяц", exact: true }).click();
    await page.waitForFunction(() =>
      document
        .querySelector("#portal-app .days")
        .classList.contains("calendar-month"),
    );
    const count = await page.locator("#portal-app .day").count();
    assert.ok([28, 35, 42].includes(count));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await views.getByRole("button", { name: "Неделя", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelectorAll("#portal-app .day").length === 7,
    );
  }
  await s.getByRole("button", { name: "Выйти", exact: true }).click();
  await s.locator("#login-panel").waitFor({ state: "visible" });
  assert.equal(await s.locator("#portal-app .lesson").count(), 0);
  await t
    .locator("#portal-app .lesson")
    .filter({ hasText: "Анна" })
    .getByRole("button", { name: "Занятие и задание", exact: true })
    .click();
  t.once("dialog", (d) => d.accept());
  await t.getByRole("button", { name: "Удалить занятие", exact: true }).click();
  await t.waitForFunction(() => !document.querySelector(".portal-dialog"));
  assert.equal(files.length, 0);
  assert.equal(
    lessons.some((l) => l.student_id === anna),
    false,
  );
  console.log(
    "PASS: teacher creates lesson by date, student name, XSS text escaping, homework/attention, text upload, student own lessons, read-only student homework, signed download, lesson and attachment deletion, logout clearing, teacher/student layouts 1440/390/320. API mocked.",
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
