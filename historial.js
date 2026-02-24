'use strict';

/* =========================
   CONFIG
========================= */
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_KEY = "sb_publishable_mVX5MnjwM770cNjgiL6yLw_LDNl9pML";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* =========================
   DOM
========================= */
const $ = (id) => document.getElementById(id);

const sub = $("sub");

const loginBox = $("loginBox");
const app = $("app");
const email = $("email");
const pass = $("pass");
const btnLogin = $("btnLogin");
const btnReset = $("btnReset");
const btnLogout = $("btnLogout");
const loginMsg = $("loginMsg");

const tabHist = $("tabHist");
const tabSug = $("tabSug");
const tabNov = $("tabNov");
const panelHist = $("panelHist");
const panelSug = $("panelSug");
const panelNov = $("panelNov");

const clienteActual = $("clienteActual");
const status = $("status");
const tabla = $("tabla");
const thead = $("thead");
const tbody = $("tbody");

const rangeYears = $("rangeYears");
const btnReload = $("btnReload");
const btnPdf = $("btnPdf");

const adminBox = $("adminBox");
const adminClientCode = $("adminClientCode");
const btnLoadClient = $("btnLoadClient");

/* =========================
   STATE
========================= */
let SESSION = null;
let ME = null;                // registro customers del usuario logueado
let IS_ADMIN = false;
let ACTIVE_CLIENT_CODE = null; // cod_cliente actualmente cargado
let LAST_RENDER_HTML = null;    // cache del render para no “perder” al cambiar de pestaña
let LAST_RENDER_META = null;    // {clienteName, clienteCode, yearsBack, monthsLabels...}

/* =========================
   UI helpers
========================= */
function showLogin(message = "") {
  loginBox.classList.remove("hidden");
  app.classList.add("hidden");
  btnLogout.classList.add("hidden");
  loginMsg.textContent = message;
  sub.textContent = "Ingresá para ver tu historial.";
}

function showApp() {
  loginBox.classList.add("hidden");
  app.classList.remove("hidden");
  btnLogout.classList.remove("hidden");
}

function setStatus(msg) {
  status.textContent = msg;
  tabla.classList.add("hidden");
}

function clearStatus() {
  status.textContent = "";
}

function setActiveTab(tab) {
  tabHist.classList.toggle("active", tab === "hist");
  tabSug.classList.toggle("active", tab === "sug");
  tabNov.classList.toggle("active", tab === "nov");

  panelHist.classList.toggle("hidden", tab !== "hist");
  panelSug.classList.toggle("hidden", tab !== "sug");
  panelNov.classList.toggle("hidden", tab !== "nov");
}

/* =========================
   AUTH
========================= */
async function safeGetSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) return null;
  return data?.session || null;
}

async function doLogin() {
  const e = (email.value || "").trim();
  const p = pass.value || "";
  if (!e || !p) return (loginMsg.textContent = "Completá email y contraseña.");

  loginMsg.textContent = "Ingresando…";
  const { data, error } = await sb.auth.signInWithPassword({ email: e, password: p });
  if (error || !data?.session) {
    console.error(error);
    loginMsg.textContent = "Email o contraseña incorrectos.";
    return;
  }
  // onAuthStateChange se encarga
}

async function doReset() {
  const e = (email.value || "").trim();
  if (!e) return (loginMsg.textContent = "Escribí tu email para enviarte el reset.");
  loginMsg.textContent = "Enviando…";

  const redirectTo = window.location.href.split("#")[0];
  const { error } = await sb.auth.resetPasswordForEmail(e, { redirectTo });
  if (error) {
    console.error(error);
    loginMsg.textContent = "No se pudo enviar el email de recuperación.";
    return;
  }
  loginMsg.textContent = "Listo. Revisá tu email.";
}

async function doLogout() {
  await sb.auth.signOut();
}

/* =========================
   ADMIN detection
========================= */
/**
 * Espera que exista un registro en customers para el auth_user_id logueado.
 * Para admin:
 *   - customers.is_admin = true  (recomendado)
 * o - customers.role = 'admin'
 */
function computeIsAdmin(customerRow) {
  if (!customerRow) return false;
  if (customerRow.is_admin === true) return true;
  if (String(customerRow.role || "").toLowerCase() === "admin") return true;
  return false;
}

async function loadMe(session) {
  const { data, error } = await sb
    .from("customers")
    .select("cod_cliente, business_name, is_admin, role")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return { error: "No se pudo cargar tu cliente (RLS o datos)." };
  }
  if (!data) return { error: "Tu cuenta no está vinculada a un cliente (customers.auth_user_id)." };
  return { data };
}

