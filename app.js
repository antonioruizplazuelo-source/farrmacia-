// =============================================
// FaR-Rmacia - App Logic v2.0
// Mejoras: Firebase sync, lazo morado, fotos,
// notificaciones citas, gestos swipe,
// compartir pedidos, informes mejorados,
// subir archivos en historial
// =============================================

// ===== FIREBASE CONFIG =====
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDoGBiEghMRHxYSL7l_gSXF-qBp0Lb_WTU",
  authDomain: "far-rmacia.firebaseapp.com",
  projectId: "far-rmacia",
  storageBucket: "far-rmacia.firebasestorage.app",
  messagingSenderId: "462585209909",
  appId: "1:462585209909:web:e093a33ebae8c9fe6fbd7c"
};

const FIREBASE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
const USER_ID = 'antonio'; // identificador de usuario

// ===== BASE DE DATOS (localStorage) =====
const DB = {
  get(key, def = []) {
    try { return JSON.parse(localStorage.getItem('farrmacia_' + key)) ?? def; }
    catch { return def; }
  },
  set(key, val) {
    localStorage.setItem('farrmacia_' + key, JSON.stringify(val));
    // Marcar que hay cambios pendientes de sincronizar
    localStorage.setItem('farrmacia_pendingSync', 'true');
  }
};

// ===== SINCRONIZACIÓN FIREBASE =====
let syncInProgress = false;

function firestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return { doubleValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(firestoreValue) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const k in val) fields[k] = firestoreValue(val[k]);
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function parseFirestoreValue(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('integerValue' in v) return parseInt(v.integerValue);
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseFirestoreValue);
  if ('mapValue' in v) {
    const obj = {};
    for (const k in v.mapValue.fields) obj[k] = parseFirestoreValue(v.mapValue.fields[k]);
    return obj;
  }
  return null;
}

async function syncToFirebase() {
  if (syncInProgress) return;
  syncInProgress = true;
  const btn = document.getElementById('btn-sync');
  btn?.classList.add('syncing');

  try {
    const data = {
      meds: DB.get('meds', []),
      citas: DB.get('citas', []),
      historial_pedidos: DB.get('historial_pedidos', []),
      notas: DB.get('notas', ''),
      nextId: DB.get('nextId', 100),
      nextPedidoId: DB.get('nextPedidoId', 1),
      docs: DB.get('docs', []).map(d => ({ ...d, contenido: d.contenido || '', base64: undefined })), // sin base64 en cloud
      ultimaSincro: new Date().toISOString()
    };

    const fields = {};
    for (const k in data) fields[k] = firestoreValue(data[k]);

    const url = `${FIREBASE_BASE}/usuarios/${USER_ID}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    localStorage.removeItem('farrmacia_pendingSync');
    showToast('☁️ Sincronizado con Firebase', 'success');
    actualizarEstadoSync(true);
  } catch (err) {
    console.error('Sync error:', err);
    showToast('⚠️ Error al sincronizar: ' + err.message, 'error');
    actualizarEstadoSync(false, err.message);
  } finally {
    syncInProgress = false;
    btn?.classList.remove('syncing');
  }
}

async function syncFromFirebase() {
  const btn = document.getElementById('btn-sync');
  btn?.classList.add('syncing');
  try {
    const url = `${FIREBASE_BASE}/usuarios/${USER_ID}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();
    if (!json.fields) throw new Error('Sin datos en Firebase');

    const data = {};
    for (const k in json.fields) data[k] = parseFirestoreValue(json.fields[k]);

    // Restaurar en localStorage
    if (data.meds) localStorage.setItem('farrmacia_meds', JSON.stringify(data.meds));
    if (data.citas) localStorage.setItem('farrmacia_citas', JSON.stringify(data.citas));
    if (data.historial_pedidos) localStorage.setItem('farrmacia_historial_pedidos', JSON.stringify(data.historial_pedidos));
    if (data.notas !== undefined) localStorage.setItem('farrmacia_notas', JSON.stringify(data.notas));
    if (data.nextId) localStorage.setItem('farrmacia_nextId', JSON.stringify(data.nextId));
    if (data.nextPedidoId) localStorage.setItem('farrmacia_nextPedidoId', JSON.stringify(data.nextPedidoId));
    if (data.docs) localStorage.setItem('farrmacia_docs', JSON.stringify(data.docs));
    localStorage.removeItem('farrmacia_pendingSync');

    showToast('✅ Datos restaurados de Firebase', 'success');
    // Recargar pantalla actual
    navigate(currentScreen);
    cargarCitasMini();
  } catch (err) {
    showToast('⚠️ Error al cargar: ' + err.message, 'error');
  } finally {
    btn?.classList.remove('syncing');
  }
}

function actualizarEstadoSync(ok, msg) {
  const bar = document.getElementById('sync-status-bar');
  if (!bar) return;
  if (ok) {
    bar.style.display = 'flex';
    bar.className = 'sync-bar';
    bar.innerHTML = `☁️ <span>Sincronizado – ${new Date().toLocaleTimeString('es-ES')}</span>`;
    setTimeout(() => bar.style.display = 'none', 4000);
  } else {
    bar.style.display = 'flex';
    bar.className = 'sync-bar error';
    bar.innerHTML = `❌ <span>Sin sincronizar${msg ? ': ' + msg : ''}</span>`;
  }
}

