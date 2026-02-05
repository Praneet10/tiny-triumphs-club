const STORAGE_KEY = "habit-tracker-v1";
const LEGACY_KEYS = ["habit-tracker-v2"];

const defaultHabits = ["Drink water", "Move your body", "Read 10 pages"];

const state = loadState();

const todayLabel = document.getElementById("todayLabel");
const habitList = document.getElementById("habitList");
const todayStatus = document.getElementById("todayStatus");
const newHabit = document.getElementById("newHabit");
const addHabitBtn = document.getElementById("addHabitBtn");
const resetTodayBtn = document.getElementById("resetTodayBtn");
const clearDataBtn = document.getElementById("clearDataBtn");
const recoverBtn = document.getElementById("recoverBtn");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const calendarEl = document.getElementById("calendar");
const monthLabel = document.getElementById("monthLabel");
const prevMonthBtn = document.getElementById("prevMonth");
const nextMonthBtn = document.getElementById("nextMonth");
const weeklyView = document.getElementById("weeklyView");
const monthlySummary = document.getElementById("monthlySummary");
const progressChart = document.getElementById("progressChart");

let viewDate = new Date();

init();

function init() {
  todayLabel.textContent = formatDateLabel(new Date());
  renderHabits();
  renderCalendar();
  renderWeekly();
  renderMonthlySummary();
  renderChart();

  addHabitBtn.addEventListener("click", addHabit);
  newHabit.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addHabit();
  });
  resetTodayBtn.addEventListener("click", resetToday);
  clearDataBtn.addEventListener("click", clearAll);
  recoverBtn.addEventListener("click", recoverData);
  exportBtn.addEventListener("click", exportData);
  importInput.addEventListener("change", importData);
  prevMonthBtn.addEventListener("click", () => changeMonth(-1));
  nextMonthBtn.addEventListener("click", () => changeMonth(1));

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }

  attemptAutoRecover();
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const migrated = migrateLegacy();
    if (migrated) return migrated;
    return {
      profiles: {
        me: { habits: defaultHabits.slice(), completions: {} },
        friend: { habits: defaultHabits.slice(), completions: {} },
      },
      activeProfile: "me",
      updatedAt: Date.now(),
    };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.profiles && parsed.profiles.me && parsed.profiles.friend) return parsed;
    if (parsed.habits && parsed.completions) {
      return {
        profiles: {
          me: { habits: parsed.habits, completions: parsed.completions },
          friend: { habits: defaultHabits.slice(), completions: {} },
        },
        activeProfile: "me",
        updatedAt: Date.now(),
      };
    }
    throw new Error("bad");
  } catch {
    const migrated = migrateLegacy();
    if (migrated) return migrated;
    return {
      profiles: {
        me: { habits: defaultHabits.slice(), completions: {} },
        friend: { habits: defaultHabits.slice(), completions: {} },
      },
      activeProfile: "me",
      updatedAt: Date.now(),
    };
  }
}

