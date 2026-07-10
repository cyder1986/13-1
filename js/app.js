"use strict";

const STORAGE_KEY = "project13.foundation.v1";
const DB_NAME = "project13-media-v1";
const MEDIA_STORE = "media";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const todayKey = () => new Date().toLocaleDateString("sv-SE");
const makeId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const formatTime = (ts) => new Date(ts).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const defaultState = () => ({
  version: 1,
  exp: 0,
  hp: 70,
  mp: 60,
  recovery: 50,
  resources: { shells: 0, stars: 0, bottles: 0 },
  lastStarDate: "",
  resourceLog: [],
  journals: [],
  kitchen: [],
  bosses: [],
  tasks: [
    { id: makeId(), text: "起床後先不碰手機 10 分鐘", reward: 10, doneDate: "" },
    { id: makeId(), text: "喝一杯水", reward: 5, doneDate: "" },
    { id: makeId(), text: "完成今天最小的一件事", reward: 15, doneDate: "" }
  ]
});

let state = loadState();
let galleryFilter = "all";

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return defaultState();
    const fresh = defaultState();
    return { ...fresh, ...saved, resources: { ...fresh.resources, ...(saved.resources || {}) } };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderHud();
}

function levelInfo() {
  return { level: Math.floor(state.exp / 100) + 1, current: state.exp % 100 };
}

const rewardRules = {
  journal: { exp: 20, shells: 5, label: "世界紀錄" },
  journey: { shells: 10, label: "今日旅程" },
  kitchen: { exp: 15, shells: 5, label: "廚房紀錄" },
  boss: { exp: 10, shells: 15, label: "Boss 紀錄" },
  photo: { shells: 2, label: "現實照片" },
  worldShot: { exp: 5, shells: 3, label: "世界留影" },
  bottle: { bottles: 1, label: "漂流瓶" }
};

function grantRewards(rewards, reason) {
  const entries = [];
  if (rewards.exp) { state.exp += rewards.exp; entries.push(`+${rewards.exp} EXP`); }
  for (const key of ["shells", "stars", "bottles"]) {
    const amount = Number(rewards[key] || 0);
    if (!amount) continue;
    state.resources[key] += amount;
    state.resourceLog.unshift({ id: makeId(), ts: Date.now(), type: key, amount, reason });
    entries.push(`${resourceMeta[key].icon} +${amount}`);
    animateResource(key, amount);
  }
  state.resourceLog = state.resourceLog.slice(0, 200);
  saveState();
  if (entries.length) showToast(`${entries.join("・")}　${reason}`);
}

const resourceMeta = {
  shells: { icon: "🐚", name: "貝殼", description: "記錄每天累積的小行動，可用於未來解鎖世界內容。" },
  stars: { icon: "⭐", name: "星星", description: "完成重要里程碑時才會獲得的稀有成就。" },
  bottles: { icon: "🍾", name: "漂流瓶", description: "打開後會收到一則來自這個世界的小訊息。" }
};

function renderHud() {
  const { level, current } = levelInfo();
  $("#levelText").textContent = `Lv.${level}・旅人`;
  $("#expText").textContent = `${current} / 100 EXP`;
  $("#expBar").style.width = `${current}%`;
  $("#shellCount").textContent = state.resources.shells.toLocaleString();
  $("#starCount").textContent = state.resources.stars.toLocaleString();
  $("#bottleCount").textContent = state.resources.bottles.toLocaleString();
}

function animateResource(type, amount) {
  const button = $(`[data-resource="${type}"]`);
  button?.classList.remove("pulse");
  requestAnimationFrame(() => button?.classList.add("pulse"));
  const pop = document.createElement("div");
  pop.className = "reward-pop";
  pop.textContent = `${resourceMeta[type].icon} +${amount}`;
  $("#floatRewards").append(pop);
  setTimeout(() => pop.remove(), 1600);
}

