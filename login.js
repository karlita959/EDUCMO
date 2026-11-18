import { supabase, sesionActual, rutaPara, toast } from './supabase.js';

const formLogin = document.getElementById('form-login');
const formRegistro = document.getElementById('form-registro');
const rolSelect = document.getElementById('rol-registro');
const campoMatricula = document.getElementById('campo-matricula');

function mostrar(tab) {
  formLogin.style.display = tab === 'login' ? 'block' : 'none';
  formRegistro.style.display = tab === 'registro' ? 'block' : 'none';
}
document.getElementById('tab-login').onclick = () => mostrar('login');
document.getElementById('tab-registro').onclick = () => mostrar('registro');

// Matrícula solo aplica a alumnos
function actualizarCampos() {
  const esAlumno = rolSelect.value === 'alumno';
  campoMatricula.style.display = esAlumno ? 'block' : 'none';
  formRegistro.matricula.required = esAlumno;
}
rolSelect.onchange = actualizarCampos;
actualizarCampos();

// Si ya tiene sesión, lo mandamos a su página
const actual = await sesionActual().catch(() => null);
const pendiente = new URLSearchParams(location.search).get('estado') === 'pendiente';
const destino = actual ? rutaPara(actual.perfil) : null;

// Docente pendiente: se queda aquí con el aviso (evita un bucle de redirección)
if (destino && !destino.includes('estado=pendiente')) {
  location.href = destino;
} else {
  mostrar('login');
  if (pendiente || (actual && destino?.includes('estado=pendiente'))) {
    document.getElementById('aviso-pendiente').style.display = 'block';
  }
}

formLogin.onsubmit = async (e) => {
  e.preventDefault();
  const { email, password } = Object.fromEntries(new FormData(formLogin));
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return (document.getElementById('msg-login').textContent = 'Correo o contraseña incorrectos.');
  const s = await sesionActual();
  location.href = rutaPara(s.perfil);
};

formRegistro.onsubmit = async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(formRegistro));
  const msg = document.getElementById('msg-registro');
  msg.textContent = 'Creando cuenta...';
  const { data, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      data: {
        nombre_completo: d.nombre,
        rol: d.rol,
        matricula: d.rol === 'alumno' ? d.matricula.trim() : null,
      },
    },
  });
  if (error) {
    msg.className = 'msg-error';
    msg.textContent = error.message;
    return;
  }
  if (d.rol === 'docente') {
    msg.className = 'msg-ok';
    msg.textContent = 'Cuenta creada. Espera a que el administrador apruebe tu acceso.';
    return;
  }
  // Alumno: si tiene sesión inmediata entra; si hay confirmación de correo, avisamos
  if (data.session) {
    location.href = 'alumno.html';
  } else {
    msg.className = 'msg-ok';
    msg.textContent = 'Revisa tu correo para confirmar la cuenta y luego inicia sesión.';
  }
};
