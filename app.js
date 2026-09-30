const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PALETTE = ["#b45309", "#0f766e", "#7c3aed", "#be123c", "#0369a1", "#4d7c0f", "#a16207"];

const state = {
  user: null,
  categories: [],
  logs: [],
  goals: [],
  activeCategoryId: null,
  signupMode: false,
};

let eventsBound = false;

// ---------- 起動・認証 ----------

async function init() {
  bindAuthEvents();

  const { data } = await client.auth.getSession();
  await handleSession(data.session);

  // ログイン・ログアウトが起きたら画面を切り替える
  client.auth.onAuthStateChange((_event, session) => {
    // コールバック内で直接awaitするとデッドロックする場合があるので、setTimeoutで逃がす
    setTimeout(() => handleSession(session), 0);
  });
}

let sessionHandled = false;

async function handleSession(session) {
  const newUserId = session?.user?.id ?? null;
  const currentUserId = state.user?.id ?? null;
  // 初回は必ず画面を決める。2回目以降は、ユーザーが変わらないとき（トークン更新など）は何もしない
  if (sessionHandled && newUserId === currentUserId) return;
  sessionHandled = true;

  if (!session) {
    state.user = null;
    state.categories = [];
    state.logs = [];
    state.goals = [];
    showAuth();
    return;
  }

  state.user = session.user;
  await startApp();
}

function showAuth() {
  document.getElementById("auth-panel").classList.remove("hidden");
  document.getElementById("app-root").classList.add("hidden");
  document.getElementById("user-bar").classList.add("hidden");
}

async function startApp() {
  document.getElementById("auth-panel").classList.add("hidden");
  document.getElementById("app-root").classList.remove("hidden");
  document.getElementById("user-bar").classList.remove("hidden");

  await Promise.all([loadProfile(), loadCategories(), loadLogs(), loadGoals()]);
  renderAll();

  if (!eventsBound) {
    bindAppEvents();
    eventsBound = true;
  }
}

async function loadProfile() {
  const { data } = await client
    .from("profiles")
    .select("display_name")
    .eq("id", state.user.id)
    .single();
  document.getElementById("user-name").textContent = data?.display_name || "";
}

function bindAuthEvents() {
  document.getElementById("auth-toggle").addEventListener("click", () => {
    state.signupMode = !state.signupMode;
    document.getElementById("auth-title").textContent = state.signupMode ? "アカウントを作る" : "ログイン";
    document.getElementById("auth-submit").textContent = state.signupMode ? "登録する" : "ログイン";
    document.getElementById("auth-toggle").textContent = state.signupMode
      ? "すでにアカウントをお持ちの方はログイン"
      : "はじめての方はアカウントを作る";
    document.getElementById("auth-display-name").classList.toggle("hidden", !state.signupMode);
    document.getElementById("auth-password2").classList.toggle("hidden", !state.signupMode);
    document.getElementById("auth-password2").value = "";
    document.getElementById("auth-password").autocomplete = state.signupMode ? "new-password" : "current-password";
    document.getElementById("auth-feedback").textContent = "";
  });

  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const displayName = document.getElementById("auth-display-name").value.trim();
    const feedback = document.getElementById("auth-feedback");
    feedback.textContent = "";

    if (state.signupMode) {
      const password2 = document.getElementById("auth-password2").value;
      if (password !== password2) {
        return (feedback.textContent = "パスワードが一致しません。もう一度確認してください");
      }
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: location.origin + location.pathname,
        },
      });
      if (error) return (feedback.textContent = authErrorMessage(error));
      if (!data.session) {
        feedback.textContent = "確認メールを送りました。メール内のリンクを開いてから、ログインしてください。";
      }
    } else {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) return (feedback.textContent = authErrorMessage(error));
    }
  });

  document.getElementById("google-btn").addEventListener("click", async () => {
    const feedback = document.getElementById("auth-feedback");
    feedback.textContent = "";
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) feedback.textContent = "Googleでのログインを開始できませんでした";
  });

  document.getElementById("signout-btn").addEventListener("click", async () => {
    await client.auth.signOut();
  });
}

function authErrorMessage(error) {
  const msg = error.message || "";
  if (msg.includes("Invalid login credentials")) return "メールアドレスまたはパスワードが違います";
  if (msg.includes("Email not confirmed")) return "メールの確認がまだです。届いたメールのリンクを開いてください";
  if (msg.includes("already registered")) return "このメールアドレスは登録済みです。ログインしてください";
  if (msg.includes("Password should be")) return "パスワードは8文字以上にしてください";
  if (msg.includes("rate limit")) return "短時間に操作しすぎました。少し待ってからもう一度試してください";
  return msg;
}

