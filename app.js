const HISTORY_LIMIT = 30;
const FOLLOWER_GOAL = 100000;

let chartInstance = null;
let chartMode = "daily";
let currentView = null;

const ui = {
  body: document.body,
  loading: document.getElementById("loading"),
  navDay: document.getElementById("nav-day"),
  heroAmount: document.getElementById("hero-amount"),
  heroSync: document.getElementById("hero-sync"),
  progressPct: document.getElementById("progress-pct"),
  progressFill: document.getElementById("progress-fill"),
  runwayDays: document.getElementById("runway-days"),
  statusPill: document.getElementById("status-pill"),
  statDay: document.getElementById("stat-day"),
  statLeft: document.getElementById("stat-left"),
  statAvg: document.getElementById("stat-avg"),
  statNeeded: document.getElementById("stat-needed"),
  statTrack: document.getElementById("stat-track"),
  errorBanner: document.getElementById("error-banner"),
  streamsGrid: document.getElementById("streams-grid"),
  chartButtons: Array.from(document.querySelectorAll("[data-chart-mode]")),
  chartWindow: document.getElementById("chart-window"),
  chartCanvas: document.getElementById("earningsChart"),
  chartEmpty: document.getElementById("chart-empty"),
  insightStreamValue: document.getElementById("insight-stream-value"),
  insightStreamNote: document.getElementById("insight-stream-note"),
  insightAudienceValue: document.getElementById("insight-audience-value"),
  insightAudienceNote: document.getElementById("insight-audience-note"),
  insightWindowValue: document.getElementById("insight-window-value"),
  insightWindowNote: document.getElementById("insight-window-note"),
  platformsGrid: document.getElementById("platforms-grid"),
  totalFollowersCount: document.getElementById("total-followers-count"),
  followersBarFill: document.getElementById("followers-bar-fill"),
  goatStars: document.getElementById("goat-stars"),
  goatDesc: document.getElementById("goat-desc"),
  footerUpdated: document.getElementById("footer-updated"),
  publicFeed: document.getElementById("public-feed")
};

ui.chartButtons.forEach((button) => {
  button.addEventListener("click", () => {
    chartMode = button.dataset.chartMode || "daily";
    ui.chartButtons.forEach((node) => {
      node.classList.toggle("is-active", node === button);
    });

    if (currentView) {
      renderChart(currentView.history);
    }
  });
});

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fmtCurrency(value, digits = 2) {
  return `$${numberOr(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`;
}

function fmtCompact(value) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(numberOr(value));
}

function fmtDateTime(iso) {
  if (!iso) {
    return "Awaiting first refresh";
  }

  try {
    return `${new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso))} IST`;
  } catch {
    return iso;
  }
}

function fmtDateShort(iso) {
  if (!iso) {
    return "Unknown";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric"
    }).format(new Date(`${iso}T00:00:00`));
  } catch {
    return iso;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeColor(value, fallback) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim()) ? value : fallback;
}

function safeUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function setText(node, value) {
  if (node) {
    node.textContent = value;
  }
}

function setError(message) {
  if (!message) {
    ui.errorBanner.classList.add("hidden");
    ui.errorBanner.textContent = "";
    return;
  }

  ui.errorBanner.classList.remove("hidden");
  ui.errorBanner.textContent = message;
}

function statusState(view) {
  if (view.earned >= view.goal) {
    return {
      className: "is-complete",
      label: "goal cleared",
      note: "The target is cleared. The next job is to keep compounding."
    };
  }

  if (view.onTrack) {
    return {
      className: "is-on-track",
      label: "on pace",
      note: "Current average pace is enough if it stays stable."
    };
  }

  if (view.earned > 0) {
    return {
      className: "is-push",
      label: "needs lift",
      note: "The current pace is below target. One engine needs to break out."
    };
  }

  return {
    className: "is-warming",
    label: "warming up",
    note: "Operating signal will appear once the first entries land."
  };
}

