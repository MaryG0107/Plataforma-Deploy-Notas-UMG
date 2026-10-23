# Plataforma de notas — Sede Central (proyecto estudiantil)

Proyecto estudiantil relacionado con la Universidad Mariano Gálvez de Guatemala.
**No es un sistema oficial de la universidad.** Las cuentas, cursos y notas de ejemplo son **ficticios**.
Usala solo con datos de prueba: manejar calificaciones reales requiere autorización de la universidad
y cuidado con los datos personales.

Es una **plataforma** (no un sitio informativo): todo requiere iniciar sesión y cada rol ve y hace cosas
distintas. La información institucional va en una landing aparte, que puede enlazar a esta plataforma.

## Qué hace

| Rol | Puede |
|---|---|
| **Administrador** | Crear cuentas (una por una o estudiantes en lote), crear cursos, asignar catedrático y estudiantes, definir el punteo de cada curso, desactivar cuentas, restablecer contraseñas y ver la bitácora. |
| **Catedrático** | Ver solo sus cursos, ingresar notas (1er parcial, 2do parcial, actividades, examen final), guardarlas y **publicarlas** o retirar la publicación. |
| **Estudiante** | Ingresar con su carné y ver **solo sus propias notas**, y solo de cursos ya publicados. Puede imprimirlas. |

- Punteo por curso configurable (por defecto 15 / 15 / 35 / 35 = 100, valores de ejemplo).
  Nota mínima de aprobación en `.env` (`NOTA_APROBACION`, por defecto 61). Total y estado
  (Aprobado / Reprobado / En curso) los calcula el servidor.
- Las cuentas nuevas reciben una **contraseña temporal** que se muestra una sola vez y debe cambiarse al ingresar.
- **Bitácora de auditoría**: ingresos (exitosos y fallidos), cambios de notas con valor anterior y nuevo,
  publicación de notas, creación/desactivación de cuentas y cambios de cursos.

Tecnología: Node.js + Express, HTML/CSS/JS sin compilación, SQLite integrado de Node (`node:sqlite`).
No requiere módulos nativos, por lo que se instala en Windows Server Core sin herramientas de compilación.

## Estructura

```
├── server.js                 Arranque de Express, seguridad, sesiones y rutas
├── package.json
├── .env.example              Variables de configuración (copiar a .env)
├── scripts/demo.js           Datos de demostración ficticios (npm run demo)
├── src/
│   ├── config.js             Lectura de .env y valores por defecto
│   ├── db.js                 Esquema SQLite y consultas
│   ├── session-store.js      Sesiones guardadas en SQLite
│   ├── auth.js               Hash scrypt, roles, CSRF, límite de intentos, bitácora
│   ├── validacion.js         Validación de usuarios, cursos y notas
│   ├── rutas-plataforma.js   Ingreso, sesión y panel según rol
│   ├── api-gestion.js        API del administrador: usuarios, cursos, asignaciones, bitácora
│   └── api-notas.js          API de catedráticos y estudiantes
├── vistas/                   inicio (portada), ingresar, cambiar-clave, admin, docente y estudiante (.html)
├── public/                   Recursos servidos en /assets: css, js, img/logo.svg
├── data/                     Base de datos SQLite (se crea sola)
└── deploy/iis/web.config     Proxy inverso para IIS
```

## Accesos

La portada (`/`) muestra dos botones, uno por tipo de usuario, y cada uno lleva a su propio ingreso:

| Botón | Lleva a | Quién puede entrar |
|---|---|---|
| **Ver mis notas** | `ingresar?tipo=estudiante` (pide carné) | Solo estudiantes |
| **Ingresar notas** | `ingresar?tipo=docente` | Solo catedráticos |
| *Acceso administrativo* (enlace al pie) | `ingresar?tipo=admin` | Solo administradores |

