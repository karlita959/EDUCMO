# App de Control Escolar

Esta carpeta (`docs/`) es la página que publica GitHub Pages. Se conecta directamente a Supabase.

## Antes de usarla
1. Ejecuta `../supabase/schema.sql` en el SQL Editor de Supabase.
2. Pega tu **Project URL** y tu **anon public key** en `js/config.js`.
3. Crea el administrador (ver `../supabase/README.md`, paso 4).
4. Para pruebas, desactiva *Confirm email* en Authentication > Providers > Email.

## Probarla en tu computadora
Los módulos de JavaScript no funcionan abriendo el archivo con doble clic. Usa un servidor local:

```bash
cd docs
python -m http.server 8080
```
Luego abre http://localhost:8080

## Páginas
- `index.html`: inicio de sesión y registro (docente o alumno).
- `admin.html`: aprobar docentes, ver usuarios y dar de alta alumnos.
- `docente.html`: crear materias, grupos, alumnos, inscripciones, tareas, calificaciones, importación de alumnos desde Excel y minuta en Excel.
- `alumno.html`: ver solo sus grupos y sus tareas.

## Importar alumnos desde Excel
El archivo necesita encabezados Matrícula y Nombre (Carrera y Correo son opcionales; no importa si tienen acentos o mayúsculas). Los alumnos que ya existen en el catálogo se omiten y no se duplican. Si eliges un grupo, todos quedan inscritos en él.

## Minuta
Elige un grupo en la sección 6 y descarga la minuta: una hoja con matrícula, nombre, calificación de cada tarea y promedio. Cada descarga queda registrada; el administrador puede consultar el historial.

## Administración
El administrador puede aprobar o revocar docentes, dar de alta, editar y dar de baja alumnos del catálogo, y revisar las últimas minutas descargadas.

## Notas
- Un alumno ve grupos y tareas solo si el docente lo inscribió en un grupo. La matrícula con la que se registra debe existir en el catálogo para que su cuenta se vincule.
