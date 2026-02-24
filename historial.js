// ================= SUPABASE =================
const SUPABASE_URL = "https://kwkclwhmoygunqmlegrg.supabase.co";
const SUPABASE_KEY = "sb_publishable_mVX5MnjwM770cNjgiL6yLw_LDNl9pML";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// helpers
const $ = (id) => document.getElementById(id);
const statusBox = $("status");
const tabla = $("tabla");
const thead = $("thead");
const tbody = $("tbody");

function setStatus(msg) {
  statusBox.style.display = "block";
  statusBox.innerText = msg;
  tabla.style.display = "none";
}

async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    console.error("getSession error:", error);
    setStatus("Error de sesión.");
    return null;
  }
  if (!data?.session) {
    setStatus("No hay sesión iniciada. Volviendo a Mayorista…");
    // ajustá path si corresponde
    setTimeout(() => (location.href = "../mayorista.html"), 800);
    return null;
  }
  return data.session;
}

async function getCliente(session) {
  const { data, error } = await sb
    .from("customers")
    .select("cod_cliente, business_name")
    .eq("auth_user_id", session.user.id)
    .maybeSingle(); // <- evita excepción si no hay fila

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
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    mesesSet.add(key);
  });

  const meses = Array.from(mesesSet).sort((a, b) => new Date(a) - new Date(b));

  const map = {};
  rows.forEach((r) => {
    const item = r.item_code || "";
    const boxes = Number(r.boxes) || 0;
    const d = new Date(r.invoice_date);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;

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

  meses.forEach((m) => {
    const [y, mo] = m.split("-");
    const fecha = new Date(Number(y), Number(mo) - 1);
    const nombre = fecha.toLocaleString("es-AR", { month: "short", year: "numeric" });
    const th = document.createElement("th");
    th.innerText = nombre;
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

    meses.forEach((m) => {
      const td = document.createElement("td");
      td.innerText = p.meses[m] ? String(p.meses[m]) : "";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  statusBox.style.display = "none";
  tabla.style.display = "table";
}

async function init() {
  try {
    setStatus("Cargando...");
    const session = await getSession();
    if (!session) return;

    const cliente = await getCliente(session);
    if (!cliente) return;

    $("cliente").innerText = `Cliente: ${cliente.business_name} (${cliente.cod_cliente})`;

    const ventas = await getSales(cliente.cod_cliente);
    renderTabla(ventas);
  } catch (e) {
    console.error("Init crash:", e);
    setStatus("Error inesperado cargando historial. Ver consola.");
  }
}

document.addEventListener("DOMContentLoaded", init);