function abrirSyncPanel() {
  const hasPending = localStorage.getItem('farrmacia_pendingSync') === 'true';
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">☁️ Firebase & Backup</div>
      <div style="background:#f0f8ff;border-radius:12px;padding:12px;margin-bottom:16px;font-size:13px;color:#555">
        <strong>Estado:</strong> ${hasPending ? '⚠️ Hay cambios pendientes de subir' : '✅ Todo sincronizado'}<br>
        <strong>Usuario:</strong> ${USER_ID}
      </div>
      <button class="btn-primary" onclick="syncToFirebase();this.closest('.modal-overlay').remove()">
        ☁️ Subir datos a Firebase
      </button>
      <button class="btn-primary" style="background:var(--azul);margin-top:8px" onclick="syncFromFirebase();this.closest('.modal-overlay').remove()">
        📥 Descargar desde Firebase
      </button>
      <hr style="margin:14px 0;border:none;border-top:1px solid #eee"/>
      <div class="card-header" style="margin-bottom:10px">💾 Backup Local</div>
      <button class="btn-secondary" style="margin-top:0" onclick="exportarBackup();this.closest('.modal-overlay').remove()">
        📤 Exportar Backup (JSON)
      </button>
      <button class="btn-secondary" style="margin-top:8px" onclick="importarBackup()">
        📥 Importar Backup (JSON)
      </button>
      <input type="file" id="import-backup-input" accept=".json" style="display:none" onchange="procesarImportBackup(event)"/>
      <button class="btn-secondary" style="margin-top:8px" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function exportarBackup() {
  const backup = {
    version: 2,
    fecha: new Date().toISOString(),
    meds: DB.get('meds', []),
    citas: DB.get('citas', []),
    historial_pedidos: DB.get('historial_pedidos', []),
    notas: DB.get('notas', ''),
    docs: DB.get('docs', []),
    nextId: DB.get('nextId', 100),
    nextPedidoId: DB.get('nextPedidoId', 1)
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `farrmacia_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Backup exportado');
}

function importarBackup() {
  document.getElementById('import-backup-input')?.click();
}

function procesarImportBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      showConfirm('📥 Importar Backup', '¿Sobrescribir todos los datos actuales con el backup?', () => {
        if (data.meds) DB.set('meds', data.meds);
        if (data.citas) DB.set('citas', data.citas);
        if (data.historial_pedidos) DB.set('historial_pedidos', data.historial_pedidos);
        if (data.notas !== undefined) DB.set('notas', data.notas);
        if (data.docs) DB.set('docs', data.docs);
        if (data.nextId) DB.set('nextId', data.nextId);
        if (data.nextPedidoId) DB.set('nextPedidoId', data.nextPedidoId);
        showToast('✅ Backup importado correctamente', 'success');
        navigate(currentScreen);
        cargarCitasMini();
      });
    } catch(err) {
      showToast('❌ Error al leer el backup', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ===== INICIALIZAR DATOS =====
function initDB() {
  if (DB.get('meds').length === 0) {
    DB.set('meds', [
      { id: 1, nombre: 'Ejemplo - Omeprazol 20mg', cantidad_bote: 28, dosis_dia: 1, stock_real: 2, observaciones: 'En ayunas', foto: '', fecha_inicio: '', incluir_pedido: 1 }
    ]);
  }
  if (!DB.get('notas', null)) DB.set('notas', '');
  if (!DB.get('nextId', null)) DB.set('nextId', 100);
  if (!DB.get('nextPedidoId', null)) DB.set('nextPedidoId', 1);
}

function nextId() {
  const n = DB.get('nextId', 100) + 1;
  DB.set('nextId', n);
  return n;
}

// ===== GESTOS SWIPE =====
const NAV_ORDER = ['menu', 'inventario', 'pedidos', 'citas', 'historial'];
let swipeStartX = 0, swipeStartY = 0;

function initSwipeGestures() {
  const content = document.getElementById('content');
  content.addEventListener('touchstart', e => {
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }, { passive: true });

  content.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = e.changedTouches[0].clientY - swipeStartY;
    // Solo swipe horizontal (más horizontal que vertical)
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const idx = NAV_ORDER.indexOf(currentScreen);
    if (idx < 0) return; // pantallas secundarias no navegan por swipe

    if (dx < 0 && idx < NAV_ORDER.length - 1) {
      // Swipe izquierda → siguiente
      navigate(NAV_ORDER[idx + 1]);
    } else if (dx > 0 && idx > 0) {
      // Swipe derecha → anterior
      navigate(NAV_ORDER[idx - 1]);
    }
  }, { passive: true });
}

// ===== FOTO MEDICAMENTO =====
let fotoTemporal = { f: null, m: null }; // prefijo 'f' = nuevo, 'm' = modificar

function seleccionarFoto(prefix) {
  document.getElementById(prefix + '-foto-input')?.click();
}

function procesarFoto(event, prefix) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const base64 = e.target.result;
    fotoTemporal[prefix] = base64;
    const prev = document.getElementById(prefix + '-foto-prev');
    if (prev) {
      prev.className = 'foto-preview';
      prev.innerHTML = '';
      const img = document.createElement('img');
      img.src = base64;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:12px';
      prev.appendChild(img);
    }
    const delBtn = document.getElementById(prefix + '-foto-del-btn');
    if (delBtn) delBtn.style.display = 'block';
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function borrarFoto(prefix) {
  fotoTemporal[prefix] = '';
  const prev = document.getElementById(prefix + '-foto-prev');
  if (prev) {
    prev.className = 'foto-preview empty';
    prev.innerHTML = '📷';
  }
  const delBtn = document.getElementById(prefix + '-foto-del-btn');
  if (delBtn) delBtn.style.display = 'none';
}

function mostrarFotoPrev(prefix, fotoBase64) {
  const prev = document.getElementById(prefix + '-foto-prev');
  const delBtn = document.getElementById(prefix + '-foto-del-btn');
  if (!prev) return;
  if (fotoBase64) {
    prev.className = 'foto-preview';
    prev.innerHTML = '';
    const img = document.createElement('img');
    img.src = fotoBase64;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:12px';
    prev.appendChild(img);
    if (delBtn) delBtn.style.display = 'block';
  } else {
    prev.className = 'foto-preview empty';
    prev.innerHTML = '📷';
    if (delBtn) delBtn.style.display = 'none';
  }
}

// ===== NAVEGACIÓN =====
let currentScreen = 'menu';
let navHistory = [];
let editingCitaId = null;
let editingMedId = null;
let pedidoItems = [];

function navigate(screen) {
  if (currentScreen !== screen) navHistory.push(currentScreen);
  currentScreen = screen;

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + screen)?.classList.add('active');

  const titles = {
    'menu': { title: '💊 FaR-Rmacia', sub: 'Tu farmacia personal', back: false },
    'inventario': { title: '📦 Stock e Inventario', sub: '', back: true },
    'medicamentos': { title: '💊 Nuevo Medicamento', sub: '', back: true },
    'pedidos': { title: '🛒 Pedido Farmacia', sub: '', back: true },
    'citas': { title: '📅 Citas Médicas', sub: '', back: true },
    'historial': { title: '📁 Historial Médico', sub: '', back: true },
    'modificar': { title: '✏️ Modificar', sub: '', back: true },
    'historial-pedidos': { title: '📜 Historial Pedidos', sub: '', back: true },
  };
  const t = titles[screen] || { title: 'FaR-Rmacia', sub: '', back: true };
  document.getElementById('header-title').textContent = t.title;
  document.getElementById('header-sub').textContent = t.sub;
  document.getElementById('btn-back').classList.toggle('visible', t.back);

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === screen);
  });

  const fab = document.getElementById('fab');
  if (screen === 'inventario' || screen === 'medicamentos') {
    fab.textContent = '+'; fab.classList.add('visible');
  } else if (screen === 'citas') {
    fab.textContent = '+'; fab.classList.add('visible');
  } else {
    fab.classList.remove('visible');
  }

  switch(screen) {
    case 'menu': cargarCitasMini(); break;
    case 'inventario': renderInventario(); break;
    case 'pedidos': renderPedidos(); break;
    case 'citas': renderCitas(); break;
    case 'historial': cargarHistorial(); break;
    case 'historial-pedidos': renderHistorialPedidos(); break;
    case 'medicamentos':
      fotoTemporal['f'] = null;
      mostrarFotoPrev('f', null);
      break;
  }

  document.getElementById('content').scrollTop = 0;
}

function goBack() {
  if (navHistory.length > 0) {
    navigate(navHistory.pop());
    navHistory.pop();
  } else {
    navigate('menu');
  }
}

function fabAction() {
  if (currentScreen === 'inventario' || currentScreen === 'medicamentos') {
    navigate('medicamentos');
    limpiarFormulario();
  } else if (currentScreen === 'citas') {
    document.getElementById('c-prof').focus();
  }
}

// ===== RELOJ =====
function actualizarReloj() {
  const ahora = new Date();
  const dia = String(ahora.getDate()).padStart(2,'0');
  const mes = ahora.toLocaleString('es-ES', {month:'short'});
  const anio = ahora.getFullYear();
  const hora = String(ahora.getHours()).padStart(2,'0');
  const min = String(ahora.getMinutes()).padStart(2,'0');
  document.getElementById('header-clock').innerHTML = `${dia} ${mes} ${anio}<br>${hora}:${min}`;
}

// ===== TOAST =====
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  setTimeout(() => t.className = '', 2800);
}

// ===== CONFIRM =====
function showConfirm(title, text, onOk) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-title">${title}</div>
      <div class="confirm-text">${text}</div>
      <div class="confirm-btns">
        <button class="confirm-cancel" onclick="this.closest('.confirm-overlay').remove()">Cancelar</button>
        <button class="confirm-ok" id="confirm-ok-btn">Sí, confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('confirm-ok-btn').onclick = () => { overlay.remove(); onOk(); };
}

// ===== CALCULAR STOCK =====
function calcularStock(med) {
  const unidBote = parseFloat(med.cantidad_bote || 0);
  const tomaDia = parseFloat(med.dosis_dia || 0);
  const botesIni = parseFloat(med.stock_real || 0);
  const fechaIni = med.fecha_inicio;
  const dosisTotal = botesIni * unidBote;

  if (fechaIni && tomaDia > 0) {
    const fInicio = new Date(fechaIni);
    const hoy = new Date();
    const diasPasados = Math.max(0, Math.floor((hoy - fInicio) / 86400000));
    const dosisActuales = Math.max(0, dosisTotal - (diasPasados * tomaDia));
    const botesCalc = unidBote > 0 ? Math.round(dosisActuales / unidBote * 100) / 100 : 0;
    const diasRestantes = tomaDia > 0 ? Math.floor(dosisActuales / tomaDia) : 0;
    return { dosisActuales, botesCalc, diasRestantes, unidBote, tomaDia, iniciado: true };
  } else {
    const diasRestantes = tomaDia > 0 ? Math.floor(dosisTotal / tomaDia) : 0;
    return { dosisActuales: dosisTotal, botesCalc: botesIni, diasRestantes, unidBote, tomaDia, iniciado: false };
  }
}

function formatTiempo(dias) {
  if (dias <= 0) return '⚠️ Sin stock';
  const sem = (dias / 7).toFixed(1);
  const mes = (dias / 30).toFixed(1);
  return `${dias} días | ${sem} sem. | ${mes} mes.`;
}

function colorDias(dias) {
  if (dias <= 7) return 'danger';
  if (dias <= 30) return 'warn';
  return '';
}

// ===== INVENTARIO =====
function renderInventario() {
  const meds = DB.get('meds');
  const container = document.getElementById('inventario-list');
  if (meds.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">No hay medicamentos.<br>Pulsa + para añadir uno.</div></div>`;
    return;
  }

  container.innerHTML = meds.map(med => {
    const s = calcularStock(med);
    const pct = s.iniciado ? Math.min(100, Math.round((s.diasRestantes / 90) * 100)) : 100;
    const colorBar = colorDias(s.diasRestantes);
    const tiempoTxt = s.iniciado ? formatTiempo(s.diasRestantes) : "▶️ Pulsa 'Iniciar'";
    const pedidoTxt = med.incluir_pedido ? '✅ Incluido en pedidos' : '❌ Excluido de pedidos';
    const pedidoCls = med.incluir_pedido ? 'incluido' : 'excluido';
    const fotoHtml = med.foto
      ? `<img src="${med.foto}" class="med-thumb" onclick="event.stopPropagation();verFotoMed('${med.id}')" alt="foto"/>`
      : '';

    return `
    <div class="med-card" onclick="abrirModificar(${med.id})">
      ${fotoHtml}
      <div class="med-card-name">💊 ${med.nombre.toUpperCase()}</div>
      <div style="display:flex;gap:8px;margin:4px 0;flex-wrap:wrap">
        <span class="badge badge-azul">${s.botesCalc} botes</span>
        <span class="badge badge-naranja">${s.unidBote} uds/bote</span>
        <span class="badge badge-verde">${s.tomaDia}/día</span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar ${colorBar}" style="width:${pct}%"></div></div>
      <div class="med-card-info">⏳ ${tiempoTxt}</div>
      <div class="med-card-pedido ${pedidoCls}">${pedidoTxt}</div>
      ${med.observaciones ? `<div class="med-card-obs">📝 ${med.observaciones}</div>` : ''}
      <div class="med-card-actions">
        <button class="btn-icon btn-verde" onclick="event.stopPropagation();iniciarTratamiento(${med.id})">▶️ Iniciar</button>
        <button class="btn-icon btn-azul" onclick="event.stopPropagation();abrirModificar(${med.id})">✏️ Editar</button>
        <button class="btn-icon btn-rojo" onclick="event.stopPropagation();borrarMed(${med.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function verFotoMed(id) {
  const med = DB.get('meds').find(m => m.id == id);
  if (!med || !med.foto) return;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet" style="text-align:center">
      <div class="modal-handle"></div>
      <div class="modal-title">📷 ${med.nombre}</div>
      <img src="${med.foto}" style="max-width:100%;border-radius:14px;margin-bottom:16px"/>
      <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ===== AÑADIR MEDICAMENTO =====
function limpiarFormulario() {
  ['f-nombre','f-bote','f-dosis','f-stock','f-obs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-incluir').checked = true;
  fotoTemporal['f'] = null;
  mostrarFotoPrev('f', null);
}

function guardarMedicamento() {
  const nombre = document.getElementById('f-nombre').value.trim();
  if (!nombre) { showToast('⚠️ Escribe el nombre del medicamento', 'error'); return; }

  const med = {
    id: nextId(),
    nombre,
    cantidad_bote: parseFloat(document.getElementById('f-bote').value) || 0,
    dosis_dia: parseFloat(document.getElementById('f-dosis').value) || 0,
    stock_real: parseFloat(document.getElementById('f-stock').value) || 0,
    observaciones: document.getElementById('f-obs').value.trim(),
    foto: fotoTemporal['f'] || '',
    fecha_inicio: '',
    incluir_pedido: document.getElementById('f-incluir').checked ? 1 : 0
  };

  const meds = DB.get('meds');
  meds.push(med);
  DB.set('meds', meds);
  limpiarFormulario();
  showToast('✅ Medicamento guardado');
  navigate('inventario');
}

// ===== INICIAR TRATAMIENTO =====
function iniciarTratamiento(id) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  const hoy = new Date().toISOString().split('T')[0];
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">📅 Fecha de inicio del tratamiento</div>
      <div class="form-group">
        <label class="form-label">Selecciona la fecha</label>
        <input type="date" class="form-input" id="modal-fecha" value="${hoy}" style="padding:12px"/>
      </div>
      <button class="btn-primary" onclick="guardarFechaInicio(${id})">💾 Guardar Fecha</button>
      <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function guardarFechaInicio(id) {
  const fecha = document.getElementById('modal-fecha').value;
  const meds = DB.get('meds');
  const idx = meds.findIndex(m => m.id === id);
  if (idx >= 0) {
    meds[idx].fecha_inicio = fecha;
    DB.set('meds', meds);
    showToast('✅ Tratamiento iniciado');
    document.querySelector('.modal-overlay')?.remove();
    renderInventario();
  }
}

// ===== MODIFICAR MEDICAMENTO =====
function abrirModificar(id) {
  const meds = DB.get('meds');
  const med = meds.find(m => m.id === id);
  if (!med) return;
  editingMedId = id;

  const s = calcularStock(med);
  document.getElementById('m-nombre').value = med.nombre;
  document.getElementById('m-bote').value = med.cantidad_bote;
  document.getElementById('m-dosis').value = med.dosis_dia;
  document.getElementById('m-stock').value = s.botesCalc;
  document.getElementById('m-obs').value = med.observaciones || '';
  document.getElementById('m-fecha').value = med.fecha_inicio || '';
  document.getElementById('m-incluir').checked = med.incluir_pedido === 1;

  // Cargar foto actual
  fotoTemporal['m'] = med.foto || null;
  mostrarFotoPrev('m', med.foto || null);

  document.getElementById('m-guardar').onclick = () => actualizarMed(id);
  document.getElementById('m-borrar').onclick = () => borrarMed(id);

  navigate('modificar');
}

function actualizarMed(id) {
  const meds = DB.get('meds');
  const idx = meds.findIndex(m => m.id === id);
  if (idx < 0) return;

  const nuevoStock = parseFloat(document.getElementById('m-stock').value) || 0;
  const unidBote = parseFloat(document.getElementById('m-bote').value) || 1;
  // Si fotoTemporal['m'] es null conservamos la existente, si es '' borramos, si tiene valor actualizamos
  const fotoFinal = fotoTemporal['m'] === null ? meds[idx].foto : (fotoTemporal['m'] || '');

  meds[idx] = {
    ...meds[idx],
    nombre: document.getElementById('m-nombre').value.trim(),
    cantidad_bote: unidBote,
    dosis_dia: parseFloat(document.getElementById('m-dosis').value) || 0,
    stock_real: nuevoStock,
    observaciones: document.getElementById('m-obs').value.trim(),
    fecha_inicio: document.getElementById('m-fecha').value || '',
    incluir_pedido: document.getElementById('m-incluir').checked ? 1 : 0,
    foto: fotoFinal
  };

  DB.set('meds', meds);
  showToast('✅ Registro actualizado');
  navigate('inventario');
}

function borrarMed(id) {
  showConfirm('🗑️ Eliminar medicamento', '¿Eliminar este registro permanentemente?', () => {
    const meds = DB.get('meds').filter(m => m.id !== id);
    DB.set('meds', meds);
    showToast('Medicamento eliminado', 'error');
    navigate('inventario');
  });
}

// ===== PEDIDOS =====
function renderPedidos() {
  const meds = DB.get('meds').sort((a,b) => {
    if (b.incluir_pedido !== a.incluir_pedido) return b.incluir_pedido - a.incluir_pedido;
    return a.nombre.localeCompare(b.nombre);
  });

  pedidoItems = meds.map(med => {
    const s = calcularStock(med);
    return { ...med, ...s, qty: 0 };
  });

  const container = document.getElementById('pedidos-list');
  if (meds.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🛒</div><div class="empty-text">No hay medicamentos registrados.</div></div>`;
    return;
  }

  container.innerHTML = `<div class="card">` + pedidoItems.map((item, i) => `
    <div class="pedido-row" id="pedido-row-${i}" style="${item.incluir_pedido === 0 ? 'opacity:0.5;background:#fff5f5' : ''}">
      <div>
        <input type="checkbox" style="width:20px;height:20px;accent-color:var(--verde)" ${item.incluir_pedido ? 'checked' : ''}
          onchange="togglePedidoIncluir(${i}, this.checked)"/>
      </div>
      <input type="number" class="pedido-qty" id="qty-${i}" value="0" min="0" 
        onchange="actualizarFuturo(${i})" oninput="actualizarFuturo(${i})"/>
      <div class="pedido-info">
        <div class="pedido-nombre">${item.nombre}</div>
        <div class="pedido-stock">📦 ${item.botesCalc} botes | ${formatTiempo(item.diasRestantes)}</div>
        <div class="pedido-futuro" id="futuro-${i}">--</div>
      </div>
    </div>
  `).join('') + `</div>`;
}

function togglePedidoIncluir(i, checked) {
  pedidoItems[i].incluir_pedido = checked ? 1 : 0;
  const row = document.getElementById('pedido-row-' + i);
  row.style.opacity = checked ? '1' : '0.5';
  row.style.background = checked ? '' : '#fff5f5';
}

function actualizarFuturo(i) {
  const qty = parseFloat(document.getElementById('qty-' + i).value) || 0;
  pedidoItems[i].qty = qty;
  const item = pedidoItems[i];
  if (qty > 0 && item.tomaDia > 0 && item.unidBote > 0) {
    const dosisExtra = qty * item.unidBote;
    const diasFuturo = Math.floor((item.dosisActuales + dosisExtra) / item.tomaDia);
    document.getElementById('futuro-' + i).textContent = '✅ Tras pedir: ' + formatTiempo(diasFuturo);
  } else {
    document.getElementById('futuro-' + i).textContent = '--';
  }
}

function calcularPedidoDias() {
  const dias = parseFloat(document.getElementById('p-dias').value);
  if (!dias || dias <= 0) { showToast('Introduce los días necesarios', 'error'); return; }
  _ejecutarCalculo(dias);
}

function calcularPedidoMeses() {
  const meses = parseFloat(document.getElementById('p-meses').value);
  if (!meses || meses <= 0) { showToast('Introduce los meses necesarios', 'error'); return; }
  _ejecutarCalculo(Math.round(meses * 30));
}

function _ejecutarCalculo(dias) {
  pedidoItems.forEach((item, i) => {
    if (item.incluir_pedido === 0) {
      document.getElementById('qty-' + i).value = 0;
      document.getElementById('futuro-' + i).textContent = 'EXCLUIDO';
      return;
    }
    const necesito = item.tomaDia * dias;
    const tengo = item.botesCalc * item.unidBote;
    const falta = Math.max(0, necesito - tengo);
    const botes = item.unidBote > 0 ? Math.ceil(falta / item.unidBote) : 0;
    document.getElementById('qty-' + i).value = botes;
    pedidoItems[i].qty = botes;
    actualizarFuturo(i);
  });
  showToast(`✅ Calculado para ${dias} días`);
}

function confirmarPedido() {
  const conCantidad = pedidoItems.filter(it => it.qty > 0 && it.incluir_pedido);
  if (conCantidad.length === 0) { showToast('No hay cantidades a pedir', 'error'); return; }

  showConfirm('✅ Confirmar Pedido', `¿Actualizar el stock con ${conCantidad.length} medicamento(s)?`, () => {
    const meds = DB.get('meds');
    const historial = DB.get('historial_pedidos', []);
    const numPedido = 'PED-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + String(DB.get('nextPedidoId', 1)).padStart(3, '0');
    DB.set('nextPedidoId', (DB.get('nextPedidoId', 1) + 1));
    const fecha = new Date().toLocaleString('es-ES');

    pedidoItems.forEach(item => {
      if (item.qty <= 0 || !item.incluir_pedido) return;
      const idx = meds.findIndex(m => m.id === item.id);
      if (idx >= 0) {
        const nuevoStock = item.botesCalc + item.qty;
        meds[idx].stock_real = nuevoStock;
        historial.push({
          id: nextId(),
          fecha,
          num_pedido: numPedido,
          medicamento: item.nombre,
          botes_pedidos: item.qty,
          botes_total: nuevoStock,
          dias_restantes_tras_pedido: item.tomaDia > 0 && item.unidBote > 0
            ? Math.floor((item.dosisActuales + item.qty * item.unidBote) / item.tomaDia)
            : 0
        });
      }
    });

    DB.set('meds', meds);
    DB.set('historial_pedidos', historial);
    showToast(`✅ Pedido ${numPedido} confirmado`);
    mostrarResumenPedidoMejorado(numPedido, fecha, conCantidad);
    navigate('inventario');
  });
}

// ===== RESUMEN PEDIDO MEJORADO (estilo informe) =====
function mostrarResumenPedidoMejorado(numPedido, fecha, items) {
  // Calcular días/meses tras pedido para cada item
  const filas = items.map(it => {
    const diasTras = it.tomaDia > 0 && it.unidBote > 0
      ? Math.floor((it.dosisActuales + it.qty * it.unidBote) / it.tomaDia)
      : 0;
    const mesesTras = (diasTras / 30).toFixed(1);
    return { nombre: it.nombre, qty: it.qty, stockTras: Math.round((it.botesCalc + it.qty) * 10) / 10, diasTras, mesesTras };
  });

  const tablaHtml = `
    <table class="resumen-table">
      <thead>
        <tr>
          <th>Medicamento</th>
          <th style="text-align:center">Pedir</th>
          <th style="text-align:center">Stock</th>
          <th style="text-align:center">Total</th>
          <th>Meses/Días</th>
        </tr>
      </thead>
      <tbody>
        ${filas.map(f => `
          <tr>
            <td>${f.nombre}</td>
            <td class="qty-cell">${f.qty}</td>
            <td style="text-align:center">${f.stockTras - f.qty}</td>
            <td style="text-align:center;font-weight:900">${f.stockTras}</td>
            <td class="dias-cell">${f.diasTras} días | ${f.mesesTras} mes.</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Texto plano para compartir
  const textoCompartir = `PEDIDO ${numPedido}\n${fecha}\n\n` +
    `Medicamento          Pedir  Stock  Total  Meses/Días\n` +
    `${'─'.repeat(60)}\n` +
    filas.map(f => `${f.nombre.padEnd(20)} ${String(f.qty).padStart(5)}  ${String(f.stockTras - f.qty).padStart(5)}  ${String(f.stockTras).padStart(5)}  ${f.diasTras} días | ${f.mesesTras} mes.`).join('\n');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div class="modal-title" style="margin-bottom:0">📋 ${numPedido}</div>
        <span style="font-size:11px;color:#999">${fecha}</span>
      </div>
      <p style="font-size:12px;color:#999;margin-bottom:10px">Resumen de Pedido (tipo Excel)</p>
      ${tablaHtml}
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn-primary" style="flex:1;margin-top:0;font-size:14px" onclick="compartirResumenPedido(${JSON.stringify(textoCompartir).replace(/"/g,'&quot;')}, '${numPedido}')">
          📤 Compartir
        </button>
        <button class="btn-secondary" style="flex:1;margin-top:0;font-size:14px" onclick="copiarResumenPedido(this)">
          📋 Copiar
        </button>
      </div>
      <button class="btn-secondary" style="margin-top:8px" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
    </div>
  `;
  // Guardar texto para copiar/compartir
  modal._textoCompartir = textoCompartir;
  modal._numPedido = numPedido;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function compartirResumenPedido(texto, numPedido) {
  // Usar el texto del modal más cercano si está disponible
  const modal = document.querySelector('.modal-overlay');
  const txt = (modal && modal._textoCompartir) ? modal._textoCompartir : texto;
  if (navigator.share) {
    navigator.share({ title: 'Pedido Farmacia ' + numPedido, text: txt });
  } else {
    const url = 'https://wa.me/?text=' + encodeURIComponent(txt);
    window.open(url, '_blank');
  }
}

function copiarResumenPedido(btn) {
  const modal = btn.closest('.modal-overlay');
  const txt = modal?._textoCompartir || '';
  navigator.clipboard.writeText(txt).then(() => showToast('📋 Copiado')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); showToast('📋 Copiado');
  });
}

// ===== HISTORIAL PEDIDOS CON COMPARTIR =====
function renderHistorialPedidos() {
  const historial = DB.get('historial_pedidos', []).reverse();
  const container = document.getElementById('historial-pedidos-list');

  if (historial.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📜</div><div class="empty-text">No hay pedidos registrados.</div></div>`;
    return;
  }

  const grupos = {};
  historial.forEach(h => {
    if (!grupos[h.num_pedido]) grupos[h.num_pedido] = { fecha: h.fecha, items: [] };
    grupos[h.num_pedido].items.push(h);
  });

  container.innerHTML = Object.entries(grupos).map(([numP, g]) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:16px;font-weight:900;color:var(--azul-oscuro)">📋 ${numP}</div>
        <div style="display:flex;gap:6px;align-items:center">
          <div style="font-size:11px;color:#999">${g.fecha}</div>
          <button class="btn-sm btn-sm-verde" onclick="compartirPedidoHistorial('${numP}')">📤</button>
        </div>
      </div>
      ${g.items.map(it => `
        <div class="historial-item">
          <div class="historial-item-med">💊 ${it.medicamento}</div>
          <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
            <span class="badge badge-amarillo">Pedido: ${it.botes_pedidos} botes</span>
            <span class="badge badge-verde">Total: ${Math.round(it.botes_total * 100)/100} botes</span>
            ${it.dias_restantes_tras_pedido ? `<span class="badge badge-azul">${it.dias_restantes_tras_pedido} días</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function compartirPedidoHistorial(numPedido) {
  const historial = DB.get('historial_pedidos', []);
  const items = historial.filter(h => h.num_pedido === numPedido);
  if (items.length === 0) return;
  const fecha = items[0].fecha;

  const texto = `PEDIDO ${numPedido}\n${fecha}\n\n` +
    `Medicamento          Pedir  Total  Días\n` +
    `${'─'.repeat(50)}\n` +
    items.map(it =>
      `${it.medicamento.padEnd(20)} ${String(it.botes_pedidos).padStart(5)}  ${String(Math.round(it.botes_total*10)/10).padStart(5)}  ${it.dias_restantes_tras_pedido || '-'}`
    ).join('\n');

  if (navigator.share) {
    navigator.share({ title: 'Pedido ' + numPedido, text: texto });
  } else {
    navigator.clipboard.writeText(texto).then(() => showToast('📋 Copiado al portapapeles'));
  }
}

// ===== CITAS MÉDICAS =====
function renderCitas() {
  const citas = DB.get('citas', []).sort((a,b) => a.fecha.localeCompare(b.fecha));
  const container = document.getElementById('citas-list');

  if (citas.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-text">No hay citas. ¡Añade tu primera!</div></div>`;
    return;
  }

  const hoy = new Date().toISOString().split('T')[0];
  const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  container.innerHTML = citas.map(c => {
    const pasada = c.fecha < hoy;
    const esManana = c.fecha === manana;
    let cardClass = 'cita-card';
    if (esManana) cardClass += ' manana';
    return `
    <div class="${cardClass}" style="${pasada ? 'opacity:0.6;border-left-color:#ccc' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="cita-date">📅 ${formatFecha(c.fecha)} · ${c.hora}</div>
          <div class="cita-doctor">👨‍⚕️ ${c.profesional}</div>
          ${c.observaciones ? `<div class="cita-obs">📝 ${c.observaciones}</div>` : ''}
          ${esManana ? `<div style="color:var(--rojo);font-size:12px;font-weight:900;margin-top:4px">⚠️ ¡MAÑANA!</div>` : ''}
        </div>
        ${pasada ? '<span class="badge badge-rojo">Pasada</span>' : esManana ? '<span class="badge badge-rojo">Mañana</span>' : '<span class="badge badge-verde">Próxima</span>'}
      </div>
      <div class="cita-actions">
        <button class="btn-sm btn-sm-azul" onclick="editarCita(${c.id})">✏️ Editar</button>
        <button class="btn-sm btn-sm-verde" onclick="compartirCita(${c.id})">📤 Compartir</button>
        <button class="btn-sm btn-sm-rojo" onclick="borrarCita(${c.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function compartirCita(id) {
  const cita = DB.get('citas', []).find(c => c.id === id);
  if (!cita) return;
  const txt = `📅 Cita médica\n${formatFecha(cita.fecha)} a las ${cita.hora}\nMédico: ${cita.profesional}${cita.observaciones ? '\nNotas: ' + cita.observaciones : ''}`;
  if (navigator.share) {
    navigator.share({ title: 'Cita médica', text: txt });
  } else {
    navigator.clipboard.writeText(txt).then(() => showToast('📋 Copiado'));
  }
}

function formatFecha(fechaStr) {
  if (!fechaStr) return '';
  const [y, m, d] = fechaStr.split('-');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${d} ${meses[parseInt(m)-1]} ${y}`;
}

function guardarCita() {
  const prof = document.getElementById('c-prof').value.trim();
  if (!prof) { showToast('⚠️ Introduce el nombre del médico', 'error'); return; }

  const cita = {
    id: editingCitaId || nextId(),
    profesional: prof,
    fecha: document.getElementById('c-fecha').value,
    hora: document.getElementById('c-hora').value,
    observaciones: document.getElementById('c-obs').value.trim()
  };

  const citas = DB.get('citas', []);
  if (editingCitaId) {
    const idx = citas.findIndex(c => c.id === editingCitaId);
    if (idx >= 0) citas[idx] = cita;
    showToast('✅ Cita actualizada');
  } else {
    citas.push(cita);
    showToast('✅ Cita añadida');
    // Programar notificación si es posible
    programarNotificacionCita(cita);
  }
  DB.set('citas', citas);
  cancelarEditarCita();
  renderCitas();
  cargarCitasMini();
}

function editarCita(id) {
  const cita = DB.get('citas', []).find(c => c.id === id);
  if (!cita) return;
  editingCitaId = id;
  document.getElementById('c-prof').value = cita.profesional;
  document.getElementById('c-fecha').value = cita.fecha;
  document.getElementById('c-hora').value = cita.hora;
  document.getElementById('c-obs').value = cita.observaciones;
  document.getElementById('citas-form-title').textContent = '✏️ Editar Cita';
  document.getElementById('c-btn-guardar').textContent = '💾 Actualizar Cita';
  document.getElementById('c-btn-guardar').style.background = '#f39c12';
  document.getElementById('c-btn-cancelar').style.display = 'block';
  document.getElementById('content').scrollTop = 0;
}

function cancelarEditarCita() {
  editingCitaId = null;
  document.getElementById('c-prof').value = '';
  document.getElementById('c-fecha').value = '';
  document.getElementById('c-hora').value = '10:00';
  document.getElementById('c-obs').value = '';
  document.getElementById('citas-form-title').textContent = '➕ Nueva Cita';
  document.getElementById('c-btn-guardar').textContent = '➕ Añadir Cita';
  document.getElementById('c-btn-guardar').style.background = '';
  document.getElementById('c-btn-cancelar').style.display = 'none';
}

function borrarCita(id) {
  showConfirm('🗑️ Borrar cita', '¿Eliminar esta cita definitivamente?', () => {
    const citas = DB.get('citas', []).filter(c => c.id !== id);
    DB.set('citas', citas);
    showToast('Cita eliminada', 'error');
    renderCitas();
    cargarCitasMini();
  });
}

// ===== NOTIFICACIONES =====
async function solicitarPermisoNotificaciones() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

function programarNotificacionCita(cita) {
  // La API Notification no permite programar para el futuro desde el navegador sin SW avanzado.
  // Usamos una comprobación diaria al abrir la app.
  // El recordatorio se lanza al iniciar si hay citas mañana.
}

function verificarCitasManana() {
  const hoy = new Date().toISOString().split('T')[0];
  const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const citasManana = DB.get('citas', []).filter(c => c.fecha === manana);

  const badge = document.getElementById('notif-citas');
  if (citasManana.length > 0) {
    if (badge) { badge.style.display = 'flex'; badge.textContent = citasManana.length; }

    // Notificación nativa si tenemos permiso
    if (Notification.permission === 'granted') {
      citasManana.forEach(c => {
        new Notification('🏥 Cita mañana – FaR-Rmacia', {
          body: `${c.profesional} a las ${c.hora}${c.observaciones ? '\n' + c.observaciones : ''}`,
          icon: 'icon-192.png',
          tag: 'cita-' + c.id
        });
      });
    } else {
      // Aviso en toast
      setTimeout(() => {
        showToast(`📅 Tienes ${citasManana.length} cita(s) mañana`, 'info');
      }, 2000);
    }
  } else {
    if (badge) badge.style.display = 'none';
  }
}

// ===== MINI CITAS EN MENÚ =====
function cargarCitasMini() {
  const hoy = new Date().toISOString().split('T')[0];
  const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const citas = DB.get('citas', [])
    .filter(c => c.fecha >= hoy)
    .sort((a,b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 5);

  const container = document.getElementById('citas-mini-list');
  if (!container) return;

  if (citas.length === 0) {
    container.innerHTML = `<span class="sin-citas">Sin citas próximas</span>`;
    return;
  }

  container.innerHTML = citas.map(c => {
    const urgente = c.fecha === manana;
    return `<div class="cita-chip${urgente ? ' urgente' : ''}" onclick="navigate('citas')">
      📅 ${formatFecha(c.fecha)} – ${c.profesional}${urgente ? ' ⚠️' : ''}
    </div>`;
  }).join('');
}

// ===== HISTORIAL MÉDICO =====
function cargarHistorial() {
  const notas = DB.get('notas', '');
  document.getElementById('h-notas').value = notas;
  renderDocs();
}

function guardarNotas() {
  const notas = document.getElementById('h-notas').value;
  DB.set('notas', notas);
  showToast('💾 Notas guardadas');
}

// ===== SUBIR ARCHIVOS AL HISTORIAL =====
function subirArchivoHistorial(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  let processed = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const base64 = e.target.result;
      const docs = DB.get('docs', []);
      const prefijo = new Date().toISOString().replace(/[:.]/g,'').slice(0,15);
      docs.push({
        id: nextId(),
        nombre: prefijo + '_' + file.name,
        titulo: file.name,
        tipo: file.type || 'application/octet-stream',
        es_archivo: true,
        base64: base64,
        contenido: '',
        fecha: new Date().toLocaleString('es-ES'),
        tamano: file.size
      });
      DB.set('docs', docs);
      processed++;
      if (processed === files.length) {
        showToast(`✅ ${files.length} archivo(s) guardado(s)`);
        renderDocs();
      }
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
}

// ===== CREAR NOTA DE TEXTO =====
function crearNotaDocumento() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">📄 Crear Nota / Documento</div>
      <div class="form-group">
        <label class="form-label">Título del documento</label>
        <input type="text" class="form-input" id="doc-titulo" placeholder="Ej: Analítica Junio 2026"/>
      </div>
      <div class="form-group">
        <label class="form-label">Contenido</label>
        <textarea class="form-textarea" id="doc-contenido" placeholder="Escribe el contenido del documento..."></textarea>
      </div>
      <button class="btn-primary" onclick="guardarDocumento()">💾 Guardar Documento</button>
      <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function guardarDocumento() {
  const titulo = document.getElementById('doc-titulo').value.trim();
  const contenido = document.getElementById('doc-contenido').value.trim();
  if (!titulo) { showToast('⚠️ Escribe un título', 'error'); return; }

  const docs = DB.get('docs', []);
  const fecha = new Date().toLocaleString('es-ES');
  const prefijo = new Date().toISOString().replace(/[:.]/g,'_').slice(0,16);
  docs.push({ id: nextId(), nombre: prefijo + '_' + titulo, titulo, contenido, es_archivo: false, base64: null, tipo: 'text/plain', fecha });
  DB.set('docs', docs);
  document.querySelector('.modal-overlay')?.remove();
  showToast('✅ Documento guardado');
  renderDocs();
}

function renderDocs() {
  const docs = DB.get('docs', []);
  const container = document.getElementById('docs-list');
  if (!container) return;

  if (docs.length === 0) {
    container.innerHTML = `<div class="empty-text" style="font-size:13px;color:#aaa;text-align:center;padding:20px">No hay documentos guardados.</div>`;
    return;
  }

  container.innerHTML = docs.map(doc => {
    const iconos = { 'application/pdf': '📄', 'image/jpeg': '🖼️', 'image/png': '🖼️', 'text/plain': '📝' };
    const icono = iconos[doc.tipo] || (doc.es_archivo ? '📎' : '📝');
    const tamanoStr = doc.tamano ? ` · ${(doc.tamano/1024).toFixed(1)} KB` : '';
    return `
    <div class="doc-item">
      <div class="doc-icon">${icono}</div>
      <div class="doc-name" onclick="verDocumento(${doc.id})" style="cursor:pointer;color:var(--azul-oscuro)">
        ${doc.titulo}<br><span style="font-size:11px;color:#999;font-weight:400">${doc.fecha}${tamanoStr}</span>
      </div>
      <button class="doc-compartir" onclick="compartirDoc(${doc.id})" title="Compartir">📤</button>
      <button class="doc-del" onclick="borrarDoc(${doc.id})" title="Borrar">🗑️</button>
    </div>
  `;}).join('');
}

function verDocumento(id) {
  const doc = DB.get('docs', []).find(d => d.id === id);
  if (!doc) return;

  // Si es un archivo real (imagen, pdf...) abrir en nueva pestaña
  if (doc.es_archivo && doc.base64) {
    const tipo = doc.tipo || 'application/octet-stream';
    if (tipo.startsWith('image/')) {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-sheet" style="text-align:center">
          <div class="modal-handle"></div>
          <div class="modal-title">🖼️ ${doc.titulo}</div>
          <img src="${doc.base64}" style="max-width:100%;border-radius:12px;margin-bottom:12px"/>
          <button class="btn-primary" onclick="compartirDoc(${doc.id})">📤 Compartir</button>
          <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    } else {
      // Intentar abrir PDF u otros archivos
      try {
        const byteStr = atob(doc.base64.split(',')[1]);
        const ab = new ArrayBuffer(byteStr.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
        const blob = new Blob([ab], { type: tipo });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch(e) {
        showToast('No se puede previsualizar este tipo de archivo', 'error');
      }
    }
    return;
  }

  // Nota de texto
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">📄 ${doc.titulo}</div>
      <p style="font-size:11px;color:#999;margin-bottom:12px">${doc.fecha}</p>
      <textarea class="nota-area" readonly style="min-height:200px;background:#f9f9f9">${doc.contenido}</textarea>
      <button class="btn-primary" onclick="compartirDoc(${doc.id})">📤 Compartir</button>
      <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function compartirDoc(id) {
  const doc = DB.get('docs', []).find(d => d.id === id);
  if (!doc) return;

  if (doc.es_archivo && doc.base64 && navigator.share) {
    // Compartir archivo real
    try {
      const tipo = doc.tipo || 'application/octet-stream';
      const byteStr = atob(doc.base64.split(',')[1]);
      const ab = new ArrayBuffer(byteStr.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
      const blob = new Blob([ab], { type: tipo });
      const file = new File([blob], doc.titulo, { type: tipo });
      navigator.share({ files: [file], title: doc.titulo }).catch(() => {
        navigator.share({ title: doc.titulo, text: doc.titulo });
      });
      return;
    } catch(e) {}
  }

  const txt = doc.es_archivo ? doc.titulo : `${doc.titulo}\n${doc.fecha}\n\n${doc.contenido}`;
  if (navigator.share) {
    navigator.share({ title: doc.titulo, text: txt });
  } else {
    navigator.clipboard.writeText(txt).then(() => showToast('📋 Copiado al portapapeles'));
  }
}

function borrarDoc(id) {
  showConfirm('🗑️ Borrar documento', '¿Eliminar este documento?', () => {
    const docs = DB.get('docs', []).filter(d => d.id !== id);
    DB.set('docs', docs);
    showToast('Documento eliminado', 'error');
    renderDocs();
  });
}

// ===== ALERTAS DE STOCK BAJO =====
function verificarAlertas() {
  const meds = DB.get('meds');
  const alertas = meds.filter(med => {
    const s = calcularStock(med);
    return s.iniciado && s.diasRestantes <= 14 && s.diasRestantes >= 0;
  });

  if (alertas.length > 0) {
    setTimeout(() => {
      showToast(`⚠️ Stock bajo: ${alertas.length} medicamento(s)`, 'error');
    }, 1500);

    if (Notification.permission === 'granted') {
      new Notification('⚠️ Stock bajo – FaR-Rmacia', {
        body: alertas.map(m => m.nombre).join(', '),
        icon: 'icon-192.png',
        tag: 'stock-bajo'
      });
    }
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initDB();
  actualizarReloj();
  setInterval(actualizarReloj, 30000);
  
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('c-fecha').value = hoy;

  cargarCitasMini();
  verificarAlertas();
  verificarCitasManana();

  // Solicitar permiso notificaciones
  solicitarPermisoNotificaciones().then(ok => {
    if (ok) verificarCitasManana();
  });

  // Inicializar gestos swipe
  initSwipeGestures();

  // Sincronización automática si hay pendientes al abrir
  if (localStorage.getItem('farrmacia_pendingSync') === 'true') {
    setTimeout(() => syncToFirebase(), 3000);
  }

  // Service Worker para PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
