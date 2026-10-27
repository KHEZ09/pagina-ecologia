# EcoTrivia

Base web tipo Quizizz para probar la exposición sobre gamificación ambiental.

## Ejecutar

Requiere Node.js 18 o superior:

```powershell
node server.js
```

Abre <http://localhost:3000>. Para usarlo entre varios dispositivos, ejecuta el servidor en un equipo de la misma red y comparte su IP local en lugar de `localhost`.

Incluye sala con código, QR, unión de participantes, preguntas sincronizadas por polling, bloqueo de avance hasta que todos respondan y descarga de resultados en CSV. Las preguntas de prueba están al inicio de `server.js` y luego se pueden reemplazar por las definitivas.

## Publicar en Render

1. Crea un repositorio en GitHub y sube los archivos de este proyecto.
2. En Render elige **New > Web Service** y conecta ese repositorio.
3. Usa `npm install` como comando de construcción y `npm start` como comando de inicio.
4. Render te entregará una URL pública `onrender.com`.
5. En **Settings > Custom Domains** puedes conectar un dominio comprado por ti.

La aplicación guarda las salas en memoria, por lo que el servicio debe ejecutarse con una sola instancia mientras se usa en la exposición.