// ---------- データ読み込み（自分のデータだけ） ----------

async function loadCategories() {
  const { data, error } = await client
    .from("categories")
    .select("id, name, is_public, created_at")
    .eq("user_id", state.user.id)
    .order("created_at", { ascending: true });
  if (error) return showError("categories", error);
  state.categories = data || [];
}

async function loadLogs() {
  const { data, error } = await client
    .from("logs")
    .select("id, content, logged_at, category_id, categories(name, is_public)")
    .eq("user_id", state.user.id)
    .order("logged_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return showError("logs", error);
  state.logs = data || [];
}

async function loadGoals() {
  const { data, error } = await client
    .from("goals")
    .select("id, title, target_date, status, category_id, categories(name, is_public)")
    .eq("user_id", state.user.id)
    .order("target_date", { ascending: true });
  if (error) return showError("goals", error);
  state.goals = data || [];
}

function showError(what, error) {
  console.error(`[Conatus] ${what}でエラー:`, error);
}

function renderAll() {
  renderStats();
  renderCategorySelects();
  renderTagFilter();
  renderTimeline();
  renderGoals();
  renderAchievedGoals();
  renderCategoryManager();
}

// ---------- 統計 ----------

function renderStats() {
  const el = document.getElementById("stats");
  const totalLogs = state.logs.length;
  const achievedGoals = state.goals.filter((g) => g.status === "done").length;
  const streak = calcStreakDays(state.logs);

  el.innerHTML = `
    ${statCard(totalLogs, "学習ログ")}
    ${statCard(achievedGoals, "達成した目標")}
    ${statCard(streak, "連続記録日数")}
  `;
}

function statCard(value, label) {
  return `
    <div class="stat-card">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>
  `;
}

function calcStreakDays(logs) {
  if (logs.length === 0) return 0;
  const dates = [...new Set(logs.map((l) => l.logged_at))].sort().reverse();
  let streak = 1;
  for (let i = 0; i < dates.length - 1; i++) {
    const diffDays = Math.round((parseLocalDate(dates[i]) - parseLocalDate(dates[i + 1])) / 86400000);
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ---------- カテゴリ ----------

function categoryColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function renderCategorySelects() {
  const logSelect = document.getElementById("log-category");
  const goalSelect = document.getElementById("goal-category");

  const options = state.categories
    .map((c) => `<option value="${c.id}">${c.is_public ? "🌐 " : "🔒 "}${escapeHtml(c.name)}</option>`)
    .join("");

  logSelect.innerHTML = `<option value="" disabled ${state.categories.length ? "" : "selected"}>カテゴリを選ぶ</option>${options}`;
  goalSelect.innerHTML = `<option value="">カテゴリなし</option>${options}`;
}

function categoryTag(cat) {
  if (!cat) return "";
  return `<span class="log-tag" style="color:${categoryColor(cat.name)}">${cat.is_public ? "🌐" : "🔒"} ${escapeHtml(cat.name)}</span>`;
}

// ---------- タグ絞り込み & タイムライン ----------

function renderTagFilter() {
  const el = document.getElementById("tag-filter");
  const usedCategoryIds = [...new Set(state.logs.map((l) => l.category_id).filter(Boolean))];
  const usedCategories = state.categories.filter((c) => usedCategoryIds.includes(c.id));

  const buttons = [
    `<button class="tag-button ${state.activeCategoryId === null ? "active" : ""}" data-id="">すべて</button>`,
    ...usedCategories.map(
      (c) =>
        `<button class="tag-button ${state.activeCategoryId === c.id ? "active" : ""}" data-id="${c.id}">${escapeHtml(c.name)}</button>`
    ),
  ];
  el.innerHTML = buttons.join("");

  el.querySelectorAll(".tag-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeCategoryId = btn.dataset.id || null;
      renderTagFilter();
      renderTimeline();
    });
  });
}