function showToast(text) {
  const toast = $("#toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function mediaPut(item) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    tx.objectStore(MEDIA_STORE).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function mediaAll() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(MEDIA_STORE).objectStore(MEDIA_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function mediaDelete(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, "readwrite");
    tx.objectStore(MEDIA_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

const modal = $("#modal");
const modalBody = $("#modalBody");
const modalTitle = $("#modalTitle");
$("#closeModal").addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => { if (event.target === modal) modal.close(); });

const panelMap = {
  status: ["角色狀態", "tpl-status", bindStatus],
  journal: ["世界紀錄", "tpl-journal", bindJournal],
  journey: ["今日旅程", "tpl-journey", bindJourney],
  kitchen: ["廚房・身體紀錄", "tpl-kitchen", bindKitchen],
  gallery: ["回憶館", "tpl-gallery", bindGallery],
  boss: ["Boss 圖鑑", "tpl-boss", bindBoss],
  resource: ["資源紀錄", "tpl-resource", bindResource]
};

function openPanel(name, payload) {
  const [title, templateId, binder] = panelMap[name];
  modalTitle.textContent = title;
  modalBody.replaceChildren($("#" + templateId).content.cloneNode(true));
  binder(payload);
  modal.showModal();
}

$$('[data-open]').forEach((button) => button.addEventListener("click", () => openPanel(button.dataset.open)));
$$('[data-resource]').forEach((button) => button.addEventListener("click", () => openPanel("resource", button.dataset.resource)));

function bindStatus() {
  for (const key of ["hp", "mp", "recovery"]) {
    const input = $(`#${key}Input`);
    const output = $(`#${key}Value`);
    input.value = state[key]; output.value = state[key];
    input.addEventListener("input", () => output.value = input.value);
  }
  $("#saveStatus").addEventListener("click", () => {
    state.hp = +$("#hpInput").value;
    state.mp = +$("#mpInput").value;
    state.recovery = +$("#recoveryInput").value;
    saveState(); showToast("今天的狀態已記住");
  });
}

function bindJournal() {
  renderJournals();
  $("#saveJournal").addEventListener("click", () => {
    const text = $("#journalInput").value.trim();
    const win = $("#smallWinInput").value.trim();
    if (!text && !win) return showToast("先留下一句話吧");
    state.journals.unshift({ id: makeId(), ts: Date.now(), mood: $("#moodInput").value, text, win });
    saveState(); renderJournals(); grantRewards(rewardRules.journal, "世界紀錄");
    $("#journalInput").value = ""; $("#smallWinInput").value = "";
  });
}

function renderJournals() {
  const list = $("#journalList");
  list.innerHTML = state.journals.length ? state.journals.map((item) => `<article class="entry"><button class="entry-delete" data-delete-journal="${item.id}">刪除</button><b>${escapeHtml(item.mood)}</b> <small>${formatTime(item.ts)}</small><div>${escapeHtml(item.text)}</div>${item.win ? `<div>✨ ${escapeHtml(item.win)}</div>` : ""}</article>`).join("") : '<div class="empty">還沒有世界紀錄。今天的一句話，就能成為第一頁。</div>';
  $$('[data-delete-journal]', list).forEach((button) => button.addEventListener("click", () => {
    if (!confirm("要刪除這則世界紀錄嗎？")) return;
    state.journals = state.journals.filter((item) => item.id !== button.dataset.deleteJournal); saveState(); renderJournals();
  }));
}

function bindJourney() {
  renderTasks();
  $("#addTaskBtn").addEventListener("click", () => {
    const text = $("#newTaskInput").value.trim();
    const reward = Math.max(1, Math.min(50, +$("#newTaskReward").value || 10));
    if (!text) return showToast("先寫下想做的小旅程");
    state.tasks.push({ id: makeId(), text, reward, doneDate: "" });
    saveState(); renderTasks(); $("#newTaskInput").value = "";
  });
}

function renderTasks() {
  const date = todayKey();
  const completed = state.tasks.filter((task) => task.doneDate === date).length;
  $("#journeyProgress").textContent = `${completed} / ${state.tasks.length}`;
  $("#taskList").innerHTML = state.tasks.map((task) => {
    const done = task.doneDate === date;
    return `<article class="task ${done ? "done" : ""}"><input type="checkbox" data-task="${task.id}" ${done ? "checked" : ""}><div><div class="task-name">${escapeHtml(task.text)}</div><small>+${task.reward} EXP</small></div><button data-delete-task="${task.id}">刪除</button></article>`;
  }).join("");
  $$('[data-task]').forEach((checkbox) => checkbox.addEventListener("change", () => {
    const task = state.tasks.find((item) => item.id === checkbox.dataset.task);
    if (checkbox.checked && task.doneDate !== date) {
      task.doneDate = date;
      grantRewards({ exp: task.reward, shells: rewardRules.journey.shells }, task.text);
      if (state.tasks.length && state.tasks.every((item) => item.doneDate === date) && state.lastStarDate !== date) {
        state.lastStarDate = date;
        grantRewards({ stars: 1 }, "完成今天的全部旅程");
      }
    } else if (!checkbox.checked) task.doneDate = "";
    saveState(); renderTasks();
  }));
  $$('[data-delete-task]').forEach((button) => button.addEventListener("click", () => {
    state.tasks = state.tasks.filter((item) => item.id !== button.dataset.deleteTask); saveState(); renderTasks();
  }));
}

function bindKitchen() {
  renderKitchen();
  $("#saveKitchen").addEventListener("click", () => {
    const checks = { water: $("#waterCheck").checked, veg: $("#vegCheck").checked, protein: $("#proteinCheck").checked, move: $("#moveCheck").checked };
    state.kitchen.unshift({ id: makeId(), ts: Date.now(), weight: $("#weightInput").value, waist: $("#waistInput").value, food: $("#foodInput").value.trim(), body: $("#bodyInput").value.trim(), checks });
    saveState(); renderKitchen(); grantRewards(rewardRules.kitchen, "廚房紀錄");
  });
}

function renderKitchen() {
  const list = $("#kitchenList");
  list.innerHTML = state.kitchen.length ? state.kitchen.map((item) => {
    const habits = Object.values(item.checks || {}).filter(Boolean).length;
    return `<article class="entry"><button class="entry-delete" data-delete-kitchen="${item.id}">刪除</button><b>${item.weight || "—"} kg・${item.waist || "—"} cm</b> <small>${formatTime(item.ts)}</small><div>${escapeHtml(item.food)}</div><div>${escapeHtml(item.body)}</div><small>今日完成 ${habits} 個照顧身體的小行動</small></article>`;
  }).join("") : '<div class="empty">還沒有廚房紀錄。</div>';
  $$('[data-delete-kitchen]', list).forEach((button) => button.addEventListener("click", () => {
    if (!confirm("要刪除這筆廚房紀錄嗎？")) return;
    state.kitchen = state.kitchen.filter((item) => item.id !== button.dataset.deleteKitchen); saveState(); renderKitchen();
  }));
}

function bindBoss() {
  renderBosses();
  $("#saveBoss").addEventListener("click", () => {
    state.bosses.unshift({ id: makeId(), ts: Date.now(), boss: $("#bossSelect").value, event: $("#bossEvent").value.trim(), skill: $("#bossSkill").value.trim(), result: $("#bossResult").value });
    saveState(); renderBosses(); grantRewards(rewardRules.boss, "Boss 紀錄");
  });
}

function renderBosses() {
  const list = $("#bossList");
  list.innerHTML = state.bosses.length ? state.bosses.map((item) => `<article class="entry"><button class="entry-delete" data-delete-boss="${item.id}">刪除</button><b>👹 ${escapeHtml(item.boss)}</b> <small>${formatTime(item.ts)}</small><div>${escapeHtml(item.event)}</div><div>使用技能：${escapeHtml(item.skill || "尚未找到")}</div><small>結果：${escapeHtml(item.result)}</small></article>`).join("") : '<div class="empty">Boss 圖鑑還是空的。重點不是打贏，而是找到稍微有效的方法。</div>';
  $$('[data-delete-boss]', list).forEach((button) => button.addEventListener("click", () => {
    if (!confirm("要刪除這場 Boss 紀錄嗎？")) return;
    state.bosses = state.bosses.filter((item) => item.id !== button.dataset.deleteBoss); saveState(); renderBosses();
  }));
}

function bindGallery() {
  galleryFilter = "all";
  renderGallery();
  $$('[data-filter]').forEach((button) => button.addEventListener("click", () => {
    galleryFilter = button.dataset.filter;
    $$('[data-filter]').forEach((item) => item.classList.toggle("active", item === button));
    renderGallery();
  }));
  $("#savePhotos").addEventListener("click", async () => {
    const files = [...$("#photoInput").files];
    if (!files.length) return showToast("請先選擇照片");
    for (const file of files) {
      const src = await compressImage(file, 1400, 0.84);
      await mediaPut({ id: makeId(), type: "reality", ts: Date.now(), src, caption: $("#photoCaption").value.trim(), keep: true });
    }
    grantRewards({ shells: rewardRules.photo.shells * files.length }, `${files.length} 張現實照片`);
    $("#photoInput").value = ""; $("#photoCaption").value = ""; renderGallery();
  });
}

async function renderGallery() {
  const grid = $("#galleryGrid");
  if (!grid) return;
  let items = (await mediaAll()).sort((a, b) => b.ts - a.ts);
  if (galleryFilter === "reality") items = items.filter((item) => item.type === "reality");
  if (galleryFilter === "world") items = items.filter((item) => item.type === "world");
  if (galleryFilter === "kept") items = items.filter((item) => item.keep);
  $("#galleryCount").textContent = `${items.length} 張`;
  grid.innerHTML = items.length ? items.map((item) => `<article class="photo-card"><img src="${item.src}" alt="${escapeHtml(item.caption || "回憶照片")}"><div class="photo-meta"><b>${item.type === "world" ? "世界留影" : "現實照片"}</b><div>${escapeHtml(item.caption || "沒有文字")}</div><small>${formatTime(item.ts)}</small></div><div class="photo-actions"><button class="keep ${item.keep ? "active" : ""}" data-keep="${item.id}">${item.keep ? "已保留" : "保留"}</button><button class="delete" data-delete-photo="${item.id}">刪除</button></div></article>`).join("") : '<div class="empty">這一頁還沒有照片。</div>';
  $$('[data-keep]', grid).forEach((button) => button.addEventListener("click", async () => {
    const item = (await mediaAll()).find((photo) => photo.id === button.dataset.keep);
    item.keep = !item.keep; await mediaPut(item); renderGallery();
  }));
  $$('[data-delete-photo]', grid).forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("要永久刪除這張照片嗎？")) return;
    await mediaDelete(button.dataset.deletePhoto); renderGallery();
  }));
}

