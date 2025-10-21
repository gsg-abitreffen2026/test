
/* Browser Dashboard (vanilla JS) — uses Google Sheets 'gviz' to read data (public link required) */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// ---- Simple Router/Tabs ----
const nav = $("#mainNav");
document.querySelectorAll(".nav button").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
function showTab(id) {
  Array.from(document.querySelectorAll("#view > section")).forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
}

// ---- Login ----
const PASSWORDS = { Maxi: "avus", Thorsten: "avus" };
document.getElementById("loginBtn").addEventListener("click", () => {
  const user = document.getElementById("userSelect").value;
  const pass = document.getElementById("passwordInput").value;
  if (PASSWORDS[user] === pass) {
    nav.classList.remove("hidden");
    document.getElementById("login").classList.add("hidden");
    showTab("dashboard");
    bootstrap(); // load data
  } else {
    alert("Login fehlgeschlagen");
  }
});

// ---- Config ----
const CONFIG = window.CONFIG || {};
const SHEET_ID = CONFIG.sheetId;
const TABS = CONFIG.tabs;

// ---- Helpers ----
function gvizUrl(sheetName, query = "") {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}${query?`&tq=${encodeURIComponent(query)}`:""}`;
}
async function fetchGViz(sheetName) {
  const res = await fetch(gvizUrl(sheetName));
  if (!res.ok) throw new Error("HTTP " + res.status);
  const text = await res.text();
  const json = JSON.parse(text.replace(/^[^{]+/, "").replace(/\);?$/,""));
  const cols = (json.table.cols||[]).map(c => c.label || c.id);
  const rows = (json.table.rows||[]).map(r => {
    const o = {};
    (r.c||[]).forEach((cell, i) => { o[cols[i] || `c${i}`] = cell ? (cell.v ?? "") : ""; });
    return o;
  });
  return rows;
}
function by(arr, key, def=""){ return (arr||[]).map(x => (x[key] ?? def)); }
function telHref(phone) { return `tel:${String(phone||"").replace(/\s+/g,"")}`; }
function mailtoHref(email, subject) {
  const s = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return `mailto:${encodeURIComponent(email||"")}${s}`;
}
function drawBarChart(canvas, labels, values) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth;
  const h = canvas.height = canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  const max = Math.max(1, ...values);
  const pad = 24, gap = 12;
  const barW = (w - pad*2 - gap*(values.length-1)) / values.length;
  ctx.fillStyle = "#16a34a";
  ctx.font = "12px system-ui";
  values.forEach((v,i) => {
    const x = pad + i*(barW+gap);
    const bh = Math.round((h - pad*2) * (v/max));
    const y = h - pad - bh;
    ctx.fillRect(x, y, barW, bh);
    ctx.fillText(String(labels[i]), x, h - pad + 14);
  });
}

// ---- State ----
let state = {
  perDay: 25,
  template: "",
  campaignRunning: false,
  templates: [],
  contacts: [],
  todos: [],
  inbox: { hot: [], need: [], reply: [] },
  stats: { sent: 0, replies: 0, hot: 0, needReview: 0, meetings: 0 },
  blacklist: [],
  bounces: []
};

// ---- Bootstrap ----
async function bootstrap() {
  try {
    const [contacts, stats, hot, need, reply, todos, templates, blacklist, bounces] = await Promise.all([
      fetchGViz(TABS.contacts).catch(()=>[]),
      fetchGViz(TABS.stats).catch(()=>[]),
      fetchGViz(TABS.inboxHot).catch(()=>[]),
      fetchGViz(TABS.inboxNeedReview).catch(()=>[]),
      fetchGViz(TABS.inboxReply).catch(()=>[]),
      fetchGViz(TABS.todos).catch(()=>[]),
      fetchGViz(TABS.templates).catch(()=>[]),
      fetchGViz(TABS.blacklist).catch(()=>[]),
      fetchGViz(TABS.bounces).catch(()=>[]),
    ]);

    const pick = (row, keys) => {
      const norm = Object.fromEntries(Object.entries(row).map(([k,v]) => [String(k).toLowerCase(), v]));
      const out = {};
      Object.entries(keys).forEach(([to, from]) => {
        const f = Array.isArray(from) ? from : [from];
        const found = f.map(x => String(x).toLowerCase()).find(k => k in norm);
        out[to] = norm[found] ?? "";
      });
      return out;
    };

    state.contacts = contacts.map(r => pick(r, {
      firstName: ["firstname","vorname","first name","first"],
      lastName: ["lastname","nachname","last name","last"],
      company: ["company","firma","organisation","org"],
      email: ["email","mail","e-mail"],
      status: ["status"],
      disabled: ["disabled","deaktiviert"],
      tags: ["tags"]
    })).map(x => ({...x, disabled: String(x.disabled).toLowerCase() === "true" || x.disabled === 1, tags: String(x.tags||"").split("|").filter(Boolean)}));

    if (stats.length) {
      const s = pick(stats[0], { sent:"sent", replies:"replies", hot:"hot", needReview:"needreview", meetings:"meetings" });
      state.stats = { sent: +s.sent||0, replies: +s.replies||0, hot: +s.hot||0, needReview: +s.needReview||0, meetings: +s.meetings||0 };
    } else {
      state.stats = { sent: state.contacts.length, replies: 0, hot: 0, needReview: 0, meetings: 0 };
    }

    state.inbox.hot = hot.map(r => pick(r, { subject:"subject", from:"from", date:"date", snippet:"snippet" }));
    state.inbox.need = need.map(r => pick(r, { subject:"subject", from:"from", date:"date", snippet:"snippet" }));
    state.inbox.reply = reply.map(r => pick(r, { subject:"subject", from:"from", date:"date", snippet:"snippet" }));
    state.todos = todos.map(r => pick(r, { person:["person","ansprechpartner","kontakt"], company:"company", phone:["phone","telefon"], lastMailAt:["lastmailat","last mail","timestamp"] }));
    state.templates = templates.map(r => pick(r, { name:"name", step:["step","title"], body:["body","text"] }));
    state.blacklist = blacklist.map(r => by([r], Object.keys(r)[0])[0]).filter(Boolean);
    state.bounces = bounces.map(r => by([r], Object.keys(r)[0])[0]).filter(Boolean);

    renderAll();
  } catch (e) {
    console.error(e);
    alert("Fehler beim Laden der Sheets. Stelle sicher, dass die Tabs öffentlich und die Tab‑Namen korrekt sind.");
  }
}

// ---- Renderers ----
function renderAll() {
  const templatesSet = Array.from(new Set(state.templates.map(t => t.name))).filter(Boolean);
  document.getElementById("templateSelect").innerHTML = templatesSet.map(n => `<option>${escapeHtml(n)}</option>`).join("");
  document.getElementById("tplPicker").innerHTML = document.getElementById("templateSelect").innerHTML;
  state.template = templatesSet[0] || "";

  renderTodos();
  renderInbox();
  renderKPIs();
  renderChart();
  renderContacts();
  renderBlacklist();

  document.getElementById("perDayInput").value = state.perDay;
  document.getElementById("perDayInput").addEventListener("input", e => state.perDay = +e.target.value || 0);
  document.getElementById("templateSelect").addEventListener("change", e => state.template = e.target.value);
  document.getElementById("limitSelect").addEventListener("change", renderContacts);
  document.getElementById("showDisabled").addEventListener("change", renderContacts);
  document.getElementById("startBtn").addEventListener("click", startCampaign);
  document.getElementById("stopBtn").addEventListener("click", stopCampaign);
  document.getElementById("tplPicker").addEventListener("change", renderTemplateSteps);
  document.getElementById("blSearch").addEventListener("input", renderBlacklist);
  document.getElementById("includeBounces").addEventListener("change", renderBlacklist);
  document.getElementById("blAddBtn").addEventListener("click", () => {
    const email = document.getElementById("blAdd").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert("Bitte gültige E‑Mail");
    state.blacklist.unshift(email);
    document.getElementById("blAdd").value = "";
    renderBlacklist();
  });
  document.getElementById("importBtn").addEventListener("click", () => alert("Import-Demo: Schreiben nach Sheets ist deaktiviert."));

  renderTemplateSteps();
}

function renderTodos() {
  const ul = document.getElementById("todoList");
  ul.innerHTML = state.todos.map(t => `
    <li>
      <div><strong>${escapeHtml(t.person||"")}</strong></div>
      <div class="meta">${escapeHtml(t.company||"")} · <a class="tel" href="${telHref(t.phone)}">${escapeHtml(t.phone||"")}</a> · ${escapeHtml(t.lastMailAt||"")}</div>
    </li>
  `).join("") || `<li class="meta">Keine Einträge</li>`;
}

function renderInbox() {
  const asItem = (it, hot) => `
    <li>
      <div><strong>${hot ? `<a href="${mailtoHref(it.from, it.subject ? "Re: " + it.subject : "")}" class="tel">${escapeHtml(it.subject||"(Ohne Betreff)")}</a>` : escapeHtml(it.subject||"(Ohne Betreff)")}</strong></div>
      <div class="meta">${escapeHtml(it.from||"")} · ${escapeHtml(it.date||"")}</div>
      ${it.snippet?`<div>${escapeHtml(it.snippet)}</div>`:""}
    </li>`;
  document.getElementById("hotList").innerHTML = state.inbox.hot.map(x => asItem(x, true)).join("") || `<li class="meta">Keine Einträge</li>`;
  document.getElementById("nrList").innerHTML = state.inbox.need.map(x => asItem(x, false)).join("") || `<li class="meta">Keine Einträge</li>`;
  document.getElementById("replyList").innerHTML = state.inbox.reply.map(x => asItem(x, false)).join("") || `<li class="meta">Keine Einträge</li>`;
  document.getElementById("hotCount").textContent = state.inbox.hot.length;
  document.getElementById("nrCount").textContent = state.inbox.need.length;
  document.getElementById("replyCount").textContent = state.inbox.reply.length;
}

function renderKPIs() {
  document.getElementById("kpiSent").textContent = state.stats.sent;
  document.getElementById("kpiReplies").textContent = state.stats.replies;
}

function renderChart() {
  const labels = ["Gesendet", "Antworten", "HOT", "Need Review", "Meetings"];
  const values = [state.stats.sent, state.stats.replies, state.stats.hot, state.stats.needReview, state.stats.meetings];
  drawBarChart(document.getElementById("chart"), labels, values);
}

function renderContacts() {
  const limit = +document.getElementById("limitSelect").value || 25;
  const showDisabled = document.getElementById("showDisabled").checked;
  const rows = state.contacts.filter(c => showDisabled || !c.disabled).slice(0, limit);
  const tbody = document.querySelector("#contactsTable tbody");
  tbody.innerHTML = rows.map(c => `
    <tr>
      <td>${escapeHtml(`${c.firstName||""} ${c.lastName||""}`.trim())}</td>
      <td>${escapeHtml(c.company||"")}</td>
      <td>${escapeHtml(c.email||"")}</td>
      <td>${(c.tags||[]).map(t => `<span class="badge" style="margin-right:4px">${escapeHtml(t)}</span>`).join("")}</td>
      <td><span class="badge">${escapeHtml(c.status||"Lead")}</span></td>
      <td>
        <label><input type="checkbox" ${c.disabled?"checked":""} data-email="${escapeAttr(c.email||"")}" class="disableToggle"> deaktiviert</label>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".disableToggle").forEach(cb => cb.addEventListener("change", (e) => {
    const mail = e.target.getAttribute("data-email");
    const found = state.contacts.find(x => x.email === mail);
    if (found) found.disabled = e.target.checked;
  }));
}

