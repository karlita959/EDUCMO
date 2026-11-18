# Control Escolar: configuración de Supabase

## 1. Crear el proyecto (gratis)
1. Entra a https://supabase.com y crea una cuenta.
2. Crea un proyecto nuevo (guarda la contraseña de la base de datos).
3. Ve a **SQL Editor > New query**, pega todo el contenido de `schema.sql` y dale **Run**.

## 2. Conectar el frontend
1. Ve a **Project Settings > API**.
2. Copia **Project URL** y **anon public** en `config.js`.
3. Nunca pongas la clave `service_role` en el frontend ni en GitHub.

## 3. Activar el registro sin confirmación por correo (para pruebas)
**Authentication > Providers > Email**: desactiva *Confirm email* mientras pruebas.
Cuando publiques, actívalo de nuevo.

## 4. Crear al administrador
1. Regístrate en la app con tu correo (o en **Authentication > Users > Add user**).
2. En **SQL Editor** ejecuta, con tu correo:

```sql
update public.perfiles
  set rol = 'admin', aprobado = true
where id = (select id from auth.users where email = 'tu@correo.com');
```

## 5. Flujo de uso
- **Docente:** se registra, espera aprobación del admin y luego crea materias, grupos, inscribe alumnos y asigna tareas.
- **Alumno:** se registra con su **matrícula**. Si el admin ya lo dio de alta, su cuenta se vincula sola. Solo ve sus grupos y tareas.
- **Admin:** aprueba docentes y administra el sistema.

## 6. Notas de seguridad
- Las reglas RLS están en la base de datos, así que aunque alguien modifique el JavaScript no puede ver datos ajenos.
- Los docentes pueden **consultar** el catálogo de alumnos (matrícula y nombre) para inscribirlos. No pueden editar ni borrar alumnos que no creó el admin.
- Los docentes no pueden cambiar su propio rol ni aprobarse.

## 7. Configurar las direcciones de tu página en Supabase
Ve a **Authentication > URL Configuration**:
- **Site URL:** `https://TU-USUARIO.github.io/NOMBRE-REPO/`
- **Redirect URLs:** agrega la misma dirección.

Así los correos de confirmación regresan a tu página. Para pruebas locales también puedes agregar `http://localhost:8080`.

## 8. Publicar en GitHub Pages
1. Crea un repositorio público en GitHub y sube la carpeta del proyecto. La página vive en `docs/`, y la clave `anon` sí puede estar en el repositorio.
2. En **Settings > Pages**, elige la rama `main` y la carpeta **`/docs`**.
3. La página quedará en `https://TU-USUARIO.github.io/NOMBRE-REPO/`.