function buildView(data) {
  const goal = Math.max(numberOr(data.goal, 50000), 1);
  const earned = Math.max(numberOr(data.total_earned, 0), 0);
  const daysElapsed = Math.max(numberOr(data.days_elapsed, 0), 0);
  const daysLeft = Math.max(numberOr(data.days_remaining, 0), 0);
  const dailyAvg = daysElapsed > 0 ? earned / daysElapsed : 0;
  const weeklyNeeded = daysLeft > 0 ? Math.max(goal - earned, 0) / (daysLeft / 7) : 0;
  const onTrack = earned >= goal || (daysElapsed > 0 && ((dailyAvg * daysLeft) + earned >= goal));
  const progress = clamp((earned / goal) * 100, 0, 100);

  const streams = Array.isArray(data.streams)
    ? data.streams
      .map((stream) => ({
        id: stream.id || "",
        label: stream.label || "Unnamed stream",
        amount: Math.max(numberOr(stream.amount, 0), 0),
        desc: stream.desc || "No description yet.",
        color: sanitizeColor(stream.color, "#00FF41"),
        url: stream.url || "",
        image: stream.image || ""
      }))
      .sort((left, right) => right.amount - left.amount)
    : [];

  const totalStreamAmount = streams.reduce((sum, stream) => sum + stream.amount, 0);
  const leadStream = streams.find((stream) => stream.amount > 0) || streams[0] || null;

  const platforms = Object.values(data.platforms || {}).map((platform) => ({
    label: platform.label || "Unknown",
    count: Math.max(numberOr(platform.count, 0), 0),
    color: sanitizeColor(platform.color, "#00FF41")
  }));

  const totalFollowers = platforms.reduce((sum, platform) => sum + platform.count, 0);

  const history = Array.isArray(data.history)
    ? data.history.slice(-HISTORY_LIMIT).map((point) => ({
      day: Math.max(numberOr(point.day, 0), 0),
      earned: Math.max(numberOr(point.earned, 0), 0),
      date: point.date || "Unknown",
      note: point.note || ""
    }))
    : [];

  return {
    goal,
    earned,
    progress,
    daysElapsed,
    daysLeft,
    dailyAvg,
    weeklyNeeded,
    onTrack,
    streams,
    totalStreamAmount,
    leadStream,
    platforms,
    totalFollowers,
    history,
    githubStars: Math.max(numberOr(data.github_stars, 0), 0),
    updatedLabel: fmtDateTime(data.updated),
    challengeWindow: `${fmtDateShort(data.challenge_start)} to ${fmtDateShort(data.challenge_end)}`,
    raw: data
  };
}

function renderSummary(view) {
  currentView = view;

  setText(ui.navDay, `Day ${view.daysElapsed}`);
  setText(ui.heroAmount, fmtCurrency(view.earned));
  setText(ui.progressPct, `${view.progress.toFixed(2)}%`);
  ui.progressFill.style.width = `${view.progress}%`;
  ui.progressFill.style.background = view.progress < 15
    ? "#c44040"
    : view.progress < 35
      ? "#b06d10"
      : "#1a9968";

  setText(ui.runwayDays, `${view.daysLeft} days left`);
  setText(ui.statDay, String(view.daysElapsed));
  setText(ui.statLeft, String(view.daysLeft));
  setText(ui.statAvg, fmtCurrency(view.dailyAvg));
  setText(ui.statNeeded, fmtCurrency(view.weeklyNeeded, 0));
  setText(ui.heroSync, `Last synced: ${view.updatedLabel}`);
  setText(ui.footerUpdated, view.updatedLabel);

  const state = statusState(view);
  ui.statusPill.className = `status-pill ${state.className}`;
  setText(ui.statusPill, state.label);
  setText(ui.statTrack, state.note);

  setText(
    ui.insightStreamValue,
    view.leadStream ? view.leadStream.label : "Pre-revenue"
  );
  setText(
    ui.insightStreamNote,
    view.leadStream && view.leadStream.amount > 0
      ? `${fmtCurrency(view.leadStream.amount, 0)} / mo is leading the visible mix right now.`
      : "The first meaningful revenue spike will define the next sprint."
  );

  setText(ui.insightAudienceValue, fmtCompact(view.totalFollowers));
  setText(
    ui.insightAudienceNote,
    `${((view.totalFollowers / FOLLOWER_GOAL) * 100).toFixed(1)}% of the 100k reach target.`
  );

  setText(ui.insightWindowValue, view.challengeWindow);
  setText(
    ui.insightWindowNote,
    view.daysLeft > 0
      ? `${view.daysLeft} days remain in the public sprint.`
      : "The challenge window is complete."
  );
}

function makeCardTitle(label, color) {
  const wrap = document.createElement("div");
  wrap.className = "stream-card__meta";

  const left = document.createElement("div");
  left.className = "stream-card__meta";

  const dot = document.createElement("span");
  dot.className = "stream-card__dot";
  dot.style.setProperty("--stream-color", color);
  dot.style.background = color;

  const textWrap = document.createElement("div");

  const title = document.createElement("h3");
  title.className = "stream-card__name";
  title.textContent = label;

  textWrap.appendChild(title);
  left.append(dot, textWrap);
  wrap.appendChild(left);

  return wrap;
}

