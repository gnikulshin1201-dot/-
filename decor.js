"use strict";
window.ClassroomDecor = (() => {
  const authors = [
    {
      name: "Александр Пушкин",
      short: "А. С. Пушкин",
      years: "1799–1837",
      file: "pushkin",
      book: "Евгений Онегин",
    },
    {
      name: "Михаил Лермонтов",
      short: "М. Ю. Лермонтов",
      years: "1814–1841",
      file: "lermontov",
      book: "Герой нашего времени",
    },
    {
      name: "Фёдор Достоевский",
      short: "Ф. М. Достоевский",
      years: "1821–1881",
      file: "dostoevsky",
      book: "Преступление и наказание",
    },
  ];
  function element(tag, text, className) {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (className) e.className = className;
    return e;
  }
  function gallery(compact = false) {
    const aside = element(
      "aside",
      null,
      "writers-gallery" + (compact ? " compact" : ""),
    );
    aside.setAttribute("aria-label", "Литературная гостиная");
    const heading = element("p", "ЛИТЕРАТУРНАЯ ГОСТИНАЯ", "gallery-heading");
    aside.append(heading);
    const row = element("div", null, "writers-row");
    for (const author of authors) {
      const figure = element("figure", null, "writer");
      const frame = element("div", null, "portrait-frame");
      const img = element("img");
      img.src = `assets/${author.file}.jpg`;
      img.alt = `Портрет: ${author.name}`;
      img.width = 240;
      img.height = 300;
      img.decoding = "async";
      frame.append(img);
      const caption = element("figcaption");
      caption.append(
        element("strong", author.short),
        element("span", author.years),
        element("cite", `«${author.book}»`),
      );
      figure.append(frame, caption);
      row.append(figure);
    }
    aside.append(
      row,
      element(
        "p",
        "Читаем внимательно. Думаем самостоятельно. Пишем осмысленно.",
        "gallery-motto",
      ),
    );
    return aside;
  }
  function notes() {
    const aside = element("aside", null, "language-notes");
    aside.setAttribute("aria-label", "На полях тетради");
    aside.append(element("p", "НА ПОЛЯХ ТЕТРАДИ", "eyebrow"));
    const grid = element("div", null, "notes-grid");
    for (const [number, title, text] of [
      [
        "01",
        "Произносим правильно",
        "Звони́т, догово́р, катало́г. Ударение тоже требует внимания.",
      ],
      [
        "02",
        "-тся или -ться?",
        "Что делает? — учится. Что делать? — учиться. Вопрос помогает выбрать написание.",
      ],
      [
        "03",
        "Читаем между строк",
        "Тема — о чём текст. Идея — какую мысль выражает автор. Подтверждайте свои выводы примерами из текста.",
      ],
    ]) {
      const card = element("article", null, "language-note");
      card.append(
        element("span", number, "note-number"),
        element("h3", title),
        element("p", text),
      );
      grid.append(card);
    }
    aside.append(grid);
    return aside;
  }
  function decorateIntro(intro) {
    if (intro.querySelector(".writers-gallery")) return;
    intro.classList.add("decorated-intro");
    intro.append(gallery(true));
  }
  const login = document.getElementById("login-panel");
  login.classList.add("decorated-login");
  const content = element("div", null, "login-content");
  while (login.firstChild) content.append(login.firstChild);
  login.append(content, gallery());
  const legacy = document.querySelector("#schedule-app .intro");
  if (legacy) decorateIntro(legacy);
  document.getElementById("schedule-app").append(notes());
  return { decorateIntro, notes };
})();