function bindResource(type) {
  const meta = resourceMeta[type];
  modalTitle.textContent = `${meta.icon} ${meta.name}`;
  $("#resourceBigIcon").textContent = meta.icon;
  $("#resourceAmount").textContent = `${state.resources[type].toLocaleString()} ${meta.name}`;
  $("#resourceDescription").textContent = meta.description;
  const logs = state.resourceLog.filter((item) => item.type === type);
  $("#resourceLog").innerHTML = logs.length ? logs.map((item) => `<article class="entry"><b>+${item.amount}</b> ${escapeHtml(item.reason)} <small>${formatTime(item.ts)}</small></article>`).join("") : '<div class="empty">還沒有獲得紀錄，從一件小事開始就好。</div>';
}

async function compressImage(file, maxWidth, quality) {
  const image = await fileToImage(file);
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = reader.result; };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

$("#catBtn").addEventListener("click", () => showToast("貓咪抬頭看了 13 一眼，然後慢慢眨眼。"));
$("#companionBtn").addEventListener("click", () => showToast("貓咪 AI GM：今天想做很多事，還是先坐一下？"));
$("#streetBtn").addEventListener("click", () => showToast("街道是第二張地圖，正在準備開門。森林會等你之後決定。"));
$("#bottleBtn").addEventListener("click", () => {
  const messages = ["今天不用走很遠，回來就好。", "疲累是狀態，不是能力變差。", "完成最小任務，也算前進。", "如果不能做到一百分，先做五分也可以。", "世界會記得你的努力，就算你自己忘了。"];
  grantRewards(rewardRules.bottle, "打開漂流瓶");
  showToast(messages[Math.floor(Math.random() * messages.length)]);
});

