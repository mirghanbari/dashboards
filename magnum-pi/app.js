// Magnum, P.I. dashboard interactivity
// Data comes from data.js (global EPISODES array).

(function () {
  "use strict";

  const grid = document.getElementById("grid");
  const statsEl = document.getElementById("stats");
  const seasonFiltersEl = document.getElementById("seasonFilters");
  const searchEl = document.getElementById("search");
  const sortEl = document.getElementById("sort");
  const emptyEl = document.getElementById("empty");

  let activeSeason = "all";

  // ----- Score color (red → gold → green by quality) -----
  function scoreColor(score) {
    // 8.3 .. 9.6 mapped roughly across a warm-to-cool quality ramp
    if (score >= 9.3) return "linear-gradient(90deg,#d92121,#ff7e5f)";
    if (score >= 9.0) return "linear-gradient(90deg,#ff7e5f,#f4b740)";
    if (score >= 8.7) return "linear-gradient(90deg,#f4b740,#26d0ce)";
    return "linear-gradient(90deg,#26d0ce,#1a2980)";
  }

  // ----- Summary stats -----
  function renderStats() {
    const scores = EPISODES.map(e => e.score);
    const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
    const top = Math.max(...scores).toFixed(1);
    const seasons = new Set(EPISODES.map(e => e.season));
    // Season with the most entries in the list
    const counts = {};
    EPISODES.forEach(e => { counts[e.season] = (counts[e.season] || 0) + 1; });
    const bestSeason = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    const cards = [
      { value: EPISODES.length, label: "Episodes Ranked" },
      { value: avg, label: "Average Score" },
      { value: top, label: "Top Score" },
      { value: "S" + bestSeason, label: "Most-Featured Season" },
    ];
    statsEl.innerHTML = cards.map(c =>
      `<div class="stat-card"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>`
    ).join("");
  }

  // ----- Season filter chips -----
  function renderSeasonFilters() {
    const seasons = [...new Set(EPISODES.map(e => e.season))].sort((a, b) => a - b);
    const chips = [`<button class="chip active" data-season="all">All Seasons</button>`]
      .concat(seasons.map(s => `<button class="chip" data-season="${s}">Season ${s}</button>`));
    seasonFiltersEl.innerHTML = chips.join("");

    seasonFiltersEl.addEventListener("click", function (e) {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      activeSeason = btn.dataset.season;
      seasonFiltersEl.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      render();
    });
  }

  // ----- Card markup -----
  function cardHTML(ep) {
    const pct = Math.round((ep.score / 10) * 100);
    const topClass = ep.rank <= 3 ? " top3" : "";
    return `
      <article class="card">
        <div class="card-top">
          <span class="rank-badge${topClass}">${ep.rank}</span>
          <div class="score">
            <span class="score-num">${ep.score.toFixed(1)}<small>/10</small></span>
            <span class="score-bar"><span style="width:${pct}%;background:${scoreColor(ep.score)}"></span></span>
          </div>
        </div>
        <h2>${ep.title}</h2>
        <div class="tags">
          <span class="tag">Season ${ep.season}</span>
          <span class="tag ep">Episode ${ep.episode}</span>
        </div>
        <p class="synopsis">${ep.synopsis}</p>
      </article>`;
  }

  // ----- Filter + sort + render -----
  function render() {
    const q = searchEl.value.trim().toLowerCase();
    let list = EPISODES.filter(ep => {
      const seasonOk = activeSeason === "all" || String(ep.season) === activeSeason;
      const text = (ep.title + " " + ep.synopsis).toLowerCase();
      return seasonOk && (q === "" || text.includes(q));
    });

    const sort = sortEl.value;
    list.sort((a, b) => {
      if (sort === "score") return b.score - a.score || a.rank - b.rank;
      if (sort === "season") return a.season - b.season || a.rank - b.rank;
      if (sort === "title") return a.title.localeCompare(b.title);
      return a.rank - b.rank; // default
    });

    grid.innerHTML = list.map(cardHTML).join("");
    // stagger entrance animation
    grid.querySelectorAll(".card").forEach((c, i) => { c.style.animationDelay = (i * 0.03) + "s"; });
    emptyEl.hidden = list.length !== 0;
  }

  // ----- Init -----
  renderStats();
  renderSeasonFilters();
  render();
  searchEl.addEventListener("input", render);
  sortEl.addEventListener("change", render);
})();
