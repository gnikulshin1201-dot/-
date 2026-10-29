"use strict";
window.ScheduleStore = (() => {
  const config = window.SCHEDULE_CONFIG || {};
  const url = (config.supabaseUrl || "").replace(/\/$/, "");
  const key = config.supabasePublishableKey || "";
  const configured =
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) &&
    /^(sb_publishable_|eyJ)/.test(key);
  const SESSION = "valentina-auth-v1";
  let session = null;
  let version = null;
  const offlineError =
    "Не удалось связаться с сервером. Проверьте подключение к интернету.";
  function remember(value) {
    session = value;
    try {
      if (value) sessionStorage.setItem(SESSION, JSON.stringify(value));
      else sessionStorage.removeItem(SESSION);
    } catch {
      /* The current tab still works without persistence. */
    }
  }
  async function request(path, options = {}, token) {
    let response;
    try {
      response = await fetch(url + path, {
        ...options,
        headers: {
          apikey: key,
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
    } catch {
      throw new Error(offlineError);
    }
    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? "Сеанс истёк. Войдите заново."
          : response.status === 429
            ? "Слишком много попыток. Попробуйте позже."
            : "Сервер отклонил запрос. Проверьте настройки доступа.",
      );
      error.status = response.status;
      try {
        error.code = (await response.json()).code;
      } catch {}
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  function accept(data) {
    if (!data.access_token || !data.refresh_token || !data.user?.id)
      throw new Error("Сервер вернул некорректный сеанс.");
    remember({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: { id: data.user.id, email: data.user.email },
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    });
  }
  async function token() {
    if (!session) throw new Error("Войдите, чтобы открыть расписание.");
    if (!session.expires_at || session.expires_at < Date.now() / 1000 + 60) {
      try {
        accept(
          await request("/auth/v1/token?grant_type=refresh_token", {
            method: "POST",
            body: JSON.stringify({ refresh_token: session.refresh_token }),
          }),
        );
      } catch (e) {
        if ([400, 401, 403].includes(e.status)) remember(null);
        throw e;
      }
    }
    return session.access_token;
  }
  return {
    configured,
    async login(email, password) {
      if (!configured) throw new Error("Сервис входа ещё не подключён.");
      try {
        accept(
          await request("/auth/v1/token?grant_type=password", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          }),
        );
      } catch (e) {
        if (e.code === "email_not_confirmed")
          throw new Error(
            "Подтвердите почту по ссылке в письме, затем войдите снова.",
          );
        if ([400, 401, 403].includes(e.status))
          throw new Error("Не удалось войти. Проверьте почту и пароль.");
        throw e;
      }
      version = null;
    },
    async register(email, password, displayName) {
      if (!configured) throw new Error("Сервис регистрации ещё не подключён.");
      let data;
      try {
        data = await request(
          "/auth/v1/signup?redirect_to=" +
            encodeURIComponent(location.origin + location.pathname),
          {
            method: "POST",
            body: JSON.stringify({
              email,
              password,
              data: { display_name: displayName || "" },
            }),
          },
        );
      } catch (e) {
        if (e.code === "signup_disabled")
          throw new Error(
            "Регистрация выключена в Supabase. Владелец проекта должен разрешить создание аккаунтов.",
          );
        if (e.code === "weak_password")
          throw new Error(
            "Пароль не соответствует требованиям сервиса. Используйте более длинный и сложный пароль.",
          );
        if ([400, 422].includes(e.status))
          throw new Error(
            "Не удалось зарегистрироваться. Проверьте почту и пароль. Если аккаунт уже есть, попробуйте войти.",
          );
        throw e;
      }
      version = null;
      if (data.access_token) {
        accept(data);
        return true;
      }
      return false;
    },
    async restore() {
      if (!configured) return false;
      try {
        const stored = JSON.parse(sessionStorage.getItem(SESSION));
        if (!stored?.refresh_token || !stored?.user?.id) return false;
        session = stored;
        await token();
        return true;
      } catch (e) {
        if (session && ![400, 401, 403].includes(e.status)) throw e;
        remember(null);
        return false;
      }
    },
    async load() {
      const access = await token();
      const rows = await request(
        `/rest/v1/schedules?user_id=eq.${encodeURIComponent(session.user.id)}&select=data,version`,
        {},
        access,
      );
      version = rows.length ? rows[0].version : null;
      return rows.length ? rows[0].data : [];
    },
    async save(data) {
      const access = await token();
      const creating = version === null;
      let rows;
      try {
        rows = await request(
          creating
            ? "/rest/v1/schedules"
            : `/rest/v1/schedules?user_id=eq.${encodeURIComponent(session.user.id)}&version=eq.${version}`,
          {
            method: creating ? "POST" : "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              user_id: session.user.id,
              data,
              version: creating ? 1 : version + 1,
            }),
          },
          access,
        );
      } catch (e) {
        if (e.status === 409)
          throw new Error(
            "Расписание изменилось в другой вкладке. Нажмите «Обновить», затем повторите изменение.",
          );
        throw e;
      }
      if (!rows?.length)
        throw new Error(
          "Расписание изменилось на другом устройстве. Нажмите «Обновить», затем повторите изменение.",
        );
      version = rows[0].version;
    },
    get userId() {
      return session?.user?.id;
    },
    async api(path, options = {}) {
      return request(path, options, await token());
    },
    async logout() {
      try {
        if (session)
          await request(
            "/auth/v1/logout?scope=local",
            { method: "POST" },
            await token(),
          );
      } finally {
        remember(null);
        version = null;
      }
    },
  };
})();
