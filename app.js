// =============================================
// FaR-Rmacia - App Logic (app.js)
// =============================================

// ===== BASE DE DATOS (localStorage) =====
const DB = {
  get(key, def = []) {
    try { return JSON.parse(localStorage.getItem('farrmacia_' + key)) ?? def; }
    catch { return def; }
  },
  set(key, val) {
    localStorage.setItem('farrmacia_' + key, JSON.stringify(val));
  }
};

// Inicializar datos de ejemplo si está vacío
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

// ===== NAVEGACIÓN =====
let currentScreen = 'menu';
let navHistory = [];
let editingCitaId = null;
let editingMedId = null;
let pedidoItems = [];

function navigate(screen) {
  // Guardar en historial
  if (currentScreen !== screen) navHistory.push(currentScreen);

  currentScreen = screen;

  // Ocultar todas
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + screen)?.classList.add('active');

  // Header
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

  // Actualizar nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === screen);
  });

  // FAB
  const fabScreens = ['inventario', 'citas', 'medicamentos'];
  const fab = document.getElementById('fab');
  if (screen === 'inventario' || screen === 'medicamentos') {
    fab.textContent = '+';
    fab.classList.add('visible');
  } else if (screen === 'citas') {
    fab.textContent = '+';
    fab.classList.add('visible');
  } else {
    fab.classList.remove('visible');
  }

  // Cargar datos de cada pantalla
  switch(screen) {
    case 'menu': cargarCitasMini(); break;
    case 'inventario': renderInventario(); break;
    case 'pedidos': renderPedidos(); break;
    case 'citas': renderCitas(); break;
    case 'historial': cargarHistorial(); break;
    case 'historial-pedidos': renderHistorialPedidos(); break;
  }

  // Scroll al top
  document.getElementById('content').scrollTop = 0;
}

