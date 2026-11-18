import { supabase, protegerPagina, esc, toast } from './supabase.js';
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs';

const sesion = await protegerPagina('docente');
if (!sesion) throw new Error('sin acceso');
const miId = sesion.user.id;

const opciones = (lista, etiqueta) =>
  lista.map(x => `<option value="${x.id}">${esc(etiqueta(x))}</option>`).join('');

async function cargarTodo() {
  const [materias, grupos, alumnos] = await Promise.all([
    supabase.from('materias').select('*').order('nombre'),
    supabase.from('grupos').select('*, materias(nombre), grupo_alumnos(count)').order('created_at'),
    supabase.from('alumnos').select('*').order('nombre_completo'),
  ]);
  const err = materias.error || grupos.error || alumnos.error;
  if (err) return toast(err.message, 'error');

  document.getElementById('tabla-materias').innerHTML = materias.data.length
    ? materias.data.map(m => `<tr><td>${esc(m.nombre)}</td><td>${esc(m.codigo ?? '')}</td></tr>`).join('')
    : '<tr><td>Aún no tienes materias.</td></tr>';

  document.getElementById('select-materia-grupo').innerHTML = opciones(materias.data, m => m.nombre);

  document.getElementById('tabla-grupos').innerHTML = grupos.data.length
    ? grupos.data.map(g => `<tr>
        <td>${esc(g.materias?.nombre)}</td><td>${esc(g.nombre)}</td><td>${esc(g.ciclo)}</td>
        <td>${g.grupo_alumnos?.[0]?.count ?? 0}</td></tr>`).join('')
    : '<tr><td colspan="4">Aún no tienes grupos.</td></tr>';

  const grupoOpts = opciones(grupos.data, g => `${g.materias?.nombre} · ${g.nombre} (${g.ciclo})`);
  document.getElementById('select-grupo-insc').innerHTML = grupoOpts;
  document.getElementById('select-grupo-tarea').innerHTML = grupoOpts;

  document.getElementById('select-alumno-insc').innerHTML =
    opciones(alumnos.data, a => `${a.matricula} · ${a.nombre_completo}`);
}

document.getElementById('form-materia').onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const { error } = await supabase.from('materias').insert({ ...d, docente_id: miId });
  if (error) return toast(error.message, 'error');
  e.target.reset(); toast('Materia creada'); };

document.getElementById('form-grupo').onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const { error } = await supabase.from('grupos').insert({ ...d, docente_id: miId });
  if (error) return toast(error.message, 'error');
  e.target.reset(); toast('Grupo creado'); };

document.getElementById('form-alumno').onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const { error } = await supabase.from('alumnos').insert({ ...d, creado_por: miId });
  if (error) return toast(error.message, 'error');
  e.target.reset(); toast('Alumno dado de alta'); };

document.getElementById('form-inscribir').onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const { error } = await supabase.from('grupo_alumnos').insert(d);
  if (error) return toast(error.code === '23505' ? 'Ese alumno ya está en el grupo' : error.message, 'error');
  toast('Alumno inscrito'); };

document.getElementById('form-tarea').onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  if (!d.fecha_entrega) delete d.fecha_entrega;
  const { error } = await supabase.from('tareas').insert(d);
  if (error) return toast(error.message, 'error');
  e.target.reset(); toast('Tarea asignada');
};

// ---------- 6. CALIFICACIONES ----------
const selGrupoCal = document.getElementById('select-grupo-cal');
const selTareaCal = document.getElementById('select-tarea-cal');
const tablaCal = document.getElementById('tabla-calificaciones');
const btnGuardar = document.getElementById('guardar-calificaciones');
let alumnosGrupo = [];
let tareaActual = null;

async function cargarGruposCal() {
  const { data, error } = await supabase
    .from('grupos').select('id, nombre, ciclo, materias(nombre)').order('created_at');
  if (error) return toast(error.message, 'error');
  selGrupoCal.innerHTML = '<option value="">— Elige grupo —</option>' + opciones(data, g => `${g.materias?.nombre} · ${g.nombre} (${g.ciclo})`);
}

