// ================= SUPABASE =================
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";

// ⚠️ Ideal: usar la MISMA key del dominio viejo (la que te funcionaba ahí).
// Si esto sigue fallando, cambiamos a tu ANON KEY largo (JWT) como en el sistema original.
const SUPABASE_KEY = "sb_publishable_mVX5MnjwM770cNjgiL6yLw_LDNl9pML";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Si tu login “por CUIT” era CUIT->email interno, definilo acá:
const CUIT_EMAIL_DOMAIN = "clientes.local"; // <- si tu backend usaba otro, lo cambiamos

// helpers
const $ = (id) => document.getElementById(id);

const statusBox = $("status");
const tabla = $("tabla");
const thead = $("thead");
const tbody = $("tbody");

// login UI
const loginBox = $("loginBox");
const loginMsg = $("loginMsg");
const btnLogin = $("btnLogin");
const btnLogout = $("btnLogout");
const userInput = $("user");
const passInput = $("pass");

// tabs UI
const tabHist = $("tabHist");
const tabSug = $("tabSug");
const tabNov = $("tabNov");
const panelHist = $("panelHist");
const panelSug = $("panelSug");
const panelNov = $("panelNov");

// admin UI
const adminBox = $("adminBox");
const adminClientCode = $("adminClientCode");
const btnLoadClient = $("btnLoadClient");
const adminMsg = $("adminMsg");

function setStatus(msg) {
  statusBox.style.display = "block";
  statusBox.innerText = msg;
  tabla.style.display = "none";
}

function hideStatus() {
  statusBox.style.display = "none";
}

function showLogin(msg = "") {
  loginBox.style.display = "block";
  loginMsg.innerText = msg;
  btnLogout.style.display = "none";
}

function hideLogin() {
  loginBox.style.display = "none";
  loginMsg.innerText = "";
  btnLogout.style.display = "inline-block";
}

function setTab(which) {
  // activa botón
  tabHist.classList.toggle("active", which === "hist");
  tabSug.classList.toggle("active", which === "sug");
  tabNov.classList.toggle("active", which === "nov");

  // activa panel
  panelHist.classList.toggle("active", which === "hist");
  panelSug.classList.toggle("active", which === "sug");
  panelNov.classList.toggle("active", which === "nov");
}

// ---------- sesión ----------
async function getSessionSafe() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error("getSession error:", error);
    return null;
  }
  return data?.session || null;
}

// ---------- login ----------
function normalizeUserToEmail(user) {
  const u = (user || "").trim();
  if (!u) return "";

  if (u.includes("@")) return u;

  const onlyDigits = u.replace(/\D/g, "");
  if (onlyDigits.length >= 10) {
    return `${onlyDigits}@${CUIT_EMAIL_DOMAIN}`;
  }
  return u;
}

async function doLogin() {
  const user = (userInput.value || "").trim();
  const password = passInput.value || "";

  if (!user || !password) {
    loginMsg.innerText = "Completá CUIT/email y contraseña.";
    return;
  }

  loginMsg.innerText = "Ingresando...";
  const email = normalizeUserToEmail(user);

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error || !data?.session) {
    console.error("Login error:", error);
    loginMsg.innerText = "No se pudo ingresar. Verificá credenciales.";
    return;
  }

  hideLogin();
  await loadForSession(data.session, null); // null = default (propio cliente)
}

async function doLogout() {
  await sb.auth.signOut();
  $("cliente").innerText = "";
  setStatus("Sesión cerrada.");
  showLogin("Ingresá para ver tu historial.");
  adminBox.style.display = "none";
  adminMsg.innerText = "";
}

// ---------- ADMIN detection ----------
function isAdminRow(row) {
  if (!row) return false;
  if (row.is_admin === true) return true;
  if (String(row.role || "").toLowerCase() === "admin") return true;
  return false;
}

// ---------- data ----------
async function getMeCustomer(session) {
  // IMPORTANTE: ahora traemos is_admin y role
  const { data, error } = await sb
    .from("customers")
    .select("cod_cliente, business_name, is_admin, role")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("getMeCustomer error:", error);
    return { error: "No se pudo cargar el cliente (RLS o datos)." };
  }
  if (!data) {
    return { error: "No se encontró tu cliente asociado (falta vincular auth_user_id)." };
  }
  return { data };
}