function goBack() {
  if (navHistory.length > 0) {
    navigate(navHistory.pop());
    navHistory.pop(); // quitar el que acaba de añadir navigate
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
  setTimeout(() => t.className = '', 2500);
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
    const pct = s.iniciado
      ? Math.min(100, Math.round((s.diasRestantes / 90) * 100))
      : 100;
    const colorBar = colorDias(s.diasRestantes);
    const tiempoTxt = s.iniciado ? formatTiempo(s.diasRestantes) : "▶️ Pulsa 'Iniciar'";
    const pedidoTxt = med.incluir_pedido ? '✅ Incluido en pedidos' : '❌ Excluido de pedidos';
    const pedidoCls = med.incluir_pedido ? 'incluido' : 'excluido';

    return `
    <div class="med-card" onclick="abrirModificar(${med.id})">
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

// ===== AÑADIR MEDICAMENTO =====
function limpiarFormulario() {
  ['f-nombre','f-bote','f-dosis','f-stock','f-obs'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-incluir').checked = true;
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
    foto: '',
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
  meds[idx] = {
    ...meds[idx],
    nombre: document.getElementById('m-nombre').value.trim(),
    cantidad_bote: unidBote,
    dosis_dia: parseFloat(document.getElementById('m-dosis').value) || 0,
    stock_real: nuevoStock,
    observaciones: document.getElementById('m-obs').value.trim(),
    fecha_inicio: document.getElementById('m-fecha').value || '',
    incluir_pedido: document.getElementById('m-incluir').checked ? 1 : 0
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
    const botes = item.unidBote > 0
      ? Math.ceil(falta / item.unidBote)
      : 0;
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
    const numPedido = 'P' + String(DB.get('nextPedidoId', 1)).padStart(4, '0');
    DB.set('nextPedidoId', (DB.get('nextPedidoId', 1) + 1));
    const fecha = new Date().toLocaleString('es-ES');

    pedidoItems.forEach(item => {
      if (item.qty <= 0 || !item.incluir_pedido) return;
      const idx = meds.findIndex(m => m.id === item.id);
      if (idx >= 0) {
        const stockAnterior = parseFloat(meds[idx].stock_real) || 0;
        const nuevoStock = item.botesCalc + item.qty;
        meds[idx].stock_real = nuevoStock;
        if (!meds[idx].fecha_inicio) meds[idx].fecha_inicio = '';

        historial.push({
          id: nextId(),
          fecha,
          num_pedido: numPedido,
          medicamento: item.nombre,
          botes_pedidos: item.qty,
          botes_total: nuevoStock
        });
      }
    });

    DB.set('meds', meds);
    DB.set('historial_pedidos', historial);
    showToast(`✅ Pedido ${numPedido} confirmado`);
    generarResumenPedido(numPedido, conCantidad);
    navigate('inventario');
  });
}

function generarResumenPedido(numPedido, items) {
  const lineas = items.map(it => `• ${it.nombre}: ${it.qty} botes`).join('\n');
  const texto = `PEDIDO ${numPedido}\n${new Date().toLocaleString('es-ES')}\n\n${lineas}`;
  
  // Mostrar modal con resumen para compartir
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">📄 Resumen del Pedido ${numPedido}</div>
      <textarea class="nota-area" id="resumen-pedido-txt" readonly style="min-height:150px;background:#f9f9f9">${texto}</textarea>
      <button class="btn-primary" onclick="compartirPedido('${numPedido}')">📤 Compartir por WhatsApp / Email</button>
      <button class="btn-primary" style="background:var(--azul);margin-top:8px" onclick="copiarTexto()">📋 Copiar Texto</button>
      <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function copiarTexto() {
  const txt = document.getElementById('resumen-pedido-txt')?.value;
  if (txt) {
    navigator.clipboard.writeText(txt).then(() => showToast('📋 Texto copiado')).catch(() => {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('📋 Texto copiado');
    });
  }
}

function compartirPedido(numPedido) {
  const txt = document.getElementById('resumen-pedido-txt')?.value || '';
  if (navigator.share) {
    navigator.share({ title: 'Pedido Farmacia ' + numPedido, text: txt });
  } else {
    const url = 'https://wa.me/?text=' + encodeURIComponent(txt);
    window.open(url, '_blank');
  }
}

// ===== HISTORIAL PEDIDOS =====
function renderHistorialPedidos() {
  const historial = DB.get('historial_pedidos', []).reverse();
  const container = document.getElementById('historial-pedidos-list');

  if (historial.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📜</div><div class="empty-text">No hay pedidos registrados.</div></div>`;
    return;
  }

  // Agrupar por num_pedido
  const grupos = {};
  historial.forEach(h => {
    if (!grupos[h.num_pedido]) grupos[h.num_pedido] = { fecha: h.fecha, items: [] };
    grupos[h.num_pedido].items.push(h);
  });

  container.innerHTML = Object.entries(grupos).map(([numP, g]) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:16px;font-weight:900;color:var(--azul-oscuro)">📋 ${numP}</div>
        <div style="font-size:11px;color:#999">${g.fecha}</div>
      </div>
      ${g.items.map(it => `
        <div class="historial-item">
          <div class="historial-item-med">💊 ${it.medicamento}</div>
          <div style="display:flex;gap:8px;margin-top:4px">
            <span class="badge badge-amarillo" style="background:#fff9c4;color:#666">Pedido: ${it.botes_pedidos} botes</span>
            <span class="badge badge-verde">Total: ${Math.round(it.botes_total * 100)/100} botes</span>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
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
  container.innerHTML = citas.map(c => {
    const pasada = c.fecha < hoy;
    return `
    <div class="cita-card" style="${pasada ? 'opacity:0.6;border-left-color:#ccc' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="cita-date">📅 ${formatFecha(c.fecha)} · ${c.hora}</div>
          <div class="cita-doctor">👨‍⚕️ ${c.profesional}</div>
          ${c.observaciones ? `<div class="cita-obs">📝 ${c.observaciones}</div>` : ''}
        </div>
        ${pasada ? '<span class="badge badge-rojo">Pasada</span>' : '<span class="badge badge-verde">Próxima</span>'}
      </div>
      <div class="cita-actions">
        <button class="btn-sm btn-sm-azul" onclick="editarCita(${c.id})">✏️ Editar</button>
        <button class="btn-sm btn-sm-rojo" onclick="borrarCita(${c.id})">🗑️ Borrar</button>
      </div>
    </div>`;
  }).join('');
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

// ===== MINI CITAS EN MENÚ =====
function cargarCitasMini() {
  const hoy = new Date().toISOString().split('T')[0];
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

  container.innerHTML = citas.map(c =>
    `<div class="cita-chip" onclick="navigate('citas')">📅 ${formatFecha(c.fecha)} - ${c.profesional}</div>`
  ).join('');
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

function archivarDocumento() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-title">📄 Crear Nota / Documento</div>
      <div class="form-group">
        <label class="form-label">Título del documento</label>
        <input type="text" class="form-input" id="doc-titulo" placeholder="Ej: Analítica Junio 2025"/>
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
  docs.push({ id: nextId(), nombre: prefijo + '_' + titulo, titulo, contenido, fecha });
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

  container.innerHTML = docs.map(doc => `
    <div class="doc-item">
      <div class="doc-icon">📄</div>
      <div class="doc-name" onclick="verDocumento(${doc.id})" style="cursor:pointer;color:var(--azul-oscuro)">
        ${doc.titulo}<br><span style="font-size:11px;color:#999;font-weight:400">${doc.fecha}</span>
      </div>
      <button class="doc-del" onclick="borrarDoc(${doc.id})">🗑️</button>
    </div>
  `).join('');
}

function verDocumento(id) {
  const doc = DB.get('docs', []).find(d => d.id === id);
  if (!doc) return;
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
  const txt = `${doc.titulo}\n${doc.fecha}\n\n${doc.contenido}`;
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
    const nombres = alertas.map(m => m.nombre).join(', ');
    setTimeout(() => {
      showToast(`⚠️ Stock bajo: ${alertas.length} medicamento(s)`, 'error');
    }, 1500);
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initDB();
  actualizarReloj();
  setInterval(actualizarReloj, 30000);
  
  // Fecha por defecto en citas
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('c-fecha').value = hoy;

  cargarCitasMini();
  verificarAlertas();

  // Service Worker para PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
