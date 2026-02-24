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
function pick(obj, keys, fallback = ""){
  for(const k of keys){
    if(obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "")
      return obj[k];
  }
  return fallback;
}

function fmtMes(yyyy_mm){
  if(!yyyy_mm) return "";
  const [yyyy, mm] = yyyy_mm.split("-");
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${meses[Number(mm)-1]}/${yyyy.slice(-2)}`;
}

function fmtPrecio(n){
  const val = Number(n);
  if(isNaN(val)) return "";
  return val.toLocaleString("es-AR",{minimumFractionDigits:2});
}

// ====================== IMAGEN CORRECTA ======================
function fotoCell(cod){
  if(!cod) return "";

  const { data } = sb.storage
    .from(IMG_BUCKET)
    .getPublicUrl(`${cod}.jpg`);

  const url = data?.publicUrl;

  if(!url) return "";

  return `
    <a href="${url}" target="_blank">
      <img class="thumb" src="${url}" />
    </a>`;
}

// ====================== UI ======================
function mostrar(which){
  vista = which;

  document.getElementById("modHist").classList.toggle("hidden", which !== "hist");
  document.getElementById("modSug").classList.toggle("hidden", which !== "sug");
  document.getElementById("modNov").classList.toggle("hidden", which !== "nov");

  document.getElementById("tabHist").classList.toggle("active", which === "hist");
  document.getElementById("tabSug").classList.toggle("active", which === "sug");
  document.getElementById("tabNov").classList.toggle("active", which === "nov");
}

async function cargar(){
  const cliente = document.getElementById("cliente").value.trim();
  if(!cliente) return;

  if(vista === "hist") return cargarHistorial(cliente);
  if(vista === "sug") return cargarSugerencias(cliente);
  if(vista === "nov") return cargarNovedades(cliente);
}

// ====================== HISTORIAL ======================
async function cargarHistorial(cliente){
  const { data, error } = await sb.rpc("pivot_cliente_mensual", { p_customer: cliente });
  if(error){ alert(error.message); return; }
  if(!data || !data.length){ alert("Sin datos"); return; }

  const months = data[0].months_order || [];
  const thead = document.querySelector("#tablaHist thead");
  const tbody = document.querySelector("#tablaHist tbody");

  thead.innerHTML = `
    <tr>
      <th>Cod</th>
      <th>Descripción</th>
      <th>Foto</th>
      <th>Total</th>
      ${months.map(m=>`<th>${fmtMes(m)}</th>`).join("")}
    </tr>`;

  tbody.innerHTML = "";

  data.forEach(r=>{
    const cod = pick(r,["cod","codigo"]);
    const desc = pick(r,["description","descripcion","articulo"]);

    tbody.innerHTML += `
      <tr>
        <td>${cod}</td>
        <td>${desc}</td>
        <td>${fotoCell(cod)}</td>
        <td>${r.total || ""}</td>
        ${months.map(m=>`<td>${r.by_month?.[m] || ""}</td>`).join("")}
      </tr>`;
  });
}

// ====================== SUGERENCIAS ======================
async function cargarSugerencias(cliente){
  const { data, error } = await sb.rpc("sugerencias_cliente",{p_customer:cliente});

  console.log("SUG DATA COMPLETA:", data);
  console.log("SUG PRIMER REGISTRO:", data?.[0]);

  if(error){ alert(error.message); return; }

  sugerenciasGlobal = data || [];
  sugMostrados = 5;
  renderSug();
}

function renderSug(){
  const thead = document.querySelector("#tablaSug thead");
  const tbody = document.querySelector("#tablaSug tbody");

  thead.innerHTML = `
    <tr>
      <th>Cod</th>
      <th>Descripción</th>
      <th>Foto</th>
      <th>UxB</th>
      <th>Precio</th>
      <th></th>
    </tr>`;

  tbody.innerHTML = "";

  sugerenciasGlobal.slice(0,sugMostrados).forEach(r=>{
    const cod = pick(r,["cod","codigo"]);
    const desc = pick(r,["description","descripcion","articulo"]);
    const uxb = pick(r,["uxb"]);
    const price = pick(r,["price_cash","precio"]);

    tbody.innerHTML += `
      <tr>
        <td>${cod}</td>
        <td>${desc}</td>
        <td>${fotoCell(cod)}</td>
        <td>${uxb}</td>
        <td>${fmtPrecio(price)}</td>
        <td>${r.texto_clientes || ""}</td>
      </tr>`;
  });
}

// ====================== NOVEDADES ======================
async function cargarNovedades(cliente){

  let res = await sb.rpc("novedades_cliente",{
    p_customer: cliente,
    p_limit: 50,
    p_min_clients: 10
  });

  if(res.error){
    res = await sb.rpc("novedades_cliente",{
      p_customer: cliente,
      p_min_clients: 10
    });
  }

  if(res.error){
    alert(res.error.message);
    return;
  }

  novedadesGlobal = res.data || [];
  novMostrados = 5;
  renderNov();
}

function renderNov(){
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

  novedadesGlobal.slice(0,novMostrados).forEach(r=>{
    const cod = pick(r,["cod","codigo"]);
    const desc = pick(r,["description","descripcion","articulo"]);
    const uxb = pick(r,["uxb"]);
    const price = pick(r,["price_cash","precio"]);

    tbody.innerHTML += `
      <tr>
        <td>${cod}</td>
        <td>${desc}</td>
        <td>${fotoCell(cod)}</td>
        <td>${uxb}</td>
        <td>${fmtPrecio(price)}</td>
      </tr>`;
  });
}

// ====================== INIT ======================
mostrar("hist");