selGrupoCal.onchange = async () => {
  selTareaCal.innerHTML = '';
  tablaCal.innerHTML = '<tr><td colspan="4">Elige una tarea.</td></tr>';
  btnGuardar.style.display = 'none';
  if (!selGrupoCal.value) return;

  const [tareas, inscritos] = await Promise.all([
    supabase.from('tareas').select('id, titulo, puntaje_max').eq('grupo_id', selGrupoCal.value).order('created_at'),
    supabase.from('grupo_alumnos').select('alumnos(id, matricula, nombre_completo)').eq('grupo_id', selGrupoCal.value),
  ]);
  if (tareas.error || inscritos.error) return toast((tareas.error || inscritos.error).message, 'error');

  alumnosGrupo = inscritos.data.map(i => i.alumnos).sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo));
  selTareaCal.innerHTML = '<option value="">— Elige tarea —</option>' + tareas.data
    .map(t => `<option value="${t.id}" data-max="${t.puntaje_max}">${esc(t.titulo)}</option>`).join('');
};

selTareaCal.onchange = async () => {
  const opt = selTareaCal.selectedOptions[0];
  if (!selTareaCal.value) {
    tablaCal.innerHTML = '<tr><td colspan="4">Elige una tarea.</td></tr>';
    btnGuardar.style.display = 'none';
    return;
  }
  tareaActual = { id: selTareaCal.value, max: Number(opt.dataset.max) };

  const { data: notas, error } = await supabase
    .from('tarea_calificaciones').select('alumno_id, calificacion, entregada').eq('tarea_id', tareaActual.id);
  if (error) return toast(error.message, 'error');
  const porAlumno = Object.fromEntries(notas.map(n => [n.alumno_id, n]));

  tablaCal.innerHTML = alumnosGrupo.length ? alumnosGrupo.map(a => {
    const n = porAlumno[a.id] ?? {};
    return `<tr data-alumno="${a.id}">
      <td>${esc(a.matricula)}</td>
      <td>${esc(a.nombre_completo)}</td>
      <td><input type="checkbox" class="entregada" ${n.entregada ? 'checked' : ''} /></td>
      <td><input type="number" class="nota" min="0" max="${tareaActual.max}" step="0.1"
           value="${n.calificacion ?? ''}" style="width:110px" /></td>
    </tr>`;
  }).join('') : '<tr><td colspan="4">No hay alumnos inscritos en este grupo.</td></tr>';
  btnGuardar.style.display = alumnosGrupo.length ? 'inline-block' : 'none';
};

btnGuardar.onclick = async () => {
  const filas = [...tablaCal.querySelectorAll('tr[data-alumno]')].map(tr => {
    const nota = tr.querySelector('.nota').value;
    return {
      tarea_id: tareaActual.id,
      alumno_id: tr.dataset.alumno,
      calificacion: nota === '' ? null : Number(nota),
      entregada: tr.querySelector('.entregada').checked,
      updated_at: new Date().toISOString(),
    };
  });

  const fuera = filas.find(f => f.calificacion !== null && (f.calificacion < 0 || f.calificacion > tareaActual.max));
  if (fuera) return toast(`Las calificaciones deben estar entre 0 y ${tareaActual.max}`, 'error');

  const { error } = await supabase.from('tarea_calificaciones').upsert(filas, { onConflict: 'tarea_id,alumno_id' });
  if (error) return toast(error.message, 'error');
  toast('Calificaciones guardadas');
};

cargarGruposCal();
cargarTodo();

// ---------- 7. IMPORTAR ALUMNOS DESDE EXCEL ----------
const inputExcel = document.getElementById('archivo-excel');
const vistaPrevia = document.getElementById('vista-previa');
const btnImportar = document.getElementById('btn-importar');
const selGrupoExcel = document.getElementById('select-grupo-excel');
let alumnosLeidos = [];

