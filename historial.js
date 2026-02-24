// ================= SUPABASE =================
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";

// ⚠️ Usá la MISMA key que usabas en el dominio viejo.
// Si en el dominio viejo funcionaba, esta key es correcta.
const SUPABASE_KEY = "sb_publishable_mVX5MnjwM770cNjgiL6yLw_LDNl9pML";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Si tu login “por CUIT” se hacía transformando CUIT a email,
// definí acá el dominio interno.
// Ej: 307xxxxxxxx@clientes.loekemeyer.local
const CUIT_EMAIL_DOMAIN = "clientes.local"; // <- CAMBIAR si corresponde

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

function setStatus(msg) {
  statusBox.style.display = "block";
  statusBox.innerText = msg;
  tabla.style.display = "none";
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

// ---------- sesión ----------
async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error("getSession error:", error);
    setStatus("Error de sesión.");
    return null;
  }
  return data?.session || null;
}

// ---------- login ----------
function normalizeUserToEmail(user) {
  const u = (user || "").trim();
  if (!u) return "";

  // Si parece email, lo usamos tal cual
  if (u.includes("@")) return u;

  // Si es CUIT (solo números), lo mapeamos a email interno
  const onlyDigits = u.replace(/\D/g, "");
  if (onlyDigits.length >= 10) {
    return `${onlyDigits}@${CUIT_EMAIL_DOMAIN}`;
  }

  // fallback
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

  // éxito
  loginMsg.innerText = "";
  hideLogin();
  await loadForSession(data.session);
}

async function doLogout() {
  await sb.auth.signOut();
  $("cliente").innerText = "";
  setStatus("Sesión cerrada.");
  showLogin("Ingresá para ver tu historial.");
}

// ---------- data ----------
async function getCliente(session) {
  const { data, error } = await sb
    .from("customers")
    .select("cod_cliente, business_name")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("getCliente error:", error);
    setStatus("No se pudo cargar el cliente (RLS o datos).");
    return null;
  }
  if (!data) {
    setStatus("No se encontró tu cliente asociado. (falta vincular auth_user_id)");
    return null;
  }
  return data;
}

async function getSales(codCliente) {
  const { data, error } = await sb
    .from("sales_lines")
    .select("invoice_date, item_code, boxes")
    .eq("customer_code", String(codCliente))
    .order("invoice_date", { ascending: true });

  if (error) {
    console.error("getSales error:", error);
    setStatus("Error cargando ventas (RLS o datos).");
    return [];
  }
  return data || [];
}

// ---------- tabla (fix orden meses robusto) ----------
function ymKey(d) {
  return d.getFullYear() * 12 + d.getMonth(); // entero ordenable
}
function ymLabel(k) {
  const y = Math.floor(k / 12);
  const m = k % 12;
  return new Date(y, m, 1).toLocaleString("es-AR", { month: "short", year: "numeric" });
}

function renderTabla(rows) {
  if (!rows.length) {
    setStatus("Sin datos");
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

  // HEADER
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

  // BODY
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

  statusBox.style.display = "none";
  tabla.style.display = "table";
}

// ---------- flujo principal ----------
async function loadForSession(session) {
  setStatus("Cargando...");
  const cliente = await getCliente(session);
  if (!cliente) return;

  $("cliente").innerText = `Cliente: ${cliente.business_name} (${cliente.cod_cliente})`;

  const ventas = await getSales(cliente.cod_cliente);
  renderTabla(ventas);
}

async function init() {
  try {
    // eventos UI
    btnLogin?.addEventListener("click", doLogin);
    btnLogout?.addEventListener("click", doLogout);
    passInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doLogin();
    });

    const session = await getSession();

    if (!session) {
      // Ya no redirigimos al dominio viejo: pedimos login acá
      setStatus("Ingresá para ver tu historial.");
      showLogin("");
      return;
    }

    hideLogin();
    await loadForSession(session);

    // Si la sesión cambia (login/logout), actualizamos sin recargar
    sb.auth.onAuthStateChange(async (_event, newSession) => {
      if (!newSession) {
        $("cliente").innerText = "";
        setStatus("Ingresá para ver tu historial.");
        showLogin("");
        return;
      }
      hideLogin();
      await loadForSession(newSession);
    });
  } catch (e) {
    console.error("Init crash:", e);
    setStatus("Error inesperado cargando historial. Ver consola.");
  }
}

document.addEventListener("DOMContentLoaded", init);