/* =========================
   DATA
========================= */
function isoDateYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - Number(years || 5));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function getClienteByCode(cod) {
  const { data, error } = await sb
    .from("customers")
    .select("cod_cliente, business_name")
    .eq("cod_cliente", String(cod))
    .maybeSingle();

  if (error) {
    console.error(error);
    return { error: "No se pudo cargar el cliente por código (RLS o datos)." };
  }
  if (!data) return { error: "No se encontró ese cod_cliente." };
  return { data };
}

async function getSalesLines(codCliente, yearsBack) {
  const since = isoDateYearsAgo(yearsBack);

  const { data, error } = await sb
    .from("sales_lines")
    .select("invoice_date, item_code, boxes")
    .eq("customer_code", String(codCliente))
    .gte("invoice_date", since)
    .order("invoice_date", { ascending: true });

  if (error) {
    console.error(error);
    return { error: "Error cargando ventas (RLS o datos)." };
  }
  return { data: data || [] };
}

/* =========================
   TABLE (meses robustos)
========================= */
function ymKeyFromDate(d) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return (y * 12) + (m - 1);
}
function ymLabel(ymKey) {
  const y = Math.floor(ymKey / 12);
  const m0 = ymKey % 12;
  return new Date(y, m0, 1).toLocaleString("es-AR", { month: "short", year: "numeric" });
}

function renderTable(rows) {
  if (!rows.length) {
    setStatus("Sin datos en el rango seleccionado.");
    return;
  }

  const mesesSet = new Set();
  for (const r of rows) {
    const d = new Date(r.invoice_date);
    if (!Number.isNaN(d.getTime())) mesesSet.add(ymKeyFromDate(d));
  }
  const meses = Array.from(mesesSet).sort((a,b)=>a-b);
  const mesesLabels = meses.map(ymLabel);

  const map = Object.create(null);
  for (const r of rows) {
    const item = (r.item_code || "").trim();
    if (!item) continue;
    const boxes = Number(r.boxes) || 0;

    const d = new Date(r.invoice_date);
    if (Number.isNaN(d.getTime())) continue;
    const ym = ymKeyFromDate(d);

    if (!map[item]) map[item] = { desc: item, total: 0, meses: Object.create(null) };
    map[item].total += boxes;
    map[item].meses[ym] = (map[item].meses[ym] || 0) + boxes;
  }

  const arr = Object.entries(map)
    .map(([cod, v]) => ({ cod, ...v }))
    .sort((a, b) => b.total - a.total);

  // Header
  thead.innerHTML = "";
  const trh = document.createElement("tr");
  ["Código", "Descripción", "Total", ...mesesLabels].forEach((t) => {
    const th = document.createElement("th");
    th.textContent = t;
    trh.appendChild(th);
  });
  thead.appendChild(trh);

  // Body
  tbody.innerHTML = "";
  for (const p of arr) {
    const tr = document.createElement("tr");

    const tdCod = document.createElement("td");
    tdCod.textContent = p.cod;
    tr.appendChild(tdCod);

    const tdDesc = document.createElement("td");
    tdDesc.textContent = p.desc; // después lo conectamos a descripción real
    tdDesc.className = "left";
    tr.appendChild(tdDesc);

    const tdTotal = document.createElement("td");
    tdTotal.textContent = String(p.total);
    tr.appendChild(tdTotal);

    for (const ym of meses) {
      const td = document.createElement("td");
      const v = p.meses[ym] || 0;
      td.textContent = v ? String(v) : "";
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  clearStatus();
  tabla.classList.remove("hidden");

  // Cache HTML para evitar “se borró” cuando el navegador pausa/recupera
  LAST_RENDER_HTML = {
    thead: thead.innerHTML,
    tbody: tbody.innerHTML
  };
  LAST_RENDER_META = { mesesLabels };
}

/* =========================
   LOAD FLOW
========================= */
async function loadHistorialForClientCode(codCliente) {
  if (!SESSION) return;

  const yearsBack = Number(rangeYears.value || 5);

  setStatus("Cargando…");

  // Nombre del cliente (si admin cargó otro)
  let cliInfo;
  if (String(codCliente) === String(ME.cod_cliente)) {
    cliInfo = { cod_cliente: ME.cod_cliente, business_name: ME.business_name };
  } else {
    const c = await getClienteByCode(codCliente);
    if (c.error) return setStatus(c.error);
    cliInfo = c.data;
  }

  ACTIVE_CLIENT_CODE = String(cliInfo.cod_cliente);
  clienteActual.textContent = `${cliInfo.business_name} (${cliInfo.cod_cliente})`;
  sub.textContent = IS_ADMIN ? `Admin: viendo ${cliInfo.business_name}` : `Cliente: ${cliInfo.business_name}`;

  const s = await getSalesLines(cliInfo.cod_cliente, yearsBack);
  if (s.error) return setStatus(s.error);

  renderTable(s.data);
}

function restoreLastRenderIfAny() {
  if (!LAST_RENDER_HTML) return;
  thead.innerHTML = LAST_RENDER_HTML.thead;
  tbody.innerHTML = LAST_RENDER_HTML.tbody;
  tabla.classList.remove("hidden");
  clearStatus();
}

/* =========================
   PDF export
========================= */
function downloadPdf() {
  if (tabla.classList.contains("hidden")) {
    alert("No hay datos para exportar.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const title = `Historial de compras - ${clienteActual.textContent}`;
  doc.setFontSize(12);
  doc.text(title, 40, 32);

  // Exporta EXACTAMENTE lo que estás viendo
  doc.autoTable({
    html: "#tabla",
    startY: 44,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [20, 20, 20] }
  });

  const safeName = (clienteActual.textContent || "historial")
    .replace(/[^\w\s()-]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  doc.save(`${safeName}.pdf`);
}

/* =========================
   Events / binding
========================= */
function bindUI() {
  btnLogin.addEventListener("click", doLogin);
  btnReset.addEventListener("click", doReset);
  btnLogout.addEventListener("click", doLogout);

  pass.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });

  tabHist.addEventListener("click", () => setActiveTab("hist"));
  tabSug.addEventListener("click", () => setActiveTab("sug"));
  tabNov.addEventListener("click", () => setActiveTab("nov"));

  btnReload.addEventListener("click", () => loadHistorialForClientCode(ACTIVE_CLIENT_CODE || ME?.cod_cliente));
  rangeYears.addEventListener("change", () => loadHistorialForClientCode(ACTIVE_CLIENT_CODE || ME?.cod_cliente));

  btnPdf.addEventListener("click", downloadPdf);

  btnLoadClient.addEventListener("click", () => {
    const val = (adminClientCode.value || "").trim();
    if (!val) return alert("Ingresá un cod_cliente.");
    loadHistorialForClientCode(val);
  });

  // FIX: cuando el usuario vuelve a la pestaña del navegador, re-chequea sesión
  // y restaura render si “se borró” visualmente.
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;

    // Re-check sesión (evita que un refresh de token te deje “vacío”)
    const s = await safeGetSession();
    if (s) SESSION = s;

    // Si la tabla está vacía pero tenemos cache, la restauramos
    if (tabla.classList.contains("hidden") && LAST_RENDER_HTML) {
      restoreLastRenderIfAny();
    }
  });
}