El servidor verifica que el rol de la cuenta coincida con el acceso usado; si no coincide, rechaza el
ingreso, indica cuál es el acceso correcto y lo registra en la bitácora. Con sesión iniciada, `/` muestra
directamente el panel del usuario. La API está en `/api/`.

## Flujo de uso

1. El **administrador** ingresa, crea los catedráticos (pestaña *Usuarios*) y carga los estudiantes
   en lote pegando líneas `carné, nombre`. Entrega a cada persona su contraseña temporal.
2. Crea el **curso** (pestaña *Cursos*), le asigna catedrático y punteo, y con *Estudiantes* agrega los carnés.
3. El **catedrático** ingresa, cambia su contraseña, abre el curso, escribe las notas y pulsa *Guardar notas*.
   Mientras no publique, los estudiantes no ven nada.
4. Con *Publicar notas a estudiantes* las notas quedan visibles. Puede retirarlas en cualquier momento.
5. El **estudiante** ingresa con su carné y ve sus notas publicadas.

Para probar rápido: `npm run demo` crea un catedrático, cinco estudiantes y un curso **ficticios**
(DEMO-101) con notas sin publicar, e imprime contraseñas aleatorias una sola vez.

## Qué editar

| Contenido | Dónde |
|---|---|
| Logotipo | `public/img/logo-umg.png` (PNG con fondo transparente, 256 px de ancho). Para cambiarlo, reemplazá el archivo con el mismo nombre. |
| Colores institucionales | Variables al inicio de `public/css/base.css`. |
| Textos de la portada | `vistas/inicio.html`. |
| Textos de cada ingreso (estudiante, catedrático, admin) | `public/js/ingresar.js` (objeto `TIPOS`). |
| Nota mínima de aprobación | `NOTA_APROBACION` en `.env`. |

## Instalación local

Requiere **Node.js 22.13 o superior** (recomendado Node 24 LTS).

```powershell
cd "ruta\del\proyecto"
npm install
Copy-Item .env.example .env
notepad .env     # completá SESSION_SECRET, ADMIN_USER y ADMIN_PASSWORD
npm start
```

Abrí `http://127.0.0.1:3000`. Para probar desde otro equipo de la red, usá `HOST=0.0.0.0` en `.env`.

La cuenta administradora se crea en el primer arranque a partir de `ADMIN_USER` y `ADMIN_PASSWORD`
(mínimo 12 caracteres). Después **borrá `ADMIN_PASSWORD` de `.env`** y cambiá la contraseña desde el panel.
Si la base ya tiene usuarios, esas variables se ignoran.

Si al instalar Node la terminal no reconoce `node` o `npm`, cerrá VS Code por completo o ejecutá:
`$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`

## Despliegue en Windows Server Core con IIS (PowerShell como administrador)

Supuestos: proyecto en `C:\apps\plataforma-notas`, Node escuchando en `127.0.0.1:3000`, sitio IIS en el puerto 80.

**1. IIS, URL Rewrite y ARR**

```powershell
Install-WindowsFeature Web-Server
# Descargá los instaladores desde https://www.iis.net/downloads/microsoft/url-rewrite
# y https://www.iis.net/downloads/microsoft/application-request-routing, luego:
msiexec /i C:\instaladores\rewrite_amd64_en-US.msi /qn
msiexec /i C:\instaladores\requestRouter_amd64.msi /qn

$appcmd = "$env:windir\system32\inetsrv\appcmd.exe"
& $appcmd set config -section:system.webServer/proxy /enabled:"True" /preserveHostHeader:"True" /commit:apphost
& $appcmd set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='HTTP_X_FORWARDED_PROTO']" /commit:apphost
```

**2. Node.js y el proyecto**

```powershell
msiexec /i C:\instaladores\node-v24.x.x-x64.msi /qn    # instalador oficial de nodejs.org
# Abrí una nueva consola para que PATH incluya node y npm.
cd C:\apps\plataforma-notas
npm install --omit=dev
Copy-Item .env.example .env
notepad .env       # SESSION_SECRET, ADMIN_USER, ADMIN_PASSWORD; HOST=127.0.0.1
New-Item -ItemType Directory -Force data, logs | Out-Null
```

