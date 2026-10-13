<p align="center"><img src="src/icon.svg" width="96" alt="Logo de Mapache"></p>

<h1 align="center">Mapache</h1>

<p align="center"><b>El mapache que ordena tus ideas.</b><br>
Mapas mentales y pizarra infinita de código abierto que funcionan en tu navegador. Sin cuentas, sin nube, sin rastreo.</p>

<p align="center"><a href="README.md">Read in English</a></p>

![Mapache: un mapa mental, un diagrama de flujo, una tabla y un gráfico en el mismo tablero](docs/screenshot.png)

## Por qué Mapache

- **Mapas mentales rápidos.** Puntos de añadir rápido, ramas de colores, plegar con contador, arrastrar
  ramas viendo en vivo dónde caen y un atajo de teclado para todo.
- **Una pizarra entera alrededor.** Notas, texto, stickers, imágenes, 12 formas, secciones, conectores y
  dibujo a mano.
- **También datos.** Pega una tabla de Excel, Google Sheets, Notion o Markdown (o arrastra un CSV) y
  conviértela en cualquiera de los 17 tipos de gráfico, enlazados a la tabla.
- **Tuyo.** Los mapas viven en tu navegador (IndexedDB) y funcionan sin conexión una vez instalado. Exporta
  una copia cuando quieras. AGPL-3.0, sin telemetría.

## Empezar

