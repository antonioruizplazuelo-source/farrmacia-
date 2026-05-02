// ===== CONFIGURACIÓN Y DB =====
const DB = {
    get(key, def = []) {
        return JSON.parse(localStorage.getItem('farrmacia_' + key)) ?? def;
    },
    set(key, val) {
        localStorage.setItem('farrmacia_' + key, JSON.stringify(val));
        sincronizarConNube(); // Sync auto al cambiar algo
    }
};

// ===== NAVEGACIÓN =====
let currentScreen = 'menu';
function navigate(screen) {
    currentScreen = screen;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + screen).classList.add('active');
    
    if(screen === 'inventario') renderInventario();
    if(screen === 'pedidos') renderPedidos();
    if(screen === 'menu') cargarCitasMini();
}

// ===== SINCRONIZACIÓN FIREBASE (REALTIME) =====
async function sincronizarConNube() {
    if (!navigator.onLine || !window.db) return;
    try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const datos = {
            meds: DB.get('meds'),
            citas: DB.get('citas'),
            notas: DB.get('notas', ''),
            ultimaSincro: new Date().toISOString()
        };
        await setDoc(doc(window.db, "usuarios", "antonio"), datos);
        console.log("☁️ Sincronizado");
    } catch (e) { console.error(e); }
}

async function activarEscuchaRealTime() {
    if (!window.db || !navigator.onLine) return;
    const { doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    
    onSnapshot(doc(window.db, "usuarios", "antonio"), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            // Actualizar LocalStorage con lo que viene de la nube
            Object.keys(data).forEach(key => {
                localStorage.setItem('farrmacia_' + key, JSON.stringify(data[key]));
            });
            refrescarUI();
            actualizarEstadoRed(true);
        }
    });
}

// ===== UI Y RENDER =====
function refrescarUI() {
    if (currentScreen === 'inventario') renderInventario();
    if (currentScreen === 'menu') cargarCitasMini();
}

function actualizarEstadoRed(online) {
    const icon = document.getElementById('sync-icon');
    const text = document.getElementById('sync-text');
    if (online || navigator.onLine) {
        icon.style.color = "#CCFF00";
        text.textContent = "Sincronizado";
    } else {
        icon.style.color = "#FF9800";
        text.textContent = "Modo Local";
    }
}

function actualizarReloj() {
    const ahora = new Date();
    document.getElementById('header-clock').innerHTML = ahora.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// ===== LÓGICA DE MEDICAMENTOS =====
function renderInventario() {
    const meds = DB.get('meds');
    const container = document.getElementById('inventario-list');
    container.innerHTML = meds.map(m => `
        <div class="card">
            <div style="font-weight:900">${m.nombre.toUpperCase()}</div>
            <div style="font-size:12px; color:var(--naranja)">Stock: ${m.stock_real} botes</div>
            <button class="btn-primary" style="padding:5px; font-size:10px" onclick="borrarMed(${m.id})">Borrar</button>
        </div>
    `).join('');
}

function guardarMedicamento() {
    const nombre = document.getElementById('f-nombre').value;
    if(!nombre) return;
    const meds = DB.get('meds');
    meds.push({
        id: Date.now(),
        nombre,
        cantidad_bote: document.getElementById('f-bote').value,
        dosis_dia: document.getElementById('f-dosis').value,
        stock_real: document.getElementById('f-stock').value
    });
    DB.set('meds', meds);
    navigate('inventario');
}

// ===== INICIO =====
document.addEventListener('DOMContentLoaded', () => {
    actualizarReloj();
    setInterval(actualizarReloj, 1000);
    window.addEventListener('online', () => actualizarEstadoRed(true));
    window.addEventListener('offline', () => actualizarEstadoRed(false));
    
    // Simulación de carga de Firebase (debes tener tu config de Firebase antes)
    setTimeout(() => {
        activarEscuchaRealTime();
    }, 1000);
});