// Quita acentos y pone en minúsculas para comparar encabezados
const normal = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function detectarColumnas(encabezados) {
  const buscar = (...claves) => encabezados.findIndex(h => claves.some(c => h.includes(c)));
  return {
    matricula: buscar('matricula'),
    nombre: buscar('nombre'),
    carrera: buscar('carrera'),
    email: buscar('correo', 'email'),
  };
}

function leerFilas(hoja) {
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false });
  const idxEncabezado = filas.findIndex(f => f.some(c => normal(c).includes('matricula')));
  if (idxEncabezado === -1) throw new Error('No encontré la columna Matrícula en el archivo.');
  const encabezados = filas[idxEncabezado].map(normal);
  const col = detectarColumnas(encabezados);
  if (col.nombre === -1) throw new Error('No encontré la columna Nombre en el archivo.');

  return filas.slice(idxEncabezado + 1)
    .map(f => ({
      matricula: String(f[col.matricula] ?? '').trim(),
      nombre_completo: String(f[col.nombre] ?? '').trim(),
      carrera: col.carrera >= 0 ? String(f[col.carrera] ?? '').trim() : '',
      email: col.email >= 0 ? String(f[col.email] ?? '').trim() : '',
    }))
    .filter(a => a.matricula && a.nombre_completo);
}

inputExcel.onchange = async () => {
  const archivo = inputExcel.files[0];
  btnImportar.style.display = 'none';
  document.getElementById('resultado-importacion').textContent = '';
  if (!archivo) return (vistaPrevia.innerHTML = '');
  try {
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    alumnosLeidos = leerFilas(libro.Sheets[libro.SheetNames[0]]);
  } catch (err) {
    alumnosLeidos = [];
    vistaPrevia.innerHTML = '';
    return toast(err.message, 'error');
  }
  if (!alumnosLeidos.length) {
    vistaPrevia.innerHTML = '<p>No se encontraron alumnos en el archivo.</p>';
    return;
  }
  vistaPrevia.innerHTML = `
    <p><strong>${alumnosLeidos.length}</strong> alumnos encontrados. Vista previa:</p>
    <table><thead><tr><th>Matrícula</th><th>Nombre</th><th>Carrera</th></tr></thead><tbody>
      ${alumnosLeidos.slice(0, 10).map(a => `<tr><td>${esc(a.matricula)}</td><td>${esc(a.nombre_completo)}</td><td>${esc(a.carrera)}</td></tr>`).join('')}
    </tbody></table>
    ${alumnosLeidos.length > 10 ? '<p><small>Se muestran los primeros 10.</small></p>' : ''}`;
  btnImportar.style.display = 'inline-block';
};

// Llena el selector de grupos para inscribir después de importar
async function cargarGruposExcel() {
  const { data } = await supabase.from('grupos').select('id, nombre, ciclo, materias(nombre)').order('created_at');
  selGrupoExcel.innerHTML = '<option value="">— No inscribir —</option>' +
    opciones(data ?? [], g => `${g.materias?.nombre} · ${g.nombre} (${g.ciclo})`);
}