function saveState() {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayKey() {
  return toKey(new Date());
}

function toKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateLabel(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function ensureDay(dateKey) {
  const profile = currentProfile();
  if (!profile.completions[dateKey]) {
    profile.completions[dateKey] = {};
  }
}

function renderHabits() {
  habitList.innerHTML = "";
  const key = todayKey();
  ensureDay(key);
  const profile = currentProfile();

  profile.habits.forEach((habit) => {
    const wrapper = document.createElement("div");
    wrapper.className = "habit";

    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!profile.completions[key][habit];
    checkbox.addEventListener("change", () => {
      if (key !== todayKey()) {
        checkbox.checked = !!profile.completions[key][habit];
        alert("Past days are locked and cannot be edited.");
        return;
      }
      profile.completions[key][habit] = checkbox.checked;
      saveState();
      updateTodayStatus();
      renderCalendar();
      renderWeekly();
      renderMonthlySummary();
      renderChart();
    });

    const span = document.createElement("span");
    span.textContent = habit;

    label.appendChild(checkbox);
    label.appendChild(span);

    const remove = document.createElement("button");
    remove.className = "ghost";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeHabit(habit));

    wrapper.appendChild(label);
    wrapper.appendChild(remove);
    habitList.appendChild(wrapper);
  });

  updateTodayStatus();
}

function updateTodayStatus() {
  const status = getDayStatus(todayKey());
  todayStatus.textContent = status.label;
  todayStatus.style.color = status.color;
}

function getDayStatus(dateKey) {
  const profile = currentProfile();
  const total = profile.habits.length;
  if (total === 0) {
    return { label: "No habits", percent: 0, color: "#777", state: "none" };
  }
  const day = profile.completions[dateKey] || {};
  const done = profile.habits.filter((h) => day[h]).length;
  const percent = done / total;
  if (percent === 1) return { label: "Complete", percent, color: "#2f4a3a", state: "done" };
  if (percent > 0) return { label: `Partial (${done}/${total})`, percent, color: "#a17417", state: "partial" };
  return { label: "Not complete", percent, color: "#8d4c4c", state: "none" };
}

function addHabit() {
  const name = newHabit.value.trim();
  if (!name) return;
  const profile = currentProfile();
  if (profile.habits.includes(name)) {
    newHabit.value = "";
    return;
  }
  profile.habits.push(name);
  saveState();
  newHabit.value = "";
  renderHabits();
  renderCalendar();
  renderWeekly();
  renderMonthlySummary();
  renderChart();
}

function removeHabit(habit) {
  const profile = currentProfile();
  if (hasLockedHistory(habit)) {
    alert("This habit has past-day history and cannot be removed.");
    return;
  }
  profile.habits = profile.habits.filter((h) => h !== habit);
  Object.keys(profile.completions).forEach((dateKey) => {
    delete profile.completions[dateKey][habit];
  });
  saveState();
  renderHabits();
  renderCalendar();
  renderWeekly();
  renderMonthlySummary();
  renderChart();
}

function resetToday() {
  const key = todayKey();
  const profile = currentProfile();
  profile.completions[key] = {};
  saveState();
  renderHabits();
  renderCalendar();
  renderWeekly();
  renderMonthlySummary();
  renderChart();
}

function clearAll() {
  if (!confirm("Clear all saved habit data? This will erase past days too.")) return;
  const profile = currentProfile();
  profile.habits = defaultHabits.slice();
  profile.completions = {};
  saveState();
  renderHabits();
  renderCalendar();
  renderWeekly();
  renderMonthlySummary();
  renderChart();
}

function hasLockedHistory(habit) {
  const today = todayKey();
  const profile = currentProfile();
  return Object.keys(profile.completions).some((dateKey) => {
    if (dateKey >= today) return false;
    return Object.prototype.hasOwnProperty.call(profile.completions[dateKey], habit);
  });
}

function changeMonth(delta) {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
  renderCalendar();
  renderMonthlySummary();
}

function renderCalendar() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  monthLabel.textContent = viewDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonthDays = new Date(year, month, 0).getDate();
  calendarEl.innerHTML = "";

  const totalCells = 42;
  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "day";

    let dayNumber;
    let cellDate;
    if (i < startDay) {
      dayNumber = prevMonthDays - (startDay - i - 1);
      cell.classList.add("muted");
      cellDate = new Date(year, month - 1, dayNumber);
    } else if (i >= startDay + daysInMonth) {
      dayNumber = i - (startDay + daysInMonth) + 1;
      cell.classList.add("muted");
      cellDate = new Date(year, month + 1, dayNumber);
    } else {
      dayNumber = i - startDay + 1;
      cellDate = new Date(year, month, dayNumber);
    }

    const label = document.createElement("div");
    label.textContent = dayNumber;

    const status = getDayStatus(toKey(cellDate));
    cell.classList.add(status.state);

    const tickRow = document.createElement("div");
    tickRow.className = "tick-row";

    const profile = currentProfile();
    const dayData = profile.completions[toKey(cellDate)] || {};
    profile.habits.forEach((habit) => {
      const tick = document.createElement("div");
      tick.className = `tick ${dayData[habit] ? "done" : "none"}`;
      tickRow.appendChild(tick);
    });

    cell.appendChild(label);
    cell.appendChild(tickRow);
    calendarEl.appendChild(cell);
  }
}

function renderWeekly() {
  weeklyView.innerHTML = "";
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const status = getDayStatus(toKey(date));

    const row = document.createElement("div");
    row.className = "weekly-item";
    const label = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    row.innerHTML = `<span>${label}</span><strong>${Math.round(status.percent * 100)}%</strong>`;
    weeklyView.appendChild(row);
  }
}

function renderMonthlySummary() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let full = 0;
  let partial = 0;
  let none = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = toKey(new Date(year, month, d));
    const status = getDayStatus(dateKey);
    if (status.percent === 1) full++;
    else if (status.percent > 0) partial++;
    else none++;
  }

  const streak = currentStreak();
  const longest = longestStreak();

  monthlySummary.innerHTML = "";
  monthlySummary.appendChild(summaryRow("Days completed", `${full}`));
  monthlySummary.appendChild(summaryRow("Partial days", `${partial}`));
  monthlySummary.appendChild(summaryRow("No progress", `${none}`));
  monthlySummary.appendChild(summaryRow("Current streak", `${streak} days`));
  monthlySummary.appendChild(summaryRow("Longest streak", `${longest} days`));
}

function summaryRow(label, value) {
  const row = document.createElement("div");
  row.className = "weekly-item";
  row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return row;
}

function currentStreak() {
  let count = 0;
  let date = new Date();
  while (true) {
    const status = getDayStatus(toKey(date));
    if (status.percent === 1) {
      count++;
      date.setDate(date.getDate() - 1);
    } else {
      break;
    }
  }
  return count;
}