/* =========================
   Init
========================= */
async function init() {
  bindUI();
  setActiveTab("hist");

  const s = await safeGetSession();
  if (!s) return showLogin("");

  SESSION = s;

  const me = await loadMe(SESSION);
  if (me.error) return showLogin(me.error);

  ME = me.data;
  IS_ADMIN = computeIsAdmin(ME);

  // UI admin
  adminBox.classList.toggle("hidden", !IS_ADMIN);

  showApp();

  // Por defecto:
  // - Cliente: ve su propio historial
  // - Admin: también arranca en el suyo, pero puede cargar otros
  await loadHistorialForClientCode(ME.cod_cliente);

  // Listener: OJO con “logout fantasma” en background.
  // Si viene session null, revalidamos antes de tirar login.
  sb.auth.onAuthStateChange(async (_event, session2) => {
    if (!session2) {
      // re-chequeo rápido antes de “borrarte”
      await new Promise(r => setTimeout(r, 400));
      const again = await safeGetSession();
      if (again) {
        SESSION = again;
        return; // no cambies UI
      }
      SESSION = null;
      ME = null;
      IS_ADMIN = false;
      ACTIVE_CLIENT_CODE = null;
      showLogin("Sesión cerrada.");
      return;
    }

    SESSION = session2;
    const me2 = await loadMe(SESSION);
    if (me2.error) return showLogin(me2.error);

    ME = me2.data;
    IS_ADMIN = computeIsAdmin(ME);
    adminBox.classList.toggle("hidden", !IS_ADMIN);
    showApp();

    await loadHistorialForClientCode(ACTIVE_CLIENT_CODE || ME.cod_cliente);
  });
}

document.addEventListener("DOMContentLoaded", init);