function renderStreams(view) {
  ui.streamsGrid.textContent = "";

  if (!view.streams.length) {
    const empty = document.createElement("article");
    empty.className = "stream-card";
    empty.appendChild(makeCardTitle("No streams configured", "#79b8ff"));

    const note = document.createElement("p");
    note.className = "stream-card__copy";
    note.textContent = "Add streams to data.json to light up the board.";
    empty.appendChild(note);

    ui.streamsGrid.appendChild(empty);
    return;
  }

  view.streams.forEach((stream) => {
    const card = document.createElement("article");
    card.className = "stream-card";
    card.style.setProperty("--stream-color", stream.color);

    if (stream.image) {
      const img = document.createElement("img");
      img.className = "stream-card__image";
      img.src = stream.image;
      img.alt = stream.label;
      img.loading = "lazy";
      card.appendChild(img);
    }

    const content = document.createElement("div");
    content.className = "stream-card__content";

    const top = document.createElement("div");
    top.className = "stream-card__top";

    const titleWrap = makeCardTitle(stream.label, stream.color);
    const amount = document.createElement("strong");
    amount.className = "stream-card__amount mono";
    amount.textContent = stream.amount > 0 ? `${fmtCurrency(stream.amount, 0)} / mo` : "pre-revenue";

    top.append(titleWrap, amount);
    content.appendChild(top);

    const copy = document.createElement("p");
    copy.className = "stream-card__copy";
    copy.textContent = stream.desc;
    content.appendChild(copy);

    const meter = document.createElement("div");
    meter.className = "stream-meter";

    const meterFill = document.createElement("div");
    meterFill.className = "stream-meter__fill";
    const share = view.totalStreamAmount > 0 ? (stream.amount / view.totalStreamAmount) * 100 : 0;
    meterFill.style.width = `${share}%`;

    meter.appendChild(meterFill);
    content.appendChild(meter);

    const footer = document.createElement("div");
    footer.className = "stream-card__footer";

    const shareNote = document.createElement("span");
    shareNote.className = "stream-card__share mono";
    shareNote.textContent = view.totalStreamAmount > 0
      ? `${share.toFixed(0)}% of visible monthly mix`
      : "Waiting on the first monetized engine";
    footer.appendChild(shareNote);

    const url = safeUrl(stream.url);
    if (url) {
      const link = document.createElement("a");
      link.className = "stream-card__link mono";
      link.href = url.toString();
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = url.hostname.replace(/^www\./, "");
      footer.appendChild(link);
    }

    content.appendChild(footer);

    card.appendChild(content);
    ui.streamsGrid.appendChild(card);
  });
}

function renderPlatforms(view) {
  ui.platformsGrid.textContent = "";

  if (!view.platforms.length) {
    const empty = document.createElement("article");
    empty.className = "platform-card";

    const label = document.createElement("span");
    label.className = "platform-card__label mono";
    label.textContent = "No platforms";

    const count = document.createElement("strong");
    count.className = "platform-card__count mono";
    count.textContent = "0";

    empty.append(label, count);
    ui.platformsGrid.appendChild(empty);
  } else {
    view.platforms.forEach((platform) => {
      const card = document.createElement("article");
      card.className = "platform-card";
      card.style.setProperty("--platform-color", platform.color);

      const label = document.createElement("span");
      label.className = "platform-card__label mono";
      label.textContent = platform.label;

      const count = document.createElement("strong");
      count.className = "platform-card__count mono";
      count.textContent = platform.count > 0 ? fmtCompact(platform.count) : "0";

      card.append(label, count);
      ui.platformsGrid.appendChild(card);
    });
  }

  setText(ui.totalFollowersCount, fmtCompact(view.totalFollowers));
  ui.followersBarFill.style.width = `${clamp((view.totalFollowers / FOLLOWER_GOAL) * 100, 0, 100)}%`;
}

function renderGoat(view) {
  setText(ui.goatStars, `★ ${fmtCompact(view.githubStars)}`);

  if (view.githubStars >= 10000) {
    setText(ui.goatDesc, "Top-tier visibility. Sponsors, users, and serious collaboration opportunities should follow.");
    return;
  }

  if (view.githubStars >= 2500) {
    setText(ui.goatDesc, "The project is entering real category territory. Maintain shipping cadence and social proof.");
    return;
  }

  if (view.githubStars >= 500) {
    setText(ui.goatDesc, "Credibility is forming. Open-source momentum is now a real growth lever.");
    return;
  }

  if (view.githubStars >= 100) {
    setText(ui.goatDesc, "The repos are finding their first real audience. Keep compounding visibility.");
    return;
  }

  setText(ui.goatDesc, "Pre-visibility. First repo launch will set the baseline.");
}

