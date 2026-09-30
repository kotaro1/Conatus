const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PALETTE = ["#b45309", "#0f766e", "#7c3aed", "#be123c", "#0369a1", "#4d7c0f", "#a16207"];

const state = {
  categories: [],
  logs: [],
  goals: [],
  activeCategoryId: null,
};

async function init() {
  await Promise.all([loadCategories(), loadLogs(), loadGoals()]);
  renderAll();
  bindEvents();
}

async function loadCategories() {
  const { data, error } = await client
    .from("categories")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return showError("categories", error);
  state.categories = data || [];
}

async function loadLogs() {
  const { data, error } = await client
    .from("logs")
    .select("id, content, logged_at, category_id, categories(name)")
    .order("logged_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return showError("logs", error);
  state.logs = data || [];
}

async function loadGoals() {
  const { data, error } = await client
    .from("goals")
    .select("id, title, target_date, status, category_id, categories(name)")
    .order("target_date", { ascending: true });
  if (error) return showError("goals", error);
  state.goals = data || [];
}

function showError(what, error) {
  console.error(`[Conatus] ${what}の読み込みに失敗:`, error);
}

function renderAll() {
  renderStats();
  renderCategorySelects();
  renderTagFilter();
  renderTimeline();
  renderGoals();
  renderAchievedGoals();
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
    const cur = new Date(dates[i]);
    const next = new Date(dates[i + 1]);
    const diffDays = Math.round((cur - next) / (1000 * 60 * 60 * 24));
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
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join("");

  logSelect.innerHTML = `<option value="" disabled ${state.categories.length ? "" : "selected"}>カテゴリを選ぶ</option>${options}`;
  goalSelect.innerHTML = `<option value="">カテゴリなし</option>${options}`;
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
    .map((log) => {
      const catName = log.categories?.name || "未分類";
      return `
      <article class="log-card">
        <div class="log-date">${formatDate(log.logged_at)}</div>
        <p class="log-content">${escapeHtml(log.content)}</p>
        <div class="log-tags">
          <span class="log-tag" style="color:${categoryColor(catName)}">${escapeHtml(catName)}</span>
        </div>
      </article>
    `;
    })
    .join("");
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
}

function goalCard(g) {
  const catName = g.categories?.name || null;
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
          ${catName ? `<span class="log-tag" style="color:${categoryColor(catName)}">${escapeHtml(catName)}</span>` : ""}
        </div>
      </div>
      <button class="goal-status-btn" data-id="${g.id}" data-status="${g.status}">${statusLabel}</button>
    </div>
  `;
}

function calcDaysLeft(targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

async function cycleGoalStatus(id, current) {
  const order = ["not_started", "in_progress", "done"];
  const next = order[(order.indexOf(current) + 1) % order.length];
  const { error } = await client.from("goals").update({ status: next }).eq("id", id);
  if (error) return showError("goals更新", error);
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
    </div>
  `
    )
    .join("");
}

// ---------- フォーム操作 ----------

function bindEvents() {
  document.getElementById("new-category-btn").addEventListener("click", () => {
    document.getElementById("new-category-row").classList.toggle("hidden");
  });

  document.getElementById("save-category-btn").addEventListener("click", async () => {
    const input = document.getElementById("new-category-name");
    const name = input.value.trim();
    if (!name) return;
    const { data, error } = await client.from("categories").insert({ name }).select().single();
    if (error) return showError("category作成", error);
    state.categories.push(data);
    renderCategorySelects();
    document.getElementById("log-category").value = data.id;
    input.value = "";
    document.getElementById("new-category-row").classList.add("hidden");
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
      logged_at: new Date().toISOString().slice(0, 10),
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

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