async function getClienteByCode(codCliente) {
  const { data, error } = await sb
    .from("customers")
    .select("cod_cliente, business_name")
    .eq("cod_cliente", String(codCliente))
    .maybeSingle();

  if (error) {
    console.error("getClienteByCode error:", error);
    return { error: "No se pudo cargar el cliente por código (RLS o datos)." };
  }
  if (!data) return { error: "No existe ese cod_cliente." };
  return { data };
}

async function getSales(codCliente) {
  const { data, error } = await sb
    .from("sales_lines")
    .select("invoice_date, item_code, boxes")
    .eq("customer_code", String(codCliente))
    .order("invoice_date", { ascending: true });

  if (error) {
    console.error("getSales error:", error);
    return { error: "Error cargando ventas (RLS o datos)." };
  }
  return { data: data || [] };
}

// ---------- tabla (meses robustos) ----------
function ymKey(d) {
  return d.getFullYear() * 12 + d.getMonth(); // entero ordenable
}
function ymLabel(k) {
  const y = Math.floor(k / 12);
  const m = k % 12;
  return new Date(y, m, 1).toLocaleString("es-AR", { month: "short", year: "numeric" });
}

// Cache para que NO se “vacíe” al cambiar de pestaña del navegador
let LAST_RENDER = null; // {theadHTML, tbodyHTML, clienteText, statusHidden, tablaDisplay}
let LAST_CLIENT_CODE = null;
let LAST_IS_ADMIN = false;

function saveRenderCache() {
  LAST_RENDER = {
    theadHTML: thead.innerHTML,
    tbodyHTML: tbody.innerHTML,
    clienteText: $("cliente").innerText,
    statusHidden: statusBox.style.display === "none",
    tablaDisplay: tabla.style.display
  };
}

function restoreRenderCache() {
  if (!LAST_RENDER) return false;
  thead.innerHTML = LAST_RENDER.theadHTML;
  tbody.innerHTML = LAST_RENDER.tbodyHTML;
  $("cliente").innerText = LAST_RENDER.clienteText;

  statusBox.style.display = LAST_RENDER.statusHidden ? "none" : "block";
  tabla.style.display = LAST_RENDER.tablaDisplay || "table";
  return true;
}