function renderFeed(history) {
  if (!ui.publicFeed) return;
  ui.publicFeed.textContent = "";

  const logs = [...history].reverse().filter(l => l.note && l.note.trim() !== "");

  if (logs.length === 0) {
    ui.publicFeed.innerHTML = '<p class="mono text-dim" style="padding: 20px; text-align: center;">Awaiting log entries...</p>';
    return;
  }

  logs.forEach(log => {
    const card = document.createElement("article");
    card.className = "insight-card";
    card.style.borderBottom = "1px solid var(--line)";
    card.style.padding = "20px";

    const top = document.createElement("div");
    top.className = "flex justify-between items-baseline mb-2";
    top.style.display = "flex";
    top.style.justifyContent = "space-between";
    top.style.alignItems = "baseline";
    top.style.marginBottom = "8px";

    const day = document.createElement("span");
    day.className = "eyebrow mono";
    day.textContent = `Day ${log.day} — ${log.date}`;

    const earned = document.createElement("span");
    earned.className = "mono";
    earned.style.color = "var(--accent)";
    earned.textContent = log.earned > 0 ? `+$${log.earned.toFixed(2)}` : "";

    top.append(day, earned);

    const note = document.createElement("p");
    note.className = "insight-card__copy";
    note.style.fontFamily = "var(--font-mono)";
    note.style.fontSize = "0.85rem";
    note.style.color = "var(--text)";
    note.textContent = log.note;

    card.append(top, note);
    ui.publicFeed.appendChild(card);
  });
}

function renderChart(history) {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (!history.length || typeof Chart === "undefined") {
    ui.chartCanvas.classList.add("hidden");
    ui.chartEmpty.classList.remove("hidden");
    setText(
      ui.chartWindow,
      typeof Chart === "undefined" ? "Chart library unavailable" : "Awaiting first daily entries"
    );
    return;
  }

  ui.chartCanvas.classList.remove("hidden");
  ui.chartEmpty.classList.add("hidden");
  setText(ui.chartWindow, `Last ${history.length} updates`);

  const labels = history.map((point) => `D${point.day ?? "?"}`);
  let cumulative = 0;
  const cumulativeData = history.map((point) => {
    cumulative += point.earned;
    return Number(cumulative.toFixed(2));
  });
  const dailyData = history.map((point) => Number(point.earned.toFixed(2)));
  const isDaily = chartMode === "daily";
  const ctx = ui.chartCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);

  gradient.addColorStop(0, "rgba(0, 255, 65, 0.2)");
  gradient.addColorStop(0.5, "rgba(0, 255, 65, 0.05)");
  gradient.addColorStop(1, "rgba(0, 255, 65, 0)");

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: isDaily ? "Daily earnings" : "Cumulative earnings",
          data: isDaily ? dailyData : cumulativeData,
          borderColor: "#00FF41",
          backgroundColor: gradient,
          borderWidth: 1.5,
          fill: true,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: "#00FF41"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: "#000000",
          borderColor: "#3b4b37",
          borderWidth: 1,
          titleColor: "#ececebff",
          bodyColor: "#00FF41",
          displayColors: false,
          titleFont: {
            family: "JetBrains Mono",
            size: 11
          },
          bodyFont: {
            family: "JetBrains Mono",
            size: 12
          },
          callbacks: {
            label(context) {
              return fmtCurrency(context.raw);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#6b726a",
            font: {
              family: "JetBrains Mono",
              size: 10
            },
            maxTicksLimit: 8
          },
          grid: {
            display: false
          },
          border: {
            display: false
          }
        },
        y: {
          ticks: {
            color: "#6b726a",
            font: {
              family: "JetBrains Mono",
              size: 10
            },
            callback(value) {
              return `$${value}`;
            }
          },
          grid: {
            color: "#1c231a"
          },
          border: {
            display: false
          }
        }
      }
    }
  });
}

function renderFallback() {
  const fallback = buildView({});
  renderSummary(fallback);
  renderStreams(fallback);
  renderPlatforms(fallback);
  renderGoat(fallback);
  renderChart([]);
}

async function loadData() {
  try {
    const response = await fetch(`./data.json?t=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const data = await response.json();
    const view = buildView(data);

    setError("");
    renderSummary(view);
    renderStreams(view);
    renderPlatforms(view);
    renderGoat(view);
    renderFeed(view.history);
    renderChart(view.history);
  } catch (error) {
    console.error("Failed to load data.json", error);
    setError("Live data feed is unavailable right now. The shell is still live, but the numbers need a fresh sync.");

    if (!currentView) {
      renderFallback();
    }
  } finally {
    ui.body.dataset.state = "ready";

    if (ui.loading && !ui.loading.classList.contains("is-hidden")) {
      ui.loading.classList.add("is-hidden");
      window.setTimeout(() => {
        ui.loading?.remove();
      }, 380);
    }
  }
}

loadData();
window.setInterval(loadData, 5 * 60 * 1000);