function renderTemplateSteps() {
  const name = document.getElementById("tplPicker").value;
  const steps = state.templates.filter(t => t.name === name);
  const labels = ["Anschreiben","Follow‑up 1","Follow‑up 2","Follow‑up 3"];
  const container = document.getElementById("tplSteps");
  container.innerHTML = "";
  labels.forEach((lab) => {
    const step = steps.find(s => (s.step||s.title) == lab) || { body: "" };
    const ta = document.createElement("textarea");
    ta.value = step.body || "";
    ta.dataset.step = lab;
    const wrap = document.createElement("div");
    wrap.className = "step";
    const row = document.createElement("div");
    row.className = "row";
    ["{{firstName}}","{{lastName}}","{{company}}","{{email}}"].forEach(tok => {
      const btn = document.createElement("button");
      btn.textContent = tok.replace("{{firstName}}","Vorname").replace("{{lastName}}","Nachname").replace("{{company}}","Firma").replace("{{email}}","E‑Mail");
      btn.className = "secondary";
      btn.addEventListener("click", (ev) => { ev.preventDefault(); insertAtCursor(ta, tok); });
      row.appendChild(btn);
    });
    wrap.innerHTML = `<label>${lab}</label>`;
    wrap.appendChild(ta);
    wrap.appendChild(row);
    container.appendChild(wrap);
  });
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const before = textarea.value.slice(0,start);
  const after = textarea.value.slice(end);
  textarea.value = before + text + after;
  const pos = start + text.length;
  textarea.focus();
  textarea.setSelectionRange(pos, pos);
}