**3. Ejecutar Node como tarea al iniciar el servidor** (cuenta de servicio con permisos mínimos)

```powershell
icacls C:\apps\plataforma-notas /grant "NETWORK SERVICE:(OI)(CI)RX"
icacls C:\apps\plataforma-notas\data C:\apps\plataforma-notas\logs /grant "NETWORK SERVICE:(OI)(CI)M"

$node = (Get-Command node).Source
$accion = New-ScheduledTaskAction -Execute "cmd.exe" -WorkingDirectory "C:\apps\plataforma-notas" `
  -Argument "/c `"`"$node`" --disable-warning=ExperimentalWarning server.js >> logs\app.log 2>&1`""
$disparador = New-ScheduledTaskTrigger -AtStartup
$ajustes = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\NETWORK SERVICE" -LogonType ServiceAccount
Register-ScheduledTask -TaskName "PlataformaNotas" -Action $accion -Trigger $disparador -Settings $ajustes -Principal $principal
Start-ScheduledTask -TaskName "PlataformaNotas"
Invoke-WebRequest http://127.0.0.1:3000/ingresar -UseBasicParsing | Select-Object StatusCode
```

**4. Sitio IIS como proxy inverso**

```powershell
Import-Module WebAdministration
New-Item -ItemType Directory -Force C:\inetpub\plataforma-notas | Out-Null
Copy-Item C:\apps\plataforma-notas\deploy\iis\web.config C:\inetpub\plataforma-notas\
Stop-Website -Name "Default Web Site"
New-Website -Name "PlataformaNotas" -Port 80 -PhysicalPath C:\inetpub\plataforma-notas
# Con dominio: New-Website ... -HostHeader "notas.ejemplo.com"
```

La plataforma queda disponible por la IP del servidor o por el dominio, porque todas las rutas son relativas.
El puerto de Node no se expone: solo IIS (puerto 80/443) recibe tráfico externo. La carpeta física del
sitio IIS contiene únicamente `web.config`, así que IIS nunca puede servir `.env` ni la base de datos.

**HTTPS (recomendado):** agregá un enlace 443 con certificado en IIS y poné `COOKIE_SECURE=true` en `.env`;
luego reiniciá la tarea (`Stop-ScheduledTask PlataformaNotas; Start-ScheduledTask PlataformaNotas`).
Con `COOKIE_SECURE=true` el inicio de sesión solo funciona por HTTPS.

**Actualizar:** copiá los archivos nuevos (sin tocar `data/` ni `.env`), ejecutá
`npm install --omit=dev` y reiniciá la tarea. La base se actualiza sola al arrancar.

**Respaldo:** detené la tarea y copiá la carpeta `data\`.

## Seguridad incluida

- Contraseñas con hash `scrypt` y sal aleatoria; sin contraseñas en el código.
- Sesión en cookie `HttpOnly`, `SameSite=Strict`, `Secure` opcional, regenerada al iniciar sesión, guardada en SQLite.
- Token CSRF en todas las operaciones; bloqueo de 15 minutos tras 5 intentos fallidos de ingreso.
- Control de acceso por rol en el servidor: cada catedrático solo accede a sus cursos y cada estudiante
  solo a sus notas publicadas (el servidor nunca envía notas sin publicar ni de otros estudiantes).
- Toda la API exige sesión; las páginas y respuestas no se guardan en caché (`Cache-Control: no-store`).
- Contraseñas temporales obligatorias de cambiar; cuentas desactivadas pierden el acceso de inmediato.
- Bitácora de auditoría de ingresos, cambios de notas (valor anterior → nuevo) y administración.
- Validación en el navegador y en el servidor; contenido mostrado como texto (sin HTML) para evitar XSS.
- Cabeceras de seguridad con Helmet (CSP estricta, sin scripts en línea).
