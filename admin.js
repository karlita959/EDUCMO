import { supabase, protegerPagina, esc, toast } from './supabase.js';

await protegerPagina('admin');

async function cargar() {
  const { data: perfiles, error } = await supabase
    .from('perfiles').select('*').order('created_at', { ascending: false });
  if (error) return toast(error.message, 'error');

  const pendientes = perfiles.filter(p => p.rol === 'docente' && !p.aprobado);
  document.getElementById('tabla-docentes').innerHTML = pendientes.length
    ? pendientes.map(p => `
        <tr>
          <td>${esc(p.nombre_completo)}</td>
          <td>${new Date(p.created_at).toLocaleDateString('es-MX')}</td>
          <td><span class="tag pend">Pendiente</span></td>
          <td><button class="primario" data-aprobar="${p.id}">Aprobar</button></td>
        </tr>`).join('')
    : '<tr><td colspan="4">No hay docentes pendientes.</td></tr>';

  // Docentes ya aprobados, con opción de revocar el acceso
  const aprobados = perfiles.filter(p => p.rol === 'docente' && p.aprobado);
  document.getElementById('tabla-aprobados').innerHTML = aprobados.length
    ? aprobados.map(p => `
        <tr>
          <td>${esc(p.nombre_completo)}</td>
          <td><button class="secundario" data-revocar="${p.id}">Revocar acceso</button></td>
        </tr>`).join('')
    : '<tr><td colspan="2">No hay docentes aprobados.</td></tr>';

  cargarMinutas();

  document.getElementById('tabla-usuarios').innerHTML = perfiles.map(p => `
    <tr>
      <td>${esc(p.nombre_completo)}</td>
      <td>${esc(p.rol)}</td>
      <td>${p.aprobado ? '<span class="tag ok">Sí</span>' : '<span class="tag no">No</span>'}</td>
      <td>${new Date(p.created_at).toLocaleDateString('es-MX')}</td>
    </tr>`).join('');
}

document.getElementById('tabla-docentes').onclick = async (e) => {
  const id = e.target.dataset.aprobar;
  if (!id) return;
  const { error } = await supabase.from('perfiles').update({ aprobado: true }).eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Docente aprobado');
  cargar();
};

document.getElementById('tabla-aprobados').onclick = async (e) => {
  const id = e.target.dataset.revocar;
  if (!id || !confirm('¿Revocar el acceso de este docente?')) return;
  const { error } = await supabase.from('perfiles').update({ aprobado: false }).eq('id', id);
  if (error) return toast(error.message, 'error');
  toast('Acceso revocado');
  cargar();
};

async function cargarMinutas() {
  const { data, error } = await supabase
    .from('minutas_descargadas')
    .select('nombre_archivo, formato, descargado_en')
    .order('descargado_en', { ascending: false })
    .limit(50);
  if (error) return toast(error.message, 'error');
  document.getElementById('tabla-minutas').innerHTML = data.length
    ? data.map(m => `<tr>
        <td>${new Date(m.descargado_en).toLocaleString('es-MX')}</td>
        <td>${esc(m.nombre_archivo)}</td><td>${esc(m.formato)}</td></tr>`).join('')
    : '<tr><td colspan="3">Aún no hay minutas descargadas.</td></tr>';
}

const form = document.getElementById('form-alumno');
const btnCancelar = document.getElementById('btn-cancelar-alumno');
const tituloForm = document.getElementById('titulo-form-alumno');
let catalogo = [];

function limpiarFormAlumno() {
  form.reset();
  form.id.value = '';
  tituloForm.textContent = 'Dar de alta un alumno en el catálogo';
  btnCancelar.style.display = 'none';
}
btnCancelar.onclick = limpiarFormAlumno;

form.onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form));
  const id = d.id;
  delete d.id;
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = id
    ? await supabase.from('alumnos').update(d).eq('id', id)
    : await supabase.from('alumnos').insert({ ...d, creado_por: user.id });
  if (error) return toast(error.code === '23505' ? 'Esa matrícula ya existe' : error.message, 'error');

  document.getElementById('msg-alumno').textContent = id ? 'Alumno actualizado.' : 'Alumno guardado en el catálogo.';
  limpiarFormAlumno();
  cargarCatalogo();
};

function pintarCatalogo() {
  const q = document.getElementById('buscar-alumno').value.trim().toLowerCase();
  const filtrados = catalogo.filter(a =>
    !q || a.matricula.toLowerCase().includes(q) || a.nombre_completo.toLowerCase().includes(q));
  document.getElementById('tabla-alumnos').innerHTML = filtrados.length
    ? filtrados.map(a => `<tr>
        <td>${esc(a.matricula)}</td>
        <td>${esc(a.nombre_completo)}</td>
        <td>${esc(a.carrera ?? '')}</td>
        <td>${a.user_id ? '<span class="tag ok">Con cuenta</span>' : '<span class="tag">Sin cuenta</span>'}</td>
        <td style="white-space:nowrap">
          <button class="secundario" data-editar="${a.id}">Editar</button>
          <button class="secundario" data-borrar="${a.id}">Dar de baja</button>
        </td></tr>`).join('')
    : '<tr><td colspan="5">No hay alumnos que coincidan.</td></tr>';
}

async function cargarCatalogo() {
  const { data, error } = await supabase.from('alumnos').select('*').order('nombre_completo');
  if (error) return toast(error.message, 'error');
  catalogo = data;
  pintarCatalogo();
}

document.getElementById('buscar-alumno').oninput = pintarCatalogo;

document.getElementById('tabla-alumnos').onclick = async (e) => {
  const editar = e.target.dataset.editar;
  const borrar = e.target.dataset.borrar;
  if (editar) {
    const a = catalogo.find(x => x.id === editar);
    form.id.value = a.id;
    form.matricula.value = a.matricula;
    form.nombre_completo.value = a.nombre_completo;
    form.email.value = a.email ?? '';
    form.carrera.value = a.carrera ?? '';
    tituloForm.textContent = 'Editar alumno';
    btnCancelar.style.display = 'inline-block';
    form.scrollIntoView({ behavior: 'smooth' });
  }
  if (borrar) {
    const a = catalogo.find(x => x.id === borrar);
    const ok = confirm(`¿Dar de baja a ${a.nombre_completo}?\n\nSe borrarán también sus inscripciones y calificaciones. Esta acción no se puede deshacer.`);
    if (!ok) return;
    const { error } = await supabase.from('alumnos').delete().eq('id', borrar);
    if (error) return toast(error.message, 'error');
    toast('Alumno dado de baja');
    cargarCatalogo();
  }
};

cargar();
cargarCatalogo();