$("#worldShotBtn").addEventListener("click", takeWorldShot);
const bgm = $("#bgm");
const musicToggle = $("#musicToggle");
const musicVolume = $("#musicVolume");
bgm.volume = Number(localStorage.getItem("project13.bgm.volume") || 0.45);
musicVolume.value = bgm.volume;
musicToggle.addEventListener("click", async () => {
  if (bgm.paused) {
    try { await bgm.play(); musicToggle.textContent = "Ⅱ"; musicToggle.classList.add("playing"); musicToggle.setAttribute("aria-label", "暫停背景音樂"); }
    catch { showToast("請再點一次音樂鍵開始播放"); }
  } else {
    bgm.pause(); musicToggle.textContent = "♪"; musicToggle.classList.remove("playing"); musicToggle.setAttribute("aria-label", "播放背景音樂");
  }
});
musicVolume.addEventListener("input", () => { bgm.volume = Number(musicVolume.value); localStorage.setItem("project13.bgm.volume", bgm.volume); });
async function takeWorldShot() {
  const background = new Image(); background.src = "assets/background/room-window.png"; await background.decode();
  const cat = new Image(); cat.src = "assets/sprites/cat.png"; await cat.decode();
  const bottle = new Image(); bottle.src = "assets/sprites/bottle.png"; await bottle.decode();
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 900;
  const ctx = canvas.getContext("2d"); ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(cat, 620, 520, 220, 220); ctx.drawImage(bottle, 1030, 650, 110, 110);
  const gradient = ctx.createLinearGradient(0, 0, 0, 170); gradient.addColorStop(0, "#113d50dd"); gradient.addColorStop(1, "#113d5000"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, 180);
  const { level } = levelInfo(); ctx.fillStyle = "white"; ctx.font = "800 44px system-ui"; ctx.fillText(`13・Lv.${level}`, 36, 64); ctx.font = "26px system-ui"; ctx.fillText(new Date().toLocaleString("zh-TW"), 36, 108);
  await mediaPut({ id: makeId(), type: "world", ts: Date.now(), src: canvas.toDataURL("image/jpeg", 0.86), caption: "Project 13 世界留影", keep: true });
  grantRewards(rewardRules.worldShot, "世界留影"); showToast("世界留影已放進回憶館");
}

renderHud();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("service-worker.js").catch(() => {});
