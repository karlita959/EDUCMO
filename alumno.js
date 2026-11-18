import { supabase, protegerPagina, esc, toast } from './supabase.js';

const sesion = await protegerPagina('alumno');
if (!sesion) throw new Error('sin acceso');

// RLS ya filtra: solo llegan los grupos donde estoy inscrito
const { data: grupos, error } = await supabase
  .from('grupos')
  .select('id, nombre, ciclo, materias(nombre), tareas(id, titulo, descripcion, fecha_entrega, puntaje_max)')
  .order('created_at');
if (error) toast(error.message, 'error');

// Mis calificaciones de tareas (RLS: solo las mías)
const { data: notas } = await supabase
  .from('tarea_calificaciones').select('tarea_id, calificacion, entregada');
const notaPorTarea = Object.fromEntries((notas ?? []).map(n => [n.tarea_id, n]));

const cont = document.getElementById('grupos');
if (!grupos?.length) {
  document.getElementById('sin-grupos').style.display = 'block';
} else {
  cont.innerHTML = grupos.map(g => `
    <div class="card">
      <h2>${esc(g.materias?.nombre)} · ${esc(g.nombre)} <small>(${esc(g.ciclo)})</small></h2>
      ${g.tareas?.length ? `
      <table>
        <thead><tr><th>Tarea</th><th>Entrega</th><th>Puntaje</th><th>Mi calificación</th></tr></thead>
        <tbody>${g.tareas.map(t => {
          const n = notaPorTarea[t.id];
          return `<tr>
            <td><strong>${esc(t.titulo)}</strong><br><small>${esc(t.descripcion ?? '')}</small></td>
            <td>${t.fecha_entrega ? new Date(t.fecha_entrega).toLocaleString('es-MX') : 'Sin fecha'}</td>
            <td>${t.puntaje_max}</td>
            <td>${n?.calificacion != null ? esc(n.calificacion) : '<span class="tag">Pendiente</span>'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<p>Sin tareas asignadas todavía.</p>'}
    </div>`).join('');
}
