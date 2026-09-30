const state = {
  logs: [],
  skills: [],
  activeTag: null,
};

async function loadData() {
  const [logsRes, skillsRes] = await Promise.all([
    fetch("data/logs.json"),
    fetch("data/skills.json"),
  ]);
  state.logs = await logsRes.json();
  state.skills = await skillsRes.json();

  // 新しい日付が先頭に来るよう並び替え
  state.logs.sort((a, b) => (a.date < b.date ? 1 : -1));
  state.skills.sort((a, b) => (a.date < b.date ? 1 : -1));

  renderStats();
  renderSkills();
  renderTagFilter();
  renderTimeline();
}

function renderStats() {
  const el = document.getElementById("stats");
  const totalLogs = state.logs.length;
  const totalSkills = state.skills.length;
  const streak = calcStreakDays(state.logs);

  el.innerHTML = `
    ${statCard(totalLogs, "学習ログ")}
    ${statCard(totalSkills, "習得スキル")}
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
  const dates = [...new Set(logs.map((l) => l.date))].sort().reverse();
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

function renderSkills() {
  const el = document.getElementById("skills");
  if (state.skills.length === 0) {
    el.innerHTML = `<p class="empty">まだ登録されたスキルがありません</p>`;
    return;
  }
  el.innerHTML = state.skills
    .map(
      (s) => `
    <div class="skill-badge" title="${escapeHtml(s.description || "")}">
      <span class="dot"></span>
      <span>${escapeHtml(s.title)}</span>
      <span class="cat">${escapeHtml(s.category)}</span>
    </div>
  `
    )
    .join("");
}

function renderTagFilter() {
  const el = document.getElementById("tag-filter");
  const allTags = [...new Set(state.logs.flatMap((l) => l.tags || []))];

  const buttons = [
    `<button class="tag-button ${state.activeTag === null ? "active" : ""}" data-tag="">すべて</button>`,
    ...allTags.map(
      (tag) =>
        `<button class="tag-button ${state.activeTag === tag ? "active" : ""}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`
    ),
  ];

  el.innerHTML = buttons.join("");

  el.querySelectorAll(".tag-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tag;
      state.activeTag = tag === "" ? null : tag;
      renderTagFilter();
      renderTimeline();
    });
  });
}

function renderTimeline() {
  const el = document.getElementById("timeline");
  const filtered = state.activeTag
    ? state.logs.filter((l) => (l.tags || []).includes(state.activeTag))
    : state.logs;

  if (filtered.length === 0) {
    el.innerHTML = `<p class="empty">該当する学習ログがありません</p>`;
    return;
  }

  el.innerHTML = filtered
    .map(
      (log) => `
    <article class="log-card">
      <div class="log-date">${formatDate(log.date)}</div>
      <h3 class="log-title">${escapeHtml(log.title)}</h3>
      <p class="log-content">${escapeHtml(log.content)}</p>
      <div class="log-tags">
        ${(log.tags || []).map((t) => `<span class="log-tag">${escapeHtml(t)}</span>`).join("")}
      </div>
    </article>
  `
    )
    .join("");
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

loadData();