function renderTimeline() {
  const el = document.getElementById("timeline");
  const filtered = state.activeCategoryId
    ? state.logs.filter((l) => l.category_id === state.activeCategoryId)
    : state.logs;

  if (filtered.length === 0) {
    el.innerHTML = `<p class="empty">まだ学習ログがありません。上のフォームから記録してみよう</p>`;
    return;
  }

  el.innerHTML = filtered
    .map(
      (log) => `
      <article class="log-card">
        <div class="log-card-head">
          <div class="log-date">${formatDate(log.logged_at)}</div>
          <button type="button" class="delete-btn" data-delete-log="${log.id}">削除</button>
        </div>
        <p class="log-content">${escapeHtml(log.content)}</p>
        <div class="log-tags">${categoryTag(log.categories)}</div>
      </article>
    `
    )
    .join("");

  el.querySelectorAll("[data-delete-log]").forEach((btn) => {
    btn.addEventListener("click", () => deleteLog(btn.dataset.deleteLog));
  });
}

async function deleteLog(id) {
  if (!confirm("この記録を削除しますか？（元に戻せません）")) return;
  const { error } = await client.from("logs").delete().eq("id", id);
  if (error) return showError("log削除", error);
  await loadLogs();
  renderStats();
  renderTagFilter();
  renderTimeline();
  renderCategoryManager();
}

// ---------- カテゴリ管理 ----------

function renderCategoryManager() {
  const el = document.getElementById("category-manager");
  if (state.categories.length === 0) {
    el.innerHTML = `<p class="empty">カテゴリはまだありません</p>`;
    return;
  }
  el.innerHTML = state.categories
    .map((c) => {
      const count = state.logs.filter((l) => l.category_id === c.id).length;
      return `
      <div class="cat-row">
        <div class="cat-row-info">${categoryTag(c)}<span class="cat-row-count">記録 ${count}件</span></div>
        <button type="button" class="delete-btn" data-delete-category="${c.id}">削除</button>
      </div>`;
    })
    .join("");
  el.querySelectorAll("[data-delete-category]").forEach((btn) => {
    btn.addEventListener("click", () => deleteCategory(btn.dataset.deleteCategory));
  });
}

async function deleteCategory(id) {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat) return;
  const count = state.logs.filter((l) => l.category_id === id).length;
  const msg = `カテゴリ「${cat.name}」を削除しますか？\nこのカテゴリの記録 ${count}件 も一緒に削除されます（元に戻せません）。\n※このカテゴリの目標は残り、カテゴリなしになります。`;
  if (!confirm(msg)) return;
  const { error } = await client.from("categories").delete().eq("id", id);
  if (error) return showError("category削除", error);
  if (state.activeCategoryId === id) state.activeCategoryId = null;
  await Promise.all([loadCategories(), loadLogs(), loadGoals()]);
  renderAll();
}

// ---------- 目標 ----------

function renderGoals() {
  const el = document.getElementById("goals");
  const active = state.goals.filter((g) => g.status !== "done");

  if (active.length === 0) {
    el.innerHTML = `<p class="empty">設定中の目標はありません</p>`;
    return;
  }

  el.innerHTML = active.map((g) => goalCard(g)).join("");

  el.querySelectorAll(".goal-status-btn").forEach((btn) => {
    btn.addEventListener("click", () => cycleGoalStatus(btn.dataset.id, btn.dataset.status));
  });
  bindGoalDeleteButtons(el);
}

function bindGoalDeleteButtons(root) {
  root.querySelectorAll("[data-delete-goal]").forEach((btn) => {
    btn.addEventListener("click", () => deleteGoal(btn.dataset.deleteGoal));
  });
}

async function deleteGoal(id) {
  const goal = state.goals.find((g) => g.id === id);
  if (!goal) return;
  if (!confirm(`目標「${goal.title}」を削除しますか？（元に戻せません）`)) return;
  const { error } = await client.from("goals").delete().eq("id", id);
  if (error) return showError("goal削除", error);
  await loadGoals();
  renderGoals();
  renderAchievedGoals();
  renderStats();
}

function goalCard(g) {
  const daysLeft = g.target_date ? calcDaysLeft(g.target_date) : null;
  const overdue = daysLeft !== null && daysLeft < 0;
  const statusLabel = { not_started: "未着手", in_progress: "進行中", done: "完了" }[g.status] || g.status;

  return `
    <div class="goal-card ${overdue ? "overdue" : ""}">
      <div class="goal-main">
        <div class="goal-title">${escapeHtml(g.title)}</div>
        <div class="goal-meta">
          ${g.target_date ? `<span>${formatDate(g.target_date)}まで</span>` : ""}
          ${daysLeft !== null ? `<span class="goal-days">${overdue ? `${Math.abs(daysLeft)}日超過` : `残り${daysLeft}日`}</span>` : ""}
          ${categoryTag(g.categories)}
        </div>
      </div>
      <div class="goal-actions">
        <button class="goal-status-btn" data-id="${g.id}" data-status="${g.status}">${statusLabel}</button>
        <button type="button" class="delete-btn" data-delete-goal="${g.id}">削除</button>
      </div>
    </div>
  `;
}

