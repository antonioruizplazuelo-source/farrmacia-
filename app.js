// ===== CONFIGURACIÓN DB LOCAL =====
const DB = {
    get(key, def = []) {
        try { return JSON.parse(localStorage.getItem('farrmacia_' + key)) ?? def; }
        catch { return def; }
    },
    set(key, val) {
        localStorage.setItem('farrmacia_' + key, JSON.stringify(val));
        sincronizarConNube(); // Sincroniza cada vez que guardas algo
    }
};

// ===== NAVEGACIÓN Y ESTADOS =====
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

    // Actualizar Header y Nav (Lógica simplificada del Source 2/3)
    document.getElementById('btn-back')?.classList.toggle('visible', screen !== 'menu');
    
    switch(screen) {
        case 'menu': cargarCitasMini(); break;
        case 'inventario': renderInventario(); break;
        case 'pedidos': renderPedidos(); break;
        case 'citas': renderCitas(); break;
        case 'historial': cargarHistorial(); break;
    }
}

// ===== FIREBASE: SINCRONIZACIÓN =====
async function sincronizarConNube() {
    if (!navigator.onLine || !window.db) return;
    try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const datos = {
            meds: DB.get('meds'),
            notas: DB.get('notas', ''),
            docs: DB.get('docs', []),
            citas: DB.get('citas', []),
            ultimaSincro: new Date().toISOString()
        };
        await setDoc(doc(window.db, "usuarios", "antonio"), datos);
        actualizarEstadoRed(true);
    } catch (e) { console.error("Error nube:", e); }
}

async function activarEscuchaEnTiempoReal() {
    if (!window.db) return;
    const { doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    onSnapshot(doc(window.db, "usuarios", "antonio"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            Object.keys(data).forEach(key => {
                if (key !== 'ultimaSincro') localStorage.setItem('farrmacia_' + key, JSON.stringify(data[key]));
            });
            refrescarPantallaActual();
        }
    });
}

function actualizarEstadoRed() {
    const icon = document.getElementById('sync-icon');
    const text = document.getElementById('sync-text');
    if (navigator.onLine) {
        icon.style.color = "#CCFF00"; 
        text.textContent = "Sincronizado";
    } else {
        icon.style.color = "#FF9800";
        text.textContent = "Modo Local (Offline)";
    }
}

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    actualizarReloj();
    setInterval(actualizarReloj, 30000);
    actualizarEstadoRed();
    
    setTimeout(() => {
        activarEscuchaEnTiempoReal();
    }, 1000);

    window.addEventListener('online', actualizarEstadoRed);
    window.addEventListener('offline', actualizarEstadoRed);
});

// Nota: Debes incluir aquí todas las funciones de renderizado (renderInventario, calcularStock, etc.) 
// que ya tenías en tu archivo original.
