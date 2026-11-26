# spaceapps-analyzer — Guía en español

`spaceapps-analyzer` es un CLI orientado a evidencia para auditar una sede pública del [NASA Space Apps Challenge](https://www.spaceappschallenge.org/).

Descubre los equipos, captura las páginas relevantes como PNG/HTML/texto, verifica los enlaces en un contexto limpio de navegador, clona repositorios públicos de GitHub/GitLab, descarga presentaciones públicas, extrae subtítulos de YouTube y genera reportes separados en inglés y español.

Para cada equipo verifica la presencia documentada de los cinco criterios oficiales —Impacto, Creatividad, Validez, Relevancia y Presentación— usando la entrega de NASA y el contenido local extraído. Los resultados son `presente`, `parcial`, `no encontrado` o `sin evidencia suficiente`: no son notas ni puntajes de evaluación. Cada estado incluye fragmentos y fuentes para revisión humana.

La herramienta nunca inicia sesión, envía formularios, evade controles de acceso ni ejecuta el código de los participantes. Los hallazgos automatizados ayudan a una revisión humana; no son decisiones automáticas de evaluación o descalificación.

## Requisitos

- Node.js 22 o superior
- pnpm 10 o superior
- Chromium para Playwright
- Opcional: [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) como segundo intento para obtener pistas públicas de subtítulos de YouTube
- Opcional: `pdftotext` (Poppler) para extraer texto de presentaciones PDF; el archivo igualmente se conserva si no está instalado

## Instalación

```bash
git clone https://github.com/fundacion-hiperactiva/spaceapps-analyzer.git
cd spaceapps-analyzer
pnpm install
pnpm exec playwright install chromium
pnpm build
```

Durante el desarrollo se puede ejecutar el CLI mediante `pnpm dev --`. Para enlazar globalmente el checkout actual:

```bash
pnpm link --global
spaceapps-analyzer --help
```

Si `yt-dlp` no está en `PATH`, se puede indicar su ruta:

```bash
export SPACEAPPS_YT_DLP=/ruta/absoluta/a/yt-dlp
```

El analizador descarga únicamente pistas de subtítulos; no conserva los videos completos de los participantes.

## Auditoría básica de Córdoba

La URL de la sede debe tener esta forma pública:

```text
https://www.spaceappschallenge.org/<año>/local-events/<slug-de-la-sede>/
```

```bash
pnpm dev -- audit \
  'https://www.spaceappschallenge.org/2026/local-events/cordoba/?tab=teams' \
  --output audit-output/cordoba-2026
```

Ejecución corta de prueba:

```bash
pnpm dev -- audit \
  'https://www.spaceappschallenge.org/2026/local-events/cordoba/?tab=teams' \
  --output audit-output/smoke \
  --max-teams 1 \
  --no-pdf
```

## Agregar contexto de la organización

Hay dos opciones para sumar fuentes públicas de la organización:

- `--roster-url <url>` captura e interpreta un padrón público compatible. Concilia equipos registrados, finalizados, retirados y ausentes. Cuando el padrón informa esos estados, sólo los equipos finalizados reciben puntaje.
- `--supplemental-source <url>` conserva una fuente pública adicional dentro de la auditoría y los reportes. Se puede repetir. Registrar la URL **no** significa que el CLI haya interpretado o validado automáticamente todas las afirmaciones del documento.

Ejemplo completo de Córdoba:

```bash
pnpm dev -- audit \
  'https://www.spaceappschallenge.org/2026/local-events/cordoba/?tab=teams' \
  --roster-url 'https://spaceappscordoba.hiperactiva.org/es/equipos' \
  --supplemental-source 'https://docs.google.com/document/d/10GJDajTPH1PiBhyIrK784eJwPcbD7VqcopMhYLjjOsY/edit?usp=sharing' \
  --output audit-output/cordoba-2026
```

Esas fuentes de la organización eran públicas cuando se preparó la auditoría de Córdoba. La disponibilidad pública puede cambiar. No se deben proporcionar documentos privados, credenciales, URLs de sesión ni fuentes que no estén autorizadas para revisión.

## Uso desde Codex

Codex puede ejecutar el CLI, revisar la evidencia y utilizar otras URLs públicas como contexto. Un pedido útil sería:

```text
Ejecutá spaceapps-analyzer para esta sede:
https://www.spaceappschallenge.org/2026/local-events/cordoba/?tab=teams

Usá este padrón público de la organización para identificar equipos finalizados y retirados:
https://spaceappscordoba.hiperactiva.org/es/equipos

Conservá este Google Doc público como fuente complementaria:
https://docs.google.com/document/d/10GJDajTPH1PiBhyIrK784eJwPcbD7VqcopMhYLjjOsY/edit?usp=sharing

Generá reportes HTML y PDF separados en inglés y español. Revisá manualmente
los resultados unknown, rate-limited y anti-bot antes de tratarlos como hallazgos.
```

Al trabajar con Codex:

1. Indicar cuál URL corresponde a la sede NASA, al padrón de la organización o al contexto complementario.
2. Confirmar que todas las fuentes sean públicas y estén dentro del alcance autorizado.
3. Pedir que se distinga la evidencia capturada por el CLI del contexto revisado separadamente por Codex.
4. No incluir secretos, enlaces privados de Drive, cookies ni tokens de acceso en prompts o tickets.
5. Revisar manualmente los estados `warn` y `unknown`, en especial barreras anti-bot, límites de tasa y videos sin subtítulos públicos.

## Opciones de auditoría

```text
--output <directorio>     Directorio de artefactos (predeterminado: audit-output)
--concurrency <n>         Equipos procesados en paralelo (predeterminado: 3)
--timeout <ms>            Tiempo máximo de navegación (predeterminado: 30000)
--max-teams <n>           Limitar la cantidad de equipos
--roster-url <url>        Padrón público con estados de los equipos
--supplemental-source     Fuente pública adicional; se puede repetir
--no-external-checks      Omitir verificaciones de enlaces públicos
--no-content-extraction   Omitir repositorios, presentaciones y subtítulos de video
--no-pdf                  Omitir la generación de PDF
--headed                  Mostrar Chromium durante la captura
--fail-on never|fail|warn Política de salida para CI (predeterminado: never)
```

`pnpm dev -- audit --help` muestra la lista vigente y autoritativa.

## Salida

```text
audit-output/<sede>/
├── audit.json                 # resultado completo para procesamiento
├── report.en.{md,html,pdf}    # reportes en inglés
├── report.es.{md,html,pdf}    # reportes en español
├── event/                     # capturas de sede y padrón
└── teams/
    └── <slug-del-equipo>/
        ├── about.{png,html,txt}
        ├── project.{png,html,txt}
        ├── members.{png,html,txt}
        ├── challenge.{png,html,txt}
        ├── content/           # texto de repositorios y subtítulos
        └── external/          # evidencia de acceso en contexto limpio
```

Las rutas de `audit.json` son relativas al directorio de salida, por lo que todo el árbol puede archivarse como una unidad. `audit-output/` está excluido de Git porque las capturas pueden ser grandes y representan un momento específico.

## Qué se verifica

Para cada equipo auditado, el CLI comprueba:

1. Que exista una entrega de proyecto.
2. Que el resumen y los detalles tengan contenido sustantivo.
3. Que se documenten enlaces de demostración y proyecto/prototipo.
4. Que se documenten datos o recursos de NASA.
5. Que la evidencia externa cargue públicamente sin una barrera evidente de autenticación o aprobación.
6. Que se pueda resolver el desafío seleccionado.
7. Que se pueda obtener texto del repositorio público sin ejecutar código.
8. Que se puedan obtener subtítulos públicos de YouTube cuando el proveedor los expone.
9. Que la entrega, el repositorio y las transcripciones cubran conceptos del desafío.
10. Que los campos sustantivos de la página cumplan el requisito oficial de presentación en inglés.

Estados:

- `pass`: la comprobación automatizada fue satisfactoria.
- `warn`: la evidencia es parcial o ambigua; se recomienda revisión manual.
- `fail`: falta un requisito objetivo o el recurso es inaccesible.
- `unknown`: no hubo suficiente evidencia pública.

La cobertura combina conceptos normalizados y similitud vectorial. La detección de idioma utiliza marcadores explicables de inglés y español. Ningún mecanismo puede determinar calidad científica, originalidad, exactitud factual, ética ni si el prototipo resuelve realmente el desafío.

## Regenerar reportes

Se pueden reconstruir los reportes desde una auditoría existente sin volver a navegar:

```bash
pnpm dev -- report audit-output/cordoba-2026/audit.json
```

## Informar errores y solicitar funcionalidades

Abrir un [Issue de GitHub](https://github.com/fundacion-hiperactiva/spaceapps-analyzer/issues/new/choose) antes de comenzar un cambio importante.

Para un error, incluir:

- un título breve;
- la URL de la sede o equipo afectado;
- la versión o commit del analizador;
- resultado esperado y resultado obtenido;
- comando para reproducirlo;
- estado, motivo o ruta de evidencia relevante;
- si el comportamiento cambia en un navegador normal;
- capturas o logs sin secretos ni información privada.

Para una funcionalidad, describir el problema, el comportamiento propuesto, ejemplos de URLs públicas, el impacto esperado en el reporte y criterios de aceptación. Nunca adjuntar material privado de participantes a un ticket público.

## Flujo de contribución GitFlow

Ramas de larga duración:

- `main`: código público listo para una versión.
- `testing`: candidato a versión y validación de integración.
- `develop`: integración activa.

Las ramas de trabajo deben partir de un `develop` actualizado:

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/<issue-id>-descripcion-breve
# o: git switch -c fix/<issue-id>-descripcion-breve
```

Antes de abrir un pull request:

```bash
pnpm check
git diff --check
git push -u origin feature/<issue-id>-descripcion-breve
```

Abrir el pull request hacia `develop` y vincular el Issue. No realizar commits directos en `develop`, `testing` o `main`.

Camino de promoción:

```text
feature/* o fix/* → develop → testing → main
```

- Integrar ramas pequeñas de funcionalidad o corrección en `develop` luego de revisión y CI.
- Promover `develop` a `testing` para validar el candidato, incluyendo auditorías reales representativas cuando corresponda.
- Promover `testing` a `main` sólo cuando la validación sea satisfactoria.
- Usar pull requests para cada promoción, conservando visibles la revisión y el historial de CI.

## Desarrollo y CI

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

GitHub Actions y el espejo privado de GitLab ejecutan comprobación de tipos, pruebas unitarias y compilación de producción. La navegación real no forma parte del CI predeterminado porque la disponibilidad de terceros no debe volver inestable la validación del código.

## Uso responsable

Auditar únicamente URLs públicas autorizadas. Respetar términos, límites de tasa y privacidad de los participantes. Conservar fechas y rutas de evidencia, y revisar manualmente los resultados ambiguos antes de publicarlos. Los reportes nunca deberían usarse como decisiones automáticas de descalificación.

## Licencia

[MIT](LICENSE)