function calcDaysLeft(targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseLocalDate(targetDate) - today) / 86400000);
}

async function cycleGoalStatus(id, current) {
  const order = ["not_started", "in_progress", "done"];
  const next = order[(order.indexOf(current) + 1) % order.length];
  const { error } = await client.from("goals").update({ status: next }).eq("id", id);
  if (error) return showError("goal更新", error);
  await loadGoals();
  renderGoals();
  renderAchievedGoals();
  renderStats();
}

function renderAchievedGoals() {
  const el = document.getElementById("achieved-goals");
  const done = state.goals.filter((g) => g.status === "done");
  if (done.length === 0) {
    el.innerHTML = `<p class="empty">まだ達成した目標はありません</p>`;
    return;
  }
  el.innerHTML = done
    .map(
      (g) => `
    <div class="skill-badge">
      <span class="dot"></span>
      <span>${escapeHtml(g.title)}</span>
      <button type="button" class="delete-btn" data-delete-goal="${g.id}">削除</button>
    </div>
  `
    )
    .join("");
  bindGoalDeleteButtons(el);
}

// ---------- アプリ内フォーム操作 ----------

function bindAppEvents() {
  document.getElementById("new-category-btn").addEventListener("click", () => {
    document.getElementById("new-category-row").classList.toggle("hidden");
  });

  document.getElementById("save-category-btn").addEventListener("click", async () => {
    const input = document.getElementById("new-category-name");
    const isPublic = document.getElementById("new-category-public").checked;
    const feedback = document.getElementById("log-feedback");
    const name = input.value.trim();
    if (!name) return;

    const { data, error } = await client
      .from("categories")
      .insert({ name, is_public: isPublic })
      .select("id, name, is_public, created_at")
      .single();
    if (error) {
      feedback.textContent = error.code === "23505" ? "同じ名前のカテゴリがすでにあります" : "カテゴリの追加に失敗しました";
      return showError("category作成", error);
    }
    state.categories.push(data);
    renderCategorySelects();
    renderCategoryManager();
    document.getElementById("log-category").value = data.id;
    input.value = "";
    document.getElementById("new-category-public").checked = false;
    document.getElementById("new-category-row").classList.add("hidden");
    feedback.textContent = "";
  });

  document.getElementById("log-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const categoryId = document.getElementById("log-category").value;
    const content = document.getElementById("log-content").value.trim();
    const feedback = document.getElementById("log-feedback");
    if (!categoryId || !content) return;

    const { error } = await client.from("logs").insert({
      category_id: categoryId,
      content,
      logged_at: todayLocal(),
    });
    if (error) {
      feedback.textContent = "記録に失敗しました。もう一度試してください";
      return showError("log作成", error);
    }
    document.getElementById("log-content").value = "";
    feedback.textContent = "記録しました！";
    setTimeout(() => (feedback.textContent = ""), 2000);

    await loadLogs();
    renderStats();
    renderTagFilter();
    renderTimeline();
    renderCategoryManager();
  });

  document.getElementById("new-goal-btn").addEventListener("click", () => {
    document.getElementById("goal-form").classList.toggle("hidden");
  });

  document.getElementById("goal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("goal-title").value.trim();
    const targetDate = document.getElementById("goal-date").value;
    const categoryId = document.getElementById("goal-category").value || null;
    if (!title || !targetDate) return;

    const { error } = await client.from("goals").insert({
      title,
      target_date: targetDate,
      category_id: categoryId,
      status: "not_started",
    });
    if (error) return showError("goal作成", error);

    document.getElementById("goal-title").value = "";
    document.getElementById("goal-date").value = "";
    document.getElementById("goal-form").classList.add("hidden");

    await loadGoals();
    renderGoals();
    renderAchievedGoals();
    renderStats();
  });
}

// ---------- ユーティリティ ----------

// "2026-09-30" を、タイムゾーンのずれなく「その日のローカル0時」として扱う
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// 今日の日付（端末のローカル時間ベース）を "YYYY-MM-DD" で返す
function todayLocal() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatDate(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