function longestStreak() {
  const profile = currentProfile();
  const keys = Object.keys(profile.completions).sort();
  if (keys.length === 0) return 0;

  let longest = 0;
  let current = 0;
  let prevDate = null;

  keys.forEach((key) => {
    const status = getDayStatus(key);
    if (status.percent === 1) {
      const date = new Date(key);
      if (prevDate) {
        const diff = (date - prevDate) / 86400000;
        if (diff === 1) current++;
        else current = 1;
      } else {
        current = 1;
      }
      prevDate = date;
      if (current > longest) longest = current;
    }
  });

  return longest;
}

function renderChart() {
  const ctx = progressChart.getContext("2d");
  const width = progressChart.width;
  const height = progressChart.height;
  ctx.clearRect(0, 0, width, height);

  const days = 14;
  const today = new Date();
  const barWidth = Math.floor(width / days) - 6;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const status = getDayStatus(toKey(date));
    const x = (days - 1 - i) * (barWidth + 6) + 10;
    const barHeight = Math.max(6, status.percent * (height - 40));
    const y = height - barHeight - 20;

    ctx.fillStyle = status.percent === 1 ? "#1f3b2d" : status.percent > 0 ? "#f3d36b" : "#ddd";
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#476055";
    ctx.font = "12px Trebuchet MS";
    ctx.fillText(date.getDate(), x, height - 6);
  }
}

function migrateLegacy() {
  for (const key of LEGACY_KEYS) {
    const legacyRaw = localStorage.getItem(key);
    if (!legacyRaw) continue;
    try {
      const legacy = JSON.parse(legacyRaw);
      if (legacy.profiles && legacy.profiles.me && legacy.profiles.friend) {
        return legacy;
      }
      if (legacy.habits && legacy.completions) {
        return {
          profiles: {
            me: { habits: legacy.habits, completions: legacy.completions },
            friend: { habits: defaultHabits.slice(), completions: {} },
          },
          activeProfile: "me",
          updatedAt: Date.now(),
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function attemptAutoRecover() {
  const profile = state.profiles.me;
  const hasData = profile.habits.length > 0 || Object.keys(profile.completions).length > 0;
  if (hasData) return;
  const candidate = findBestLegacy();
  if (!candidate) return;
  if (confirm("Found previous data. Restore it now?")) {
    applyRecovered(candidate);
  }
}

function recoverData() {
  const candidate = findBestLegacy();
  if (!candidate) {
    alert("No previous data found to recover.");
    return;
  }
  if (confirm("Restore the most recent data found? This will replace current data.")) {
    applyRecovered(candidate);
  }
}

function applyRecovered(recovered) {
  const normalized = normalizeState(recovered);
  if (!normalized) return;
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, normalized);
  saveState();
  renderHabits();
  renderCalendar();
  renderWeekly();
  renderMonthlySummary();
  renderChart();
}

function exportData() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tiny-triumphs-backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const normalized = normalizeState(parsed);
      if (!normalized) throw new Error("bad");
      if (!confirm("Import this backup? It will replace current data.")) return;
      Object.keys(state).forEach((k) => delete state[k]);
      Object.assign(state, normalized);
      saveState();
      renderHabits();
      renderCalendar();
      renderWeekly();
      renderMonthlySummary();
      renderChart();
    } catch {
      alert("That file could not be imported.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function findBestLegacy() {
  const candidates = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.includes("habit-tracker")) continue;
    try {
      const raw = JSON.parse(localStorage.getItem(key));
      const normalized = normalizeState(raw);
      if (normalized) candidates.push(normalized);
    } catch {
      continue;
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => scoreState(b) - scoreState(a));
  return candidates[0];
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.profiles && raw.profiles.me && raw.profiles.friend) {
    return {
      profiles: {
        me: ensureProfile(raw.profiles.me),
        friend: ensureProfile(raw.profiles.friend),
      },
      activeProfile: "me",
      updatedAt: raw.updatedAt || Date.now(),
    };
  }
  if (raw.habits && raw.completions) {
    return {
      profiles: {
        me: ensureProfile(raw),
        friend: { habits: defaultHabits.slice(), completions: {} },
      },
      activeProfile: "me",
      updatedAt: raw.updatedAt || Date.now(),
    };
  }
  return null;
}

function ensureProfile(profile) {
  return {
    habits: Array.isArray(profile.habits) ? profile.habits : defaultHabits.slice(),
    completions: profile.completions && typeof profile.completions === "object" ? profile.completions : {},
  };
}

function scoreState(candidate) {
  const profile = candidate.profiles.me;
  const completionCount = Object.keys(profile.completions || {}).length;
  return (candidate.updatedAt || 0) + completionCount * 1000;
}


function currentProfile() {
  return state.profiles.me;
}
