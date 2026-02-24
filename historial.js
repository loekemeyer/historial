'use strict';

/* =========================
   CONFIG
========================= */
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_KEY = "sb_publishable_mVX5MnjwM770cNjgiL6yLw_LDNl9pML";

/**
 * Si en el futuro querés redirecciones de auth (OAuth/magic links),
 * acordate de agregar el dominio NUEVO en:
 * Supabase -> Authentication -> URL Configuration
 * (Site URL y Additional Redirect URLs)
 */
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* =========================
   DOM HELPERS
========================= */
const $ = (id) => document.getElementById(id);

const elSubtitle    = $("subtitle");
const loginCard     = $("loginCard");
const loginStatus   = $("loginStatus");
const appWrap       = $("appWrap");

const btnLogin      = $("btnLogin");
const btnReset      = $("btnReset");
const btnLogout     = $("btnLogout");

const emailInput    = $("email");
const passInput     = $("password");

const tabHistorial  = $("tabHistorial");
const tabNovedades  = $("tabNovedades");
const panelHist     = $("panelHistorial");
const panelNov      = $("panelNovedades");

const clienteBox    = $("cliente");
const statusBox     = $("status");
const tabla         = $("tabla");
const thead         = $("thead");
const tbody         = $("tbody");

const rangeYearsSel = $("rangeYears");
const btnReload     = $("btnReload");

/* =========================
   UI STATE
========================= */
function showLogin(msg = "") {
  loginCard.classList.remove("hidden");
  appWrap.classList.add("hidden");
  btnLogout.classList.add("hidden");
  elSubtitle.textContent = "Ingresá para ver tu historial";
  loginStatus.textContent = msg;
}

function showApp() {
  loginCard.classList.add("hidden");
  appWrap.classList.remove("hidden");
  btnLogout.classList.remove("hidden");
  loginStatus.textContent = "";
}

function setStatus(msg) {
  statusBox.textContent = msg;
  statusBox.classList.remove("hidden");
  tabla.classList.add("hidden");
}

function clearStatus() {
  statusBox.textContent = "";
  statusBox.classList.add("hidden");
}

function setActiveTab(which) {
  const isHist = which === "historial";
  tabHistorial.classList.toggle("active", isHist);
  tabNovedades.classList.toggle("active", !isHist);
  panelHist.classList.toggle("hidden", !isHist);
  panelNov.classList.toggle("hidden", isHist);
}

/* =========================
   AUTH
========================= */
async function readSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error("getSession error:", error);
    return null;
  }
  return data?.session || null;
}

async function doLogin() {
  const email = (emailInput.value || "").trim();
  const password = passInput.value || "";

  if (!email || !password) {
    loginStatus.textContent = "Completá email y contraseña.";
    return;
  }

  loginStatus.textContent = "Ingresando…";

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("signInWithPassword error:", error);
    loginStatus.textContent = "Email o contraseña incorrectos.";
    return;
  }

  if (!data?.session) {
    loginStatus.textContent = "No se pudo iniciar sesión.";
    return;
  }

  // El listener onAuthStateChange se encarga del resto
}

async function doResetPassword() {
  const email = (emailInput.value || "").trim();
  if (!email) {
    loginStatus.textContent = "Escribí tu email para enviarte el reset.";
    return;
  }

  loginStatus.textContent = "Enviando email de recuperación…";

  // OJO: para reset por email, tu dominio nuevo debe estar permitido en Supabase Auth URL config
  const redirectTo = window.location.href.split("#")[0]; // vuelve a esta misma página
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    console.error("resetPasswordForEmail error:", error);
    loginStatus.textContent = "No se pudo enviar el email de recuperación.";
    return;
  }

  loginStatus.textContent = "Listo. Revisá tu email para recuperar la contraseña.";
}

async function doLogout() {
  await sb.auth.signOut();
  // listener se ocupa del resto
}

/* =========================
   DATA
========================= */
async function getClienteByAuth(session) {
  const { data, error } = await sb
    .from("customers")
    .select("cod_cliente, business_name")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("getCliente error:", error);
    return { error: "No se pudo cargar el cliente (RLS o datos)." };
  }
  if (!data) {
    return { error: "No se encontró cliente asociado a esta cuenta (falta vincular auth_user_id)." };
  }
  return { data };
}

function isoDateYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - Number(years || 5));
  // dejamos hora 00:00:00 para incluir todo el día
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
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
    console.error("getSales error:", error);
    return { error: "Error cargando ventas (RLS o datos)." };
  }
  return { data: data || [] };
}

/* =========================
   TABLE RENDER
========================= */
function ymKeyFromDate(d) {
  // y*12 + (m-1) => entero ordenable
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12
  return (y * 12) + (m - 1);
}

function ymLabel(ymKey) {
  const y = Math.floor(ymKey / 12);
  const m0 = ymKey % 12; // 0-11
  const dt = new Date(y, m0, 1);
  return dt.toLocaleString("es-AR", { month: "short", year: "numeric" });
}

function renderTabla(rows) {
  if (!rows.length) {
    setStatus("Sin datos en el rango seleccionado.");
    return;
  }

  // 1) Meses ordenables
  const mesesSet = new Set();
  for (const r of rows) {
    if (!r.invoice_date) continue;
    const d = new Date(r.invoice_date);
    if (Number.isNaN(d.getTime())) continue;
    mesesSet.add(ymKeyFromDate(d));
  }
  const meses = Array.from(mesesSet).sort((a, b) => a - b);

  // 2) Agrupar por item_code
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

  // HEADER
  thead.innerHTML = "";
  const trh = document.createElement("tr");

  const headerCols = ["Código", "Descripción", "Total"];
  for (const t of headerCols) {
    const th = document.createElement("th");
    th.textContent = t;
    trh.appendChild(th);
  }

  for (const ym of meses) {
    const th = document.createElement("th");
    th.textContent = ymLabel(ym);
    trh.appendChild(th);
  }

  thead.appendChild(trh);

  // BODY
  tbody.innerHTML = "";

  for (const p of arr) {
    const tr = document.createElement("tr");

    const tdCod = document.createElement("td");
    tdCod.textContent = p.cod;
    tr.appendChild(tdCod);

    const tdDesc = document.createElement("td");
    tdDesc.textContent = p.desc; // por ahora la descripción = código (después lo conectamos a productos)
    tdDesc.className = "desc";
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
}

/* =========================
   APP FLOW
========================= */
let CURRENT_SESSION = null;

async function loadHistorial() {
  if (!CURRENT_SESSION) return;

  setStatus("Cargando…");
  tabla.classList.add("hidden");

  const yearsBack = Number(rangeYearsSel.value || 5);

  const c = await getClienteByAuth(CURRENT_SESSION);
  if (c.error) {
    setStatus(c.error);
    clienteBox.textContent = "—";
    elSubtitle.textContent = "Error";
    return;
  }

  const cliente = c.data;
  clienteBox.textContent = `${cliente.business_name} (${cliente.cod_cliente})`;
  elSubtitle.textContent = `Cliente: ${cliente.business_name}`;

  const s = await getSalesLines(cliente.cod_cliente, yearsBack);
  if (s.error) {
    setStatus(s.error);
    return;
  }

  renderTabla(s.data);
}

function bindUI() {
  btnLogin.addEventListener("click", doLogin);
  btnReset.addEventListener("click", doResetPassword);
  btnLogout.addEventListener("click", doLogout);

  tabHistorial.addEventListener("click", () => setActiveTab("historial"));
  tabNovedades.addEventListener("click", () => setActiveTab("novedades"));

  btnReload.addEventListener("click", loadHistorial);
  rangeYearsSel.addEventListener("change", loadHistorial);

  // Enter para login
  passInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

async function init() {
  bindUI();
  setActiveTab("historial");

  // 1) Revisión sesión al entrar
  const session = await readSession();
  if (!session) {
    showLogin("");
  } else {
    CURRENT_SESSION = session;
    showApp();
    await loadHistorial();
  }

  // 2) Listener cambios auth (login/logout)
  sb.auth.onAuthStateChange(async (_event, session2) => {
    if (!session2) {
      CURRENT_SESSION = null;
      showLogin("Sesión cerrada.");
      return;
    }

    CURRENT_SESSION = session2;
    showApp();
    await loadHistorial();
  });
}

document.addEventListener("DOMContentLoaded", init);