function renderBlacklist() {
  const q = (document.getElementById("blSearch").value || "").trim().toLowerCase();
  const withBounces = document.getElementById("includeBounces").checked;
  const arr = withBounces ? [...state.blacklist, ...state.bounces] : [...state.blacklist];
  const list = arr.filter(x => !q || String(x).toLowerCase().includes(q));
  document.getElementById("blList").innerHTML = list.map(x => `<li>${escapeHtml(x)}</li>`).join("") || `<li class="meta">Keine Einträge</li>`;
}

// ---- Campaign ----
function computeNextDailyRun(timeHHMM, now = new Date()) {
  const [h,m] = (timeHHMM||"09:00").split(":").map(x=>parseInt(x,10));
  const next = new Date(now);
  next.setHours(h||0, m||0, 0, 0);
  if (next <= now) next.setDate(next.getDate()+1);
  return next;
}

function startCampaign() {
  state.campaignRunning = true;
  document.getElementById("campaignBadge").classList.remove("hidden");
  document.getElementById("stopBtn").disabled = false;
  document.getElementById("startBtn").disabled = true;
  const next = computeNextDailyRun("09:00", new Date());
  document.getElementById("nextRun").textContent = "Nächste Welle: " + next.toLocaleString();
}

function stopCampaign() {
  state.campaignRunning = false;
  document.getElementById("campaignBadge").classList.add("hidden");
  document.getElementById("stopBtn").disabled = true;
  document.getElementById("startBtn").disabled = false;
  document.getElementById("nextRun").textContent = "";
}

// ---- Utils ----
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