function renderTabla(rows) {
  if (!rows.length) {
    setStatus("Sin datos");
    saveRenderCache();
    return;
  }

  const mesesSet = new Set();
  rows.forEach((r) => {
    if (!r.invoice_date) return;
    const d = new Date(r.invoice_date);
    if (Number.isNaN(d.getTime())) return;
    mesesSet.add(ymKey(d));
  });

  const meses = Array.from(mesesSet).sort((a, b) => a - b);

  const map = {};
  rows.forEach((r) => {
    const item = r.item_code || "";
    const boxes = Number(r.boxes) || 0;
    const d = new Date(r.invoice_date);
    if (Number.isNaN(d.getTime())) return;
    const key = ymKey(d);

    if (!map[item]) map[item] = { desc: item, total: 0, meses: {} };
    map[item].total += boxes;
    map[item].meses[key] = (map[item].meses[key] || 0) + boxes;
  });

  const arr = Object.entries(map)
    .map(([cod, v]) => ({ cod, ...v }))
    .sort((a, b) => b.total - a.total);

  thead.innerHTML = "";
  const trh = document.createElement("tr");
  ["Código", "Descripción", "Total"].forEach((t) => {
    const th = document.createElement("th");
    th.innerText = t;
    trh.appendChild(th);
  });

  meses.forEach((k) => {
    const th = document.createElement("th");
    th.innerText = ymLabel(k);
    trh.appendChild(th);
  });

  thead.appendChild(trh);

  tbody.innerHTML = "";
  arr.forEach((p) => {
    const tr = document.createElement("tr");

    const tdCod = document.createElement("td");
    tdCod.innerText = p.cod;
    tr.appendChild(tdCod);

    const tdDesc = document.createElement("td");
    tdDesc.innerText = p.desc;
    tdDesc.className = "desc";
    tr.appendChild(tdDesc);

    const tdTotal = document.createElement("td");
    tdTotal.innerText = p.total;
    tr.appendChild(tdTotal);

    meses.forEach((k) => {
      const td = document.createElement("td");
      td.innerText = p.meses[k] ? String(p.meses[k]) : "";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  hideStatus();
  tabla.style.display = "table";
  saveRenderCache();
}

// ---------- flujo principal ----------
async function loadForSession(session, forcedClientCode /* string | null */) {
  setStatus("Cargando...");

  const meRes = await getMeCustomer(session);
  if (meRes.error) {
    setStatus(meRes.error);
    showLogin(meRes.error);
    return;
  }

  const me = meRes.data;
  const admin = isAdminRow(me);

  LAST_IS_ADMIN = admin;

  // mostrar admin box si corresponde
  adminBox.style.display = admin ? "block" : "none";
  adminMsg.innerText = admin ? "Modo admin: podés cargar cualquier cliente por cod_cliente." : "";

  // qué cliente cargar
  let targetCode = forcedClientCode ? String(forcedClientCode) : String(me.cod_cliente);
  let targetName = me.business_name;

  // si admin pide otro
  if (admin && forcedClientCode && String(forcedClientCode) !== String(me.cod_cliente)) {
    const cliRes = await getClienteByCode(forcedClientCode);
    if (cliRes.error) {
      setStatus(cliRes.error);
      return;
    }
    targetCode = String(cliRes.data.cod_cliente);
    targetName = cliRes.data.business_name;
  }

  LAST_CLIENT_CODE = targetCode;

  $("cliente").innerText = `Cliente: ${targetName} (${targetCode})`;

  const salesRes = await getSales(targetCode);
  if (salesRes.error) {
    setStatus(salesRes.error);
    return;
  }

  renderTabla(salesRes.data);
}

// ---------- eventos ----------
function bindUI() {
  btnLogin?.addEventListener("click", doLogin);
  btnLogout?.addEventListener("click", doLogout);

  passInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });

  // Tabs internas
  tabHist?.addEventListener("click", () => setTab("hist"));
  tabSug?.addEventListener("click", () => setTab("sug"));
  tabNov?.addEventListener("click", () => setTab("nov"));

  // Admin: cargar cliente
  btnLoadClient?.addEventListener("click", async () => {
    const code = (adminClientCode.value || "").trim();
    if (!code) {
      adminMsg.innerText = "Ingresá un cod_cliente.";
      return;
    }
    adminMsg.innerText = "";
    const s = await getSessionSafe();
    if (!s) {
      showLogin("Ingresá para ver tu historial.");
      return;
    }
    hideLogin();
    await loadForSession(s, code);
  });

  // FIX: al volver a la pestaña del navegador, restauramos info sin recargar
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;

    // 1) si la UI quedó “vacía” pero tenemos cache, restauramos rápido
    const hadCache = restoreRenderCache();

    // 2) re-chequeo sesión; si hay sesión, y la tabla quedó oculta, recargamos suave
    const s = await getSessionSafe();
    if (!s) return;

    hideLogin();

    // Si el cache no estaba, o si tabla quedó oculta, o si te interesa refrescar:
    if (!hadCache || tabla.style.display === "none") {
      await loadForSession(s, LAST_IS_ADMIN ? LAST_CLIENT_CODE : null);
    }
  });
}

async function init() {
  bindUI();
  setTab("hist");

  const session = await getSessionSafe();

  if (!session) {
    setStatus("Ingresá para ver tu historial.");
    showLogin("");
    return;
  }

  hideLogin();
  await loadForSession(session, null);

  // cambios de sesión
  sb.auth.onAuthStateChange(async (_event, newSession) => {
    if (!newSession) {
      $("cliente").innerText = "";
      setStatus("Ingresá para ver tu historial.");
      showLogin("");
      return;
    }
    hideLogin();
    await loadForSession(newSession, LAST_IS_ADMIN ? LAST_CLIENT_CODE : null);
  });
}

document.addEventListener("DOMContentLoaded", init);
