"use strict";
window.LessonPortal = (() => {
  const store = window.ScheduleStore;
  const root = () => document.getElementById("portal-app");
  const node = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const button = (text, action, cls) => {
    const b = node("button", text, cls);
    b.type = "button";
    b.onclick = action;
    return b;
  };
  const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const monday = (key) => {
    const d = new Date(key + "T12:00:00");
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  };
  const mime = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  let profile,
    students = [],
    lessons = [],
    week = monday(today()),
    busy = false,
    generation = 0;
  let message, days, weekLabel;
  const api = (path, method = "GET", body, headers) =>
    store.api(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
    });
  const errorText = (e) =>
    e.code === "23P01"
      ? "Это время уже занято. Выберите другое время."
      : e.code === "P0001"
        ? "Ученик не найден. Сначала он должен зарегистрироваться с этой почтой."
        : e.message;
  const teacher = () => profile?.role === "teacher";
  function tell(text) {
    if (message) message.textContent = text;
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    root().setAttribute("aria-busy", "true");
    root()
      .querySelectorAll("button")
      .forEach((b) => (b.disabled = true));
    try {
      await action();
    } catch (e) {
      tell(errorText(e));
    } finally {
      busy = false;
      root().removeAttribute("aria-busy");
      root()
        .querySelectorAll("button")
        .forEach((b) => (b.disabled = false));
    }
  }
  function field(form, label, type, value, required = false) {
    const l = node("label", label);
    const input = node(
      type === "textarea" ? "textarea" : type === "select" ? "select" : "input",
    );
    if (!["textarea", "select"].includes(type)) input.type = type;
    input.required = required;
    if (value !== undefined) input.value = value;
    l.append(input);
    form.append(l);
    return input;
  }
  function dialog(title) {
    const d = node("dialog", undefined, "portal-dialog");
    const form = node("form");
    const h = node("div", undefined, "dialog-head");
    h.append(
      node("h2", title),
      button("×", () => {
        if (!d.dataset.saving) d.close();
      }),
    );
    h.lastChild.setAttribute("aria-label", "Закрыть");
    form.append(h);
    const error = node("p", "", "error");
    error.setAttribute("role", "alert");
    d.append(form);
    d.addEventListener("cancel", (e) => {
      if (d.dataset.saving) e.preventDefault();
    });
    d.addEventListener("close", () => d.remove());
    document.body.append(d);
    return { d, form, error };
  }
  function finishForm(view, action) {
    const submit = node("button", "Сохранить", "primary");
    submit.type = "submit";
    view.form.append(view.error, submit);
    view.form.onsubmit = async (e) => {
      e.preventDefault();
      if (view.d.dataset.saving) return;
      view.d.dataset.saving = "true";
      view.form.querySelectorAll("button").forEach((b) => (b.disabled = true));
      view.error.textContent = "";
      try {
        await action();
        view.d.close();
      } catch (e) {
        view.error.textContent = errorText(e);
      } finally {
        delete view.d.dataset.saving;
        view.form
          .querySelectorAll("button")
          .forEach((b) => (b.disabled = false));
      }
    };
    view.d.showModal();
  }
  async function refresh() {
    const epoch = generation;
    const to = new Date(week);
    to.setDate(to.getDate() + 6);
    const [profiles, rows] = await Promise.all([
      api(
        "/rest/v1/portal_profiles?select=id,display_name,role&order=display_name",
      ),
      api(
        `/rest/v1/portal_lessons?select=*&lesson_date=gte.${dateKey(week)}&lesson_date=lte.${dateKey(to)}&order=lesson_date,start_time`,
      ),
    ]);
    if (epoch !== generation) return;
    students = profiles.filter((p) => p.role === "student");
    lessons = rows;
    renderDays();
  }
  function studentName(id) {
    return (
      students.find((p) => p.id === id)?.display_name || "Имя ещё не указано"
    );
  }
  function renderDays() {
    if (!days) return;
    days.replaceChildren();
    const end = new Date(week);
    end.setDate(end.getDate() + 6);
    const fmt = (d) =>
      d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    weekLabel.textContent = `${fmt(week)} — ${fmt(end)}, ${end.getFullYear()}`;
    for (let i = 0; i < 7; i++) {
      const date = new Date(week);
      date.setDate(date.getDate() + i);
      const key = dateKey(date);
      const day = node(
        "section",
        undefined,
        "day" + (key === today() ? " is-today" : ""),
      );
      const heading = teacher()
        ? button("", () => newLesson(key), "day-title")
        : node("div", undefined, "day-title");
      heading.setAttribute(
        "aria-label",
        `${teacher() ? "Добавить занятие на " : ""}${date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`,
      );
      heading.append(
        node("span", date.toLocaleDateString("ru-RU", { weekday: "short" })),
        node("strong", String(date.getDate())),
      );
      day.append(heading);
      const items = lessons.filter((l) => l.lesson_date === key);
      if (!items.length) day.append(node("p", "Нет занятий", "empty"));
      if (teacher())
        day.addEventListener("click", (e) => {
          if (e.target === day || e.target.classList.contains("empty"))
            newLesson(key);
        });
      for (const lesson of items) {
        const card = node(
          "article",
          undefined,
          "lesson" + (lesson.subject === "Литература" ? " literature" : ""),
        );
        card.append(
          node(
            "div",
            `${lesson.start_time.slice(0, 5)} · ${lesson.duration} мин.`,
            "lesson-time",
          ),
          node("p", studentName(lesson.student_id), "student-name"),
          node("p", lesson.subject, "lesson-subject"),
          node("p", lesson.topic, "lesson-topic"),
          button(
            "Занятие и задание",
            () => run(() => lessonDetails(lesson)),
            "lesson-open",
          ),
        );
        if (lesson.homework)
          card.append(node("span", "Задание добавлено", "homework-badge"));
        day.append(card);
      }
      days.append(day);
    }
    document.getElementById("portal-students").textContent = teacher()
      ? `Учеников: ${students.length}`
      : "Ваши занятия и задания видны только вам и преподавателю.";
  }
  function newLesson(key) {
    if (!teacher() || busy) return;
    if (!students.length) {
      tell(
        "Сначала добавьте ученика по почте. Ученик должен зарегистрироваться на сайте.",
      );
      return;
    }
    const v = dialog("Новое занятие");
    const student = field(v.form, "Ученик", "select", undefined, true);
    students.forEach((p) => {
      const o = node("option", p.display_name || "Имя ещё не указано");
      o.value = p.id;
      student.append(o);
    });
    const date = field(v.form, "Дата", "date", key, true),
      time = field(v.form, "Начало (Москва)", "time", "10:00", true),
      duration = field(v.form, "Длительность, мин.", "number", "60", true);
    duration.min = "15";
    duration.max = "480";
    duration.step = "5";
    const subject = field(v.form, "Предмет", "select");
    ["Русский язык", "Литература"].forEach((s) =>
      subject.append(node("option", s)),
    );
    const topic = field(v.form, "Тема", "text", "", true);
    topic.maxLength = 120;
    finishForm(v, async () => {
      if (!topic.value.trim()) throw Error("Укажите тему занятия.");
      const rows = await api(
        "/rest/v1/portal_lessons",
        "POST",
        {
          teacher_id: store.userId,
          student_id: student.value,
          lesson_date: date.value,
          start_time: time.value,
          duration: Number(duration.value),
          subject: subject.value,
          topic: topic.value.trim(),
        },
        { Prefer: "return=representation" },
      );
      if (!rows?.length) throw Error("Занятие не сохранено.");
      await refresh();
      tell("Занятие добавлено.");
    });
  }
  async function fileList(lesson) {
    const files = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const page = await api("/storage/v1/object/list/homework", "POST", {
        prefix: lesson.id,
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      files.push(...page.filter((x) => x.id));
      if (page.length < 100) return files;
    }
    throw Error("Слишком много файлов для отображения.");
  }
  const originalName = (name) => name.replace(/^[0-9a-f-]{36}--/i, "");
  async function lessonDetails(lesson) {
    const epoch = generation;
    const files = await fileList(lesson);
    if (epoch !== generation) return;
    const v = dialog(lesson.topic);
    v.d.classList.add("lesson-details");
    v.form.append(
      node(
        "p",
        `${studentName(lesson.student_id)} · ${lesson.lesson_date.split("-").reverse().join(".")} · ${lesson.start_time.slice(0, 5)} (Москва)`,
        "lead",
      ),
    );
    let homework, attention;
    if (teacher()) {
      homework = field(v.form, "Домашнее задание", "textarea", lesson.homework);
      homework.maxLength = 10000;
      homework.rows = 6;
      attention = field(
        v.form,
        "На что обратить внимание",
        "textarea",
        lesson.attention,
      );
      attention.maxLength = 5000;
      attention.rows = 4;
    } else {
      v.form.append(
        node("h3", "Домашнее задание"),
        node(
          "p",
          lesson.homework || "Преподаватель ещё не добавил задание.",
          "homework-text",
        ),
        node("h3", "На что обратить внимание"),
        node(
          "p",
          lesson.attention || "Пока нет комментариев.",
          "homework-text",
        ),
      );
    }
    v.form.append(node("h3", "Файлы к занятию"));
    const list = node("div", undefined, "attachment-list");
    v.form.append(list);
    const fileError = node("p", "", "error");
    fileError.setAttribute("role", "alert");
    v.form.append(fileError);
    const renderFiles = (items) => {
      list.replaceChildren();
      if (!items.length)
        list.append(node("p", "Файлов пока нет.", "storage-note"));
      for (const file of items) {
        const row = node("div", undefined, "attachment");
        row.append(node("span", originalName(file.name)));
        row.append(
          button("Скачать", async (e) => {
            const b = e.currentTarget;
            b.disabled = true;
            try {
              const signed = await api(
                `/storage/v1/object/sign/homework/${lesson.id}/${encodeURIComponent(file.name)}`,
                "POST",
                { expiresIn: 60 },
              );
              const base = window.SCHEDULE_CONFIG.supabaseUrl.replace(
                /\/$/,
                "",
              );
              const href = base + "/storage/v1" + signed.signedURL;
              if (new URL(href).origin !== new URL(base).origin)
                throw Error("Неверный адрес файла.");
              const response = await fetch(href);
              if (!response.ok)
                throw Error("Не удалось скачать файл. Попробуйте ещё раз.");
              const objectUrl = URL.createObjectURL(await response.blob());
              const a = node("a");
              a.href = objectUrl;
              a.download = originalName(file.name);
              a.click();
              setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            } catch (e) {
              fileError.textContent = errorText(e);
            } finally {
              b.disabled = false;
            }
          }),
        );
        if (teacher())
          row.append(
            button("Удалить", async (e) => {
              if (!confirm("Удалить этот файл?")) return;
              const b = e.currentTarget;
              b.disabled = true;
              try {
                await api("/storage/v1/object/homework", "DELETE", {
                  prefixes: [`${lesson.id}/${file.name}`],
                });
                renderFiles(await fileList(lesson));
              } catch (e) {
                fileError.textContent = errorText(e);
                b.disabled = false;
              }
            }),
          );
        list.append(row);
      }
    };
    renderFiles(files);
    if (teacher()) {
      const upload = field(
        v.form,
        "Добавить файлы: фото, PDF, TXT, DOC/DOCX (до 10 МБ каждый)",
        "file",
      );
      upload.accept = ".jpg,.jpeg,.png,.webp,.pdf,.txt,.doc,.docx";
      upload.multiple = true;
      const uploadButton = button("Загрузить выбранные файлы", async () => {
        fileError.textContent = "";
        const chosen = [...upload.files];
        if (!chosen.length) {
          fileError.textContent = "Сначала выберите файлы.";
          return;
        }
        if (chosen.length > 10) {
          fileError.textContent = "За один раз можно загрузить до 10 файлов.";
          return;
        }
        for (const f of chosen) {
          const ext = f.name.split(".").pop().toLowerCase();
          if (!mime[ext] || f.size > 10485760 || f.size === 0) {
            fileError.textContent =
              "Допустимы непустые фото, PDF, TXT и DOC/DOCX до 10 МБ каждый.";
            return;
          }
        }
        uploadButton.disabled = true;
        upload.disabled = true;
        v.d.dataset.saving = "true";
        v.form.querySelector("button[type=submit]").disabled = true;
        try {
          for (const f of chosen) {
            const ext = f.name.split(".").pop().toLowerCase();
            const safeName = f.name
              .replace(/[^\p{L}\p{N}._ -]/gu, "_")
              .slice(-140);
            await store.api(
              `/storage/v1/object/homework/${lesson.id}/${encodeURIComponent(crypto.randomUUID() + "--" + safeName)}`,
              {
                method: "POST",
                headers: { "Content-Type": mime[ext], "x-upsert": "false" },
                body: f,
              },
            );
          }
          upload.value = "";
          renderFiles(await fileList(lesson));
          fileError.textContent = "Файлы загружены и доступны ученику.";
        } catch (e) {
          fileError.textContent =
            "Часть файлов могла загрузиться. " + errorText(e);
          try {
            renderFiles(await fileList(lesson));
          } catch {}
        } finally {
          delete v.d.dataset.saving;
          upload.disabled = false;
          uploadButton.disabled = false;
          v.form.querySelector("button[type=submit]").disabled = false;
        }
      });
      v.form.append(uploadButton);
      v.form.append(
        button(
          "Удалить занятие",
          async () => {
            if (
              v.d.dataset.saving ||
              !confirm(
                "Удалить занятие, его задание и все прикреплённые файлы?",
              )
            )
              return;
            v.d.dataset.saving = "true";
            v.form
              .querySelectorAll("button")
              .forEach((b) => (b.disabled = true));
            try {
              const attached = await fileList(lesson);
              if (attached.length)
                await api("/storage/v1/object/homework", "DELETE", {
                  prefixes: attached.map((f) => `${lesson.id}/${f.name}`),
                });
              const deleted = await api(
                `/rest/v1/portal_lessons?id=eq.${lesson.id}`,
                "DELETE",
                undefined,
                { Prefer: "return=representation" },
              );
              if (!deleted?.length)
                throw Error("Не удалось удалить занятие. Обновите расписание.");
              await refresh();
              v.d.close();
              tell("Занятие удалено.");
            } catch (e) {
              v.error.textContent = errorText(e);
            } finally {
              delete v.d.dataset.saving;
              v.form
                .querySelectorAll("button")
                .forEach((b) => (b.disabled = false));
            }
          },
          "delete",
        ),
      );

      finishForm(v, async () => {
        const updated = await api(
          `/rest/v1/portal_lessons?id=eq.${lesson.id}&version=eq.${lesson.version}`,
          "PATCH",
          { homework: homework.value, attention: attention.value },
          { Prefer: "return=representation" },
        );
        if (!updated?.length)
          throw Error(
            "Задание изменилось в другой вкладке. Закройте окно, обновите расписание и повторите.",
          );
        await refresh();
        tell("Задание сохранено и доступно ученику.");
      });
    } else {
      v.d.showModal();
    }
  }
  function enroll() {
    const v = dialog("Добавить ученика");
    v.form.append(
      node(
        "p",
        "Ученик сначала регистрируется на сайте и указывает имя. Затем добавьте его по той же почте.",
        "lead",
      ),
    );
    const email = field(v.form, "Почта ученика", "email", "", true);
    finishForm(v, async () => {
      await api("/rest/v1/rpc/portal_enroll_student", "POST", {
        student_email: email.value.trim(),
      });
      await refresh();
      tell("Ученик добавлен. Теперь можно назначить ему занятие.");
    });
  }
  function editName() {
    const v = dialog("Ваше имя");
    const name = field(
      v.form,
      "Как вас зовут",
      "text",
      profile.display_name,
      true,
    );
    name.maxLength = 120;
    finishForm(v, async () => {
      if (!name.value.trim()) throw Error("Введите имя.");
      await api(`/rest/v1/portal_profiles?id=eq.${store.userId}`, "PATCH", {
        display_name: name.value.trim(),
      });
      profile.display_name = name.value.trim();
      await refresh();
      document.getElementById("portal-greeting").textContent =
        profile.display_name;
    });
  }
  function build() {
    root().replaceChildren();
    const intro = node("section", undefined, "intro");
    intro.append(
      node(
        "p",
        teacher() ? "КАБИНЕТ ПРЕПОДАВАТЕЛЯ" : "КАБИНЕТ УЧЕНИКА",
        "eyebrow",
      ),
    );
    const h = node("h1", profile.display_name || "Добро пожаловать");
    h.id = "portal-greeting";
    intro.append(
      h,
      node(
        "p",
        teacher()
          ? "Ученики, занятия и домашние задания — в одном месте."
          : "Ваши занятия, задания и материалы от преподавателя.",
        "lead",
      ),
    );
    const controls = node("div", undefined, "account-bar");
    controls.append(
      button("Изменить имя", editName),
      button("Обновить", () =>
        run(async () => {
          await refresh();
          tell("Расписание обновлено.");
        }),
      ),
      button("Выйти", () =>
        run(async () => {
          generation++;
          try {
            await store.logout();
          } finally {
            document
              .querySelectorAll(".portal-dialog")
              .forEach((d) => d.remove());
            root().replaceChildren();
            root().hidden = true;
            document.getElementById("login-panel").hidden = false;
            document.getElementById("login-error").textContent = "";
            profile = null;
            students = [];
            lessons = [];
          }
        }),
      ),
    );
    intro.append(controls);
    root().append(intro);
    const planner = node("section", undefined, "planner");
    const toolbar = node("div", undefined, "toolbar");
    const heading = node("div");
    heading.append(
      node("p", "ВАШ ПЛАН", "eyebrow"),
      node("h2", "Расписание занятий"),
    );
    const count = node("p", "", "storage-note");
    count.id = "portal-students";
    heading.append(count);
    toolbar.append(heading);
    if (teacher()) {
      const buttons = node("div", undefined, "portal-actions");
      buttons.append(
        button("+ Ученик", enroll),
        button("+ Занятие", () => newLesson(today()), "primary"),
      );
      toolbar.append(buttons);
    }
    planner.append(toolbar);
    const nav = node("div", undefined, "week-nav");
    weekLabel = node("h3");
    nav.append(
      button("←", () =>
        run(async () => {
          week.setDate(week.getDate() - 7);
          await refresh();
        }),
      ),
      weekLabel,
      button("→", () =>
        run(async () => {
          week.setDate(week.getDate() + 7);
          await refresh();
        }),
      ),
      button("Сегодня", () =>
        run(async () => {
          week = monday(today());
          await refresh();
        }),
      ),
    );
    nav.firstChild.setAttribute("aria-label", "Предыдущая неделя");
    nav.children[2].setAttribute("aria-label", "Следующая неделя");
    nav.lastChild.id = "portal-today";
    planner.append(
      nav,
      node(
        "p",
        teacher()
          ? "Нажмите на дату для записи ученика. Время — московское (UTC+3)."
          : "Нажмите «Занятие и задание», чтобы открыть материалы. Время — московское (UTC+3).",
        "timezone",
      ),
    );
    days = node("div", undefined, "days");
    planner.append(days);
    message = node("p", "", "storage-note");
    message.setAttribute("role", "status");
    planner.append(message);
    root().append(planner);
    if (teacher()) {
      const legacy = node("section", undefined, "backup");
      legacy.append(
        node(
          "p",
          "Предыдущее личное расписание сохранено отдельно. Новые занятия с учениками создаются здесь.",
          "storage-note",
        ),
        button("Открыть прежнее расписание", () =>
          run(async () => {
            await window.loadLegacySchedule();
            root().hidden = true;
          }),
        ),
      );
      root().append(legacy);
    }
  }
  return {
    async start() {
      let profiles;
      try {
        profiles = await api(
          `/rest/v1/portal_profiles?id=eq.${store.userId}&select=id,display_name,role`,
        );
      } catch (e) {
        if (["PGRST205", "42P01"].includes(e.code)) return false;
        throw e;
      }
      if (!profiles.length)
        throw Error(
          "Профиль не найден. Необходимо завершить настройку базы кабинета.",
        );
      generation++;
      profile = profiles[0];
      week = monday(today());
      build();
      await refresh();
      document.getElementById("login-panel").hidden = true;
      document.getElementById("schedule-app").hidden = true;
      root().hidden = false;
      return true;
    },
  };
})();
