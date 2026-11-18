import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Escapa texto del usuario antes de meterlo al HTML (evita inyecciones)
export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function toast(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  if (!t) return alert(msg);
  t.textContent = msg;
  t.className = `toast visible ${tipo}`;
  setTimeout(() => (t.className = 'toast'), 3500);
}

// Devuelve { user, perfil } o null si no hay sesión
export async function sesionActual() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil, error } = await supabase
    .from('perfiles').select('*').eq('id', user.id).single();
  if (error) throw error;
  return { user, perfil };
}

// Ruta donde debe quedarse cada usuario según su rol y aprobación
export function rutaPara(perfil) {
  if (perfil.rol === 'admin') return 'admin.html';
  if (perfil.rol === 'docente') return perfil.aprobado ? 'docente.html' : 'index.html?estado=pendiente';
  return 'alumno.html';
}

// Protege una página: si el rol no coincide, manda a su página correcta
export async function protegerPagina(rolRequerido) {
  const s = await sesionActual();
  if (!s) { location.href = 'index.html'; return null; }
  const { perfil } = s;
  const correcta = rutaPara(perfil);
  if (perfil.rol !== rolRequerido || (rolRequerido === 'docente' && !perfil.aprobado)) {
    location.href = correcta;
    return null;
  }
  const saludo = document.getElementById('usuario');
  if (saludo) saludo.textContent = perfil.nombre_completo;
  document.getElementById('cerrar')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.href = 'index.html';
  });
  return s;
}
