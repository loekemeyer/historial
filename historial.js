// ====================== CONFIG ======================
const SUPABASE_URL = "https://flgavcfamdsodrhakqen.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_G9QvEtPwGp80_6NUneseVg_V5mfmLfY";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ⚠️ PONÉ EXACTAMENTE EL NOMBRE REAL DEL BUCKET (copiar y pegar)
const IMG_BUCKET = "products-images"; // REVISAR MAYUSCULAS

// ====================== STATE ======================
let vista = "hist";
let sugerenciasGlobal = [];
let novedadesGlobal = [];
let sugMostrados = 5;
let novMostrados = 5;

// ====================== HELPERS ======================
function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "")
      return obj[k];
  }
  return fallback;
}

function fmtMes(yyyy_mm) {
  if (!yyyy_mm) return "";
  const [yyyy, mm] = yyyy_mm.split("-");
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${meses[Number(mm) - 1]}/${yyyy.slice(-2)}`;
}

function fmtPrecio(n) {
  const val = Number(n);
  if (isNaN(val)) return "";
  return val.toLocaleString("es-AR", { minimumFractionDigits: 2 });
}

// ====================== % CLIENTES (valor) ======================
function pctClientesValue(r) {
  // si viene directo un porcentaje
  const pctDirecto = Number(pick(r, ["pct_clientes","porcentaje_clientes","pct","porcentaje"], ""));
  if (!isNaN(pctDirecto) && pctDirecto > 0) return pctDirecto;

  // si viene buyers/total
  const buyers = Number(pick(r, ["buyers","buyers_count","clientes_compraron","cant_clientes_compraron","n_buyers"], ""));
  const total  = Number(pick(r, ["total_clients","total_clientes","clientes_total","n_total_clients"], ""));
  if (!isNaN(buyers) && !isNaN(total) && total > 0) return (buyers / total) * 100;

  return null;
}

// ====================== IMAGEN CORRECTA ======================
function fotoCell(cod) {
  if (!cod) return "";

  const { data } = sb.storage
    .from(IMG_BUCKET)
    .getPublicUrl(`${cod}.jpg`);

  const url = data?.publicUrl;
  if (!url) return "";

  return `
    <a href="${url}" target="_blank" rel="noopener">
      <img class="thumb" src="${url}" />
    </a>`;
}

// ====================== UI ======================
function mostrar(which) {
  vista = which;

  document.getElementById("modHist").classList.toggle("hidden", which !== "hist");
  document.getElementById("modSug").classList.toggle("hidden", which !== "sug");
  document.getElementById("modNov").classList.toggle("hidden", which !== "nov");

  document.getElementById("tabHist").classList.toggle("active", which === "hist");
  document.getElementById("tabSug").classList.toggle("active", which === "sug");
  document.getElementById("tabNov").classList.toggle("active", which === "nov");
}

async function cargar() {
  const cliente = document.getElementById("cliente").value.trim();
  if (!cliente) return;

  if (vista === "hist") return cargarHistorial(cliente);
  if (vista === "sug")  return cargarSugerencias(cliente);
  if (vista === "nov")  return cargarNovedades(cliente);
}

// ====================== HISTORIAL ======================
async function cargarHistorial(cliente) {
  const { data, error } = await sb.rpc("pivot_cliente_mensual", { p_customer: cliente });
  if (error) { alert(error.message); return; }
  if (!data || !data.length) { alert("Sin datos"); return; }

  const months = data[0].months_order || [];
  const thead = document.querySelector("#tablaHist thead");
  const tbody = document.querySelector("#tablaHist tbody");

  thead.innerHTML = `
    <tr>
      <th>Cod</th>
      <th>Descripción</th>
      <th>Foto</th>
      <th>Total</th>
      ${months.map(m => `<th>${fmtMes(m)}</th>`).join("")}
    </tr>`;

  tbody.innerHTML = "";

  data.forEach(r => {
    const cod = pick(r, ["cod","codigo"]);
    const desc = pick(r, ["description","descripcion","articulo"]);

    tbody.innerHTML += `
      <tr>
        <td>${cod}</td>
        <td>${desc}</td>
        <td>${fotoCell(cod)}</td>
        <td>${r.total || ""}</td>
        ${months.map(m => `<td>${r.by_month?.[m] || ""}</td>`).join("")}
      </tr>`;
  });
}

// ====================== SUGERENCIAS ======================
async function cargarSugerencias(cliente) {
  const { data, error } = await sb.rpc("sugerencias_cliente", { p_customer: cliente });

  console.log("SUG DATA COMPLETA:", data);
  console.log("SUG PRIMER REGISTRO:", data?.[0]);

  if (error) { alert(error.message); return; }

  sugerenciasGlobal = data || [];
  sugMostrados = 5;
  renderSug();
}

function renderSug() {
  const thead = document.querySelector("#tablaSug thead");
  const tbody = document.querySelector("#tablaSug tbody");

  thead.innerHTML = `
    <tr>
      <th class="col-cod">Cod</th>
      <th class="col-desc">Descripción</th>
      <th class="col-img">Foto</th>
      <th class="col-uxb">UxB</th>
      <th class="col-price">Precio</th>
      <th class="col-note"></th>
    </tr>`;

  tbody.innerHTML = "";

  sugerenciasGlobal.slice(0, sugMostrados).forEach(r => {
    const cod = pick(r, ["cod","codigo"]);
    const desc = pick(r, ["description","descripcion","articulo"]);
    const uxb = pick(r, ["uxb"]);
    const price = pick(r, ["price_cash","precio"]);

    const pct = pctClientesValue(r);
    const v = (pct === null) ? null : Math.round(pct);
    const fuego = (v !== null && v >= 70) ? " 🔥" : "";
    const nota = (v === null) ? "" : `${fuego}${v}% de los clientes ya compró este producto`;

    tbody.innerHTML += `
      <tr>
        <td class="col-cod">${cod}</td>
        <td class="col-desc">${desc}</td>
        <td class="col-img">${fotoCell(cod)}</td>
        <td class="col-uxb">${uxb}</td>
        <td class="col-price">${fmtPrecio(price)}</td>
        <td class="col-note">${nota}</td>
      </tr>`;
  });

  syncMoreButtons();
}

// ====================== NOVEDADES ======================
async function cargarNovedades(cliente) {
  let res = await sb.rpc("novedades_cliente", {
    p_customer: cliente,
    p_limit: 50,
    p_min_clients: 10
  });

  if (res.error) {
    res = await sb.rpc("novedades_cliente", {
      p_customer: cliente,
      p_min_clients: 10
    });
  }

  if (res.error) {
    alert(res.error.message);
    return;
  }

  novedadesGlobal = res.data || [];
  novMostrados = 5;
  renderNov();
}

function renderNov() {
  const thead = document.querySelector("#tablaNov thead");
  const tbody = document.querySelector("#tablaNov tbody");

  thead.innerHTML = `
    <tr>
      <th>Cod</th>
      <th>Descripción</th>
      <th>Foto</th>
      <th>UxB</th>
      <th>Precio</th>
    </tr>`;

  tbody.innerHTML = "";

  novedadesGlobal.slice(0, novMostrados).forEach(r => {
    const cod = pick(r, ["cod","codigo"]);
    const desc = pick(r, ["description","descripcion","articulo"]);
    const uxb = pick(r, ["uxb"]);
    const price = pick(r, ["price_cash","precio"]);

    tbody.innerHTML += `
      <tr>
        <td>${cod}</td>
        <td>${desc}</td>
        <td>${fotoCell(cod)}</td>
        <td>${uxb}</td>
        <td>${fmtPrecio(price)}</td>
      </tr>`;
  });

  syncMoreButtons();
}

// ====================== VER MAS / VER MENOS ======================
function syncMoreButtons() {
  // Sugerencias
  const moreSug = document.getElementById("btnMoreSug");
  const lessSug = document.getElementById("btnLessSug");
  if (moreSug && lessSug) {
    moreSug.classList.toggle("hidden", !(sugerenciasGlobal.length > sugMostrados));
    lessSug.classList.toggle("hidden", !(sugMostrados > 5));
  }

  // Novedades
  const moreNov = document.getElementById("btnMoreNov");
  const lessNov = document.getElementById("btnLessNov");
  if (moreNov && lessNov) {
    moreNov.classList.toggle("hidden", !(novedadesGlobal.length > novMostrados));
    lessNov.classList.toggle("hidden", !(novMostrados > 5));
  }
}

function verMasSug() {
  sugMostrados = sugerenciasGlobal.length;
  renderSug();
}
function verMenosSug() {
  sugMostrados = 5;
  renderSug();
}

function verMasNov() {
  novMostrados = novedadesGlobal.length;
  renderNov();
}
function verMenosNov() {
  novMostrados = 5;
  renderNov();
}

// ====================== PDF (pestaña actual) ======================
function generarPdfActual() {
  const cliente = document.getElementById("cliente")?.value?.trim() || "";
  const fecha = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

  const tituloVista =
    vista === "hist" ? "Historial" :
    vista === "sug"  ? "Sugerencias" :
    vista === "nov"  ? "Novedades" : "Reporte";

  const tableId =
    vista === "hist" ? "tablaHist" :
    vista === "sug"  ? "tablaSug"  :
    vista === "nov"  ? "tablaNov"  : "tablaHist";

  const table = document.getElementById(tableId);
  if (!table) { alert("No se encontró la tabla para exportar."); return; }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { alert("No se cargó jsPDF. Revisá los <script> del HTML."); return; }

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Loekemeyer - ${tituloVista}`, 40, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Cliente: ${cliente || "(sin código)"}    Fecha: ${fecha}`, 40, 60);

  const headers = Array.from(table.querySelectorAll("thead th")).map(th => th.innerText.trim());

  const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr => {
    const tds = Array.from(tr.querySelectorAll("td"));
    return tds.map(td => {
      const img = td.querySelector("img");
      if (img) return ""; // no incrusto imagen
      return (td.innerText || "").trim();
    });
  });

  doc.autoTable({
    head: [headers],
    body: rows,
    startY: 80,
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [17, 17, 17] },
    margin: { left: 40, right: 40 }
  });

  const safeCliente = (cliente || "cliente").replace(/[^\w\-]+/g, "_");
  doc.save(`${tituloVista}_${safeCliente}.pdf`);
}

// ====================== INIT ======================
mostrar("hist");