btnImportar.onclick = async () => {
  btnImportar.disabled = true;
  const resultado = document.getElementById('resultado-importacion');
  try {
    // Matrículas que ya existen en el catálogo (se omiten para no romper la carga)
    const matriculas = alumnosLeidos.map(a => a.matricula);
    const { data: existentes, error: errExist } = await supabase
      .from('alumnos').select('id, matricula').in('matricula', matriculas);
    if (errExist) throw errExist;
    const yaExisten = new Map(existentes.map(a => [a.matricula, a.id]));

    const nuevos = alumnosLeidos.filter(a => !yaExisten.has(a.matricula));
    let creados = [];
    if (nuevos.length) {
      const { data, error } = await supabase
        .from('alumnos')
        .insert(nuevos.map(a => ({ ...a, creado_por: miId })))
        .select('id, matricula');
      if (error) throw error;
      creados = data;
    }

    // Inscribir a todos (nuevos y existentes) si se eligió un grupo
    let inscritos = 0;
    const grupoId = selGrupoExcel.value;
    if (grupoId) {
      const ids = [...creados.map(a => a.id), ...existentes.map(a => a.id)];
      if (ids.length) {
        const { error } = await supabase.from('grupo_alumnos')
          .upsert(ids.map(id => ({ grupo_id: grupoId, alumno_id: id })), { onConflict: 'grupo_id,alumno_id', ignoreDuplicates: true });
        if (error) throw error;
        inscritos = ids.length;
      }
    }

    resultado.className = 'msg-ok';
    resultado.textContent = `Listo: ${creados.length} nuevos, ${existentes.length} ya existían` +
      (grupoId ? `, ${inscritos} inscritos al grupo.` : '.');
    inputExcel.value = '';
    vistaPrevia.innerHTML = '';
    btnImportar.style.display = 'none';
    alumnosLeidos = [];
  } catch (err) {
    resultado.className = 'msg-error';
    resultado.textContent = 'Error: ' + err.message;
  } finally {
    btnImportar.disabled = false;
  }
};

// ---------- 8. MINUTA DE CALIFICACIONES (Excel) ----------
document.getElementById('btn-minuta').onclick = async () => {
  const grupoId = selGrupoCal.value;
  if (!grupoId) return toast('Primero elige un grupo en la sección 6', 'error');

  const [grupo, tareas, inscritos] = await Promise.all([
    supabase.from('grupos').select('nombre, ciclo, materias(nombre)').eq('id', grupoId).single(),
    supabase.from('tareas').select('id, titulo, puntaje_max').eq('grupo_id', grupoId).order('created_at'),
    supabase.from('grupo_alumnos').select('alumnos(id, matricula, nombre_completo)').eq('grupo_id', grupoId),
  ]);
  const err = grupo.error || tareas.error || inscritos.error;
  if (err) return toast(err.message, 'error');

  const alumnos = inscritos.data.map(i => i.alumnos).sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo));
  const ids = tareas.data.map(t => t.id);
  const { data: notas, error: errNotas } = ids.length
    ? await supabase.from('tarea_calificaciones').select('tarea_id, alumno_id, calificacion').in('tarea_id', ids)
    : { data: [], error: null };
  if (errNotas) return toast(errNotas.message, 'error');
  const nota = new Map(notas.map(n => [n.tarea_id + '|' + n.alumno_id, n.calificacion]));

  const encabezado = ['Matrícula', 'Nombre', ...tareas.data.map(t => `${t.titulo} (/${t.puntaje_max})`), 'Promedio tareas'];
  const filas = alumnos.map(a => {
    const valores = tareas.data.map(t => nota.get(t.id + '|' + a.id) ?? null);
    const conNota = valores.filter(v => v !== null);
    const promedio = conNota.length ? Number((conNota.reduce((x, y) => x + Number(y), 0) / conNota.length).toFixed(2)) : '';
    return [a.matricula, a.nombre_completo, ...valores.map(v => v ?? ''), promedio];
  });

  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.aoa_to_sheet([
    [`Minuta: ${grupo.data.materias?.nombre ?? ''} · ${grupo.data.nombre} (${grupo.data.ciclo})`],
    [],
    encabezado,
    ...filas,
  ]);
  XLSX.utils.book_append_sheet(libro, hoja, 'Minuta');
  const nombre = `minuta_${(grupo.data.materias?.nombre ?? 'materia')}_${grupo.data.nombre}.xlsx`.replace(/\s+/g, '_');
  XLSX.writeFile(libro, nombre);

  // Guardar el historial (si falla, la descarga ya se hizo; solo avisamos)
  const { error: errLog } = await supabase.from('minutas_descargadas').insert({
    grupo_id: grupoId, docente_id: miId, nombre_archivo: nombre, formato: 'excel',
  });
  if (errLog) toast('Minuta descargada, pero no se pudo guardar el historial', 'error');
};

cargarGruposExcel();