Solo necesitas [Node.js](https://nodejs.org) 18 o posterior. No hay dependencias que instalar.

```bash
git clone https://github.com/Hackeatutiempo/mapache.git
cd mapache
npm start
```

Abre <http://localhost:4321>. En Windows también puedes hacer doble clic en `Abrir Mapache.cmd`.

**Recomendado:** en Chrome o Edge, *Instalar aplicación* desde la barra de direcciones. Mapache tendrá su
propia ventana e icono y funcionará aunque el servidor no esté en marcha.

Tus mapas se guardan en ese navegador y en esa dirección. Usa de vez en cuando **Exportar copia de
seguridad** (abajo a la izquierda), sobre todo antes de borrar los datos del navegador.

## Guía de uso

### Mapas mentales

- Selecciona un nodo y pulsa los **puntos morados**: el de fuera crea un hijo, el de abajo un hermano.
- **Tab** hijo · **Enter** editar (y al escribir, Enter crea hermano) · **Alt+Enter** padre ·
  **Ctrl+Enter** hermano encima · **Alt+flechas** añadir en esa dirección
- **Ctrl+/** plegar · **Ctrl+D** duplicar · **Supr** borrar · **Ctrl+Alt+[ / ]** subir/bajar nivel
- Al empezar a escribir: `* ` viñetas, `1. ` numerada, `_ ` checklist, `# ` título
- Arrastra un nodo: el mapa enseña en vivo dónde caerá. Más allá del borde de un nodo = hijo suyo.
- Pega un esquema con sangrías (Ctrl+V) y se convierte en ramas.
- **Arrastrar la raíz** mueve el mapa entero; para desplazar la vista, usa la rueda o Espacio + arrastrar.

### Seleccionar varios

Arrastra sobre el fondo: el recuadro selecciona todo lo que toca (objetos, conectores, trazos y el mapa mental;
las secciones, solo si quedan dentro del todo). **Shift+clic** añade o quita, **Ctrl+A** selecciona todo. Con varios
elegidos: arrástralos juntos, flechas para moverlos, **Supr** borrar, **Ctrl+D** duplicar, **Ctrl+C / V** copiar y
pegar, y las **esquinas del marco** para escalarlos. En su barra: filtrar por tipo, **organizar** (en cuadrícula, como
árbol o como mapa mental siguiendo las flechas), alinear, repartir, bloquear y meter en sección.

### Menú del clic derecho

Sobre cualquier objeto, conector, nodo, selección o el propio lienzo: copiar, cortar, duplicar, borrar, copiar y
pegar estilo (**Ctrl+Alt+C / V**), guardar como estilo por defecto, organizar, alinear, bloquear, meter en sección,
ajustar a la cuadrícula y **copiar enlace a esta posición** (abre ese mapa centrado en ese punto). En el lienzo vacío,
pegar y añadir notas, formas, texto, stickers, tablas o secciones justo ahí.

**Bloquear (Shift+L):** el objeto no se mueve, no se edita, no se borra y no entra en el recuadro. Clic en él
para desbloquearlo.

### Varios mapas en un tablero

Con el botón **Mapa mental** de la barra (o la tecla **M**) añades otro mapa donde quieras. Cada uno tiene su
disposición (horizontal o vertical), su tipo de línea y su posición; se mueven arrastrando su raíz y puedes pasar
ramas de uno a otro. Supr en la raíz de un mapa añadido lo borra entero.

### Carpetas

Con el **+** de la barra lateral creas mapas o carpetas. Las carpetas se anidan; cada fila tiene un menú **⋯**
(o clic derecho) para renombrar, mover, duplicar o borrar. Arrastra mapas y carpetas para moverlos.
Borrar una carpeta no borra sus mapas: pasan a la carpeta de arriba. Con **Personalizar…** (en ⋯ o clic derecho) eliges color e icono
(de línea o emoji) para cada carpeta y cada mapa.

### Objetos del lienzo

La barra vertical de la izquierda añade objetos libres: pulsa la herramienta y luego el lienzo, o arrastra el
botón hasta donde lo quieras.

- **Nota (N):** crece con el texto, Enter es salto de línea, tirador para cambiar el tamaño, color en su
  barra (el último color se recuerda) y puntos o **Alt+flechas** para crear la siguiente nota al lado.
- **Texto (T):** tamaños S, M, L y XL y color. Si lo dejas vacío, desaparece.
- **Sticker (X):** elige un emoji y cambia su tamaño con el tirador.
- **Medio (I): imagen o vídeo.** Desde el botón, arrastrando archivos al lienzo o con Ctrl+V (también capturas de
  pantalla). Las imágenes se guardan dentro del mapa, reducidas a 1600 px; los vídeos, aparte en el navegador (hasta
  500 MB) y van en la copia de seguridad. Pega un enlace de YouTube, Vimeo, Loom o un .mp4 y se inserta su reproductor.
  Selecciona un vídeo para usar sus controles; clic encima para reproducir o pausar.
- **Formas (R):** rectángulo, píldora, óvalo, rombo, paralelogramos, trapecio, triángulo, hexágono, cilindro,
  nube y estrella. Atajos R, U, O, D, A, G, Y, J. Llevan texto dentro (Enter para escribir), se cambian de tipo
  sin perder el estilo, tienen color, estilo (relleno, borde, discontinuo o transparente) y giro de 90°. Cada
  tipo recuerda su último color y estilo.
- **Secciones (.):** áreas con nombre para agrupar. Se cogen por el título o el borde y se llevan todo lo que
  tienen dentro, incluido el mapa si cabe entero. Contorno o relleno, 8 colores. «Meter en sección» (en ⋯)
  crea una alrededor del objeto o del mapa.
- **Tablas (E):** elige el tamaño en la cuadrícula, o «Importar CSV…». También se crean **pegando** (Ctrl+V) una
  tabla de Excel, Google Sheets, Word, Notion, Markdown o CSV, o **arrastrando un .csv** al lienzo. Clic en una
  celda la selecciona y otro clic la edita; Tab y Enter avanzan como en una hoja de cálculo (Enter al final crea
  fila); los **+** de los bordes añaden columna o fila. En su barra: insertar, mover y eliminar filas y columnas,
  ordenar por la columna activa, encabezado, filas alternas, color y exportar CSV (formato Excel en español).
- **Gráficos:** desde la barra de una tabla, «Crear gráfico». Quedan enlazados: cambian al editar la tabla.
  17 tipos: columnas (normales, apiladas, 100 %), barras (normales, apiladas), líneas, área (normal, apilada),
  circular, anillo, dispersión, burbujas, radar, embudo, mapa de calor, cascada y cifra destacada. En su barra:
  tipo, qué columnas usar (etiquetas y series), título y valores. Al pasar el ratón se ven los datos.
- **Conectores (C):** arrastra de un objeto a otro (formas, notas, tablas, gráficos, imágenes o nodos del mapa).
  Salen y entran siempre por el lado en que los creaste; al mover los objetos, el recorrido se adapta rodeándolos
  sin atravesarlos. En una forma
  seleccionada, sus puntos crean otra forma ya conectada (clic) o un conector (arrastrar). En su barra: texto
  (doble clic), color, continua/discontinua/gruesa, 8 tipos de punta en cada extremo, invertir y trazado en codo,
  curvo o recto. Arrastra cualquier tramo de la línea para darle la forma que quieras (si el tramo va pegado a un
  objeto, aparece un codo nuevo), sus extremos para reconectarlos y el texto para deslizarlo. Ctrl+clic en un
  extremo salta al otro.
- **Dibujo a mano (H):** rotulador fino o grueso, subrayador (Shift+H), goma (E) y lazo (S) para elegir trazos
  y cambiarles el color o el grosor. «Detectar formas» convierte líneas, rectángulos, círculos y rombos hechos a
  mano en formas regulares. Esc para salir.
- En **⋯** de cada objeto: traer al frente o enviar detrás del mapa. Flechas para moverlo con precisión.
- **Guías:** al arrastrar, los bordes y el centro se ajustan a los de lo que hay cerca (objetos y nodos) y se ve una
  línea naranja. Mantén **Alt** para moverlo libremente.
- **Formato del texto:** título, lista o checklist se aplican a las líneas seleccionadas; color, resaltado, negrita,
  cursiva y enlace, a lo seleccionado. Las notas, textos y formas también se alinean a la izquierda, centro o derecha.
  Las formas crecen con su texto.
- **Tema:** botón de sol o luna arriba a la derecha (oscuro, claro o según el sistema).

Pulsa **?** dentro de la app para ver todos los atajos.

## Hoja de ruta

- [x] Mapas mentales, objetos de pizarra, tablas y gráficos
- [x] Conectores y dibujo a mano
- [ ] Interfaz en inglés
- [ ] Servidor propio con Docker: cuentas (email y contraseña), proyectos y enlaces de invitación
- [ ] Colaboración en tiempo real (CRDT, sigue funcionando sin conexión)
- [ ] API REST y servidor MCP para que los agentes de IA lean y editen tableros
- [ ] Comentarios y menciones

## Estructura

JavaScript sin compilar ni dependencias. Lo que abre el navegador es exactamente el código que lees.
La tabla de archivos y las decisiones de diseño están en el [README en inglés](README.md#project-structure)
y en [DESIGN.md](DESIGN.md).

```bash
npm test
```

Si Mapache te resulta útil, una ⭐ en GitHub ayuda a que otras personas lo encuentren. La primera vez que lo
arrancas con `npm start` en una terminal te pregunta una sola vez si quieres darla (solo lo hace si dices que sí,
con tu propia sesión del CLI de GitHub).

## Licencia

[GNU AGPL-3.0](LICENSE). Puedes usar, modificar e instalar Mapache en tu servidor libremente. Si ofreces una
versión modificada como servicio a otras personas, debes compartir tus cambios con la misma licencia.
