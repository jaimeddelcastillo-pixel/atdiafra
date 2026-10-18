// Edge function: extrae datos de bitácoras semanales (T/HR, Filtros, Presiones) via Anthropic Vision
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  imageBase64: string;
  mediaType?: string;
  module: "temp_hr" | "filtros" | "presiones" | "agua";
  variable?: "T" | "HR"; // sólo temp_hr
  context?: Record<string, string>;
}

// Regla de caligrafía de dígitos: aplica a todos los módulos (valores numéricos escritos a mano).
const REGLA_DIGITOS = `

🔢 REGLA DE DÍGITOS MANUSCRITOS (trazos y caligrafía):
- Un «8» dibujado como DOS círculos u óvalos apilados verticalmente (uno arriba y otro abajo, SIN cruzarse en el centro) es un «8», NO un «0», NO dos marcas separadas y NO una mancha: los dos óvalos juntos forman UN solo dígito 8. Es muy común que el operador lo trace así.
- Un «8» con trazo continuo cruzado en el centro (forma de «infinito» vertical) también es 8.
- Diferéncialo: un «0» es un solo óvalo cerrado SIN estrangulamiento central; un «6» o «9» tienen un bucle y una cola; un «3» tiene dos arcos abiertos hacia la izquierda.
- Los trazos suelen estar separados (no encimados) pero muy juntos: si ves dos óvalos redondos apilados que tocan o casi tocan, léelos como 8.
- Ante un dígito dudoso entre 8 y 0, usa el contexto (rangos típicos de la variable) y baja la confianza, pero NO dejes el valor en null si el trazo es claramente visible.

`;

function buildPrompt(module: string, variable?: string): string {
  if (module === "temp_hr") {
    return `Eres un asistente de validación farmacéutica analizando una bitácora de TEMPERATURA y HUMEDAD RELATIVA de DIAFRA S.A. de C.V. (formato FOR-MAN-06-01).
La bitácora tiene columnas Lunes a Domingo con 3 sub-columnas por día: Mañana (1°), Media Tarde (2°), Tarde (3°).
Hay DOS cuadrículas gráficas (una para Temperatura °C, otra para Humedad Relativa %) que el operador usa para marcar visualmente — NO las uses para extraer valores.

🔑 REGLA CRÍTICA DE ALINEACIÓN DE COLUMNAS (días festivos / huecos):
- En el encabezado superior de la tabla está escrita la FECHA de cada día trabajado (formato "DD-mmm-AA", ej. "07-ene-25", "08-ene-25"). Esa fecha es la VERDAD: úsala para asignar el día de la semana correcto a cada columna.
- Si un día de la semana NO tiene fecha escrita en el encabezado y NO tiene valores debajo (ej. lunes festivo en blanco), ese día va con valor:null y confianza:0 — NO desplaces los valores del martes hacia el lunes ni recorras columnas.
- Cada columna física que veas en la imagen pertenece al día indicado por su fecha de encabezado. Cuenta físicamente las columnas con datos y respeta los huecos.
- Si ves 4 fechas escritas (ej. 07,08,09,10-ene), entonces sólo 4 días de esa semana tienen lecturas; los otros 3 quedan en null.

🗓️ AÑO DE LA HOJA: el recuadro "Año" del encabezado (ej. "Año: 2026") y el sufijo de las fechas ("16-mar-26") son la VERDAD del año: devuelve ese año en "anio" (4 dígitos) y usa ESE año en todas las fechas_columnas.
📅 MES DE LA HOJA: el recuadro "Mes" del encabezado (ej. "Mes: Mayo") es la VERDAD del mes: devuélvelo en "mes" tal cual y usa ESE mes en las fechas_columnas (solo puede pasar al mes contiguo si la semana cruza de un mes a otro).
📅 REGLA DE AÑO PLAUSIBLE (escritura a mano):
- El año NUNCA es 2024 o anterior: sólo 2025 en adelante (máximo 1 año adelante del actual). Si lees 2023 es un 5 mal leído: escribe 2025.
- Si lees un año fuera de ese rango (ej. 2016, 2075, 2002), casi seguro es un dígito manuscrito mal leído: corrígelo al año plausible más cercano cambiando UN solo dígito (2016→2026, 2075→2025, 2002→2025 si el contexto lo indica).
- Todas las fechas de una misma hoja pertenecen a la MISMA semana: si una fecha cae en otro año o a meses de distancia de las demás, corrígela para que sea consecutiva con el resto.

📆 SÁBADO Y DOMINGO TRABAJADOS: en validación de procesos y otros casos la semana NO se interrumpe y sí hay lecturas en sábado y domingo. Lee las 7 columnas por igual: si sábado o domingo tienen fecha o valores escritos, extráelos (no los dejes en null ni los pases a otro día). NUNCA cambies el año o el día de una fecha para que caiga entre semana: el día de la columna (Lunes…Domingo) debe coincidir con la fecha real del calendario.

Debes extraer AMBAS variables al mismo tiempo:
  • TEMPERATURA (°C): valores en la fila de texto "TEMPERATURA °C" al pie de la primera cuadrícula (típicamente 16-27 °C).
  • HUMEDAD RELATIVA (%): valores en la fila de texto "HUMEDAD RELATIVA" al pie de la segunda cuadrícula (típicamente 30-65 %).
Lee también: HORA DE LECTURA, ANTEFIRMA DE QUIEN REGISTRA, código de instrumento, área, mes, año y observaciones.

Responde SOLO en JSON sin texto adicional, sin markdown, con esta forma exacta:
{"mes":"","anio":"","instrumento":"","area":"","fechas_columnas":[{"dia":"Lunes","fecha":"YYYY-MM-DD"}],"lecturas_t":[{"dia":"Lunes","turno":"Mañana","valor":null,"hora":null,"quien":null,"confianza":1}],"lecturas_hr":[{"dia":"Lunes","turno":"Mañana","valor":null,"hora":null,"quien":null,"confianza":1}],"observaciones":""}

En "fechas_columnas" lista SOLO los días que aparecen con fecha escrita en el encabezado de la tabla (puede ser menos de 7 si hubo festivos).
Incluye las 21 combinaciones por cada variable (7 días × 3 turnos: Lunes/Martes/Miércoles/Jueves/Viernes/Sábado/Domingo × Mañana/Media tarde/Tarde).
La hora y quien registra es la MISMA para T y HR del mismo turno (cópiala en ambos arreglos).
Si una celda está vacía, tachada, marcada N/A o ilegible escribe valor:null y confianza:0.
El campo "confianza" es un número 0–1 que refleja qué tan seguro estás de la lectura del dígito (1 = muy claro, 0.5 = dudoso, 0 = no leíble). NO inventes valores: si no estás seguro, baja la confianza.` + REGLA_DIGITOS;
  }
  if (module === "presiones") {
    return `Eres un asistente de validación farmacéutica analizando una bitácora de PRESIONES DIFERENCIALES de DIAFRA S.A. de C.V. (formato FOR-MAN-07-01).
Columnas Lunes a Domingo, 3 sub-columnas: Mañana, Media Tarde, Tarde. Hay una cuadrícula gráfica con escala en Pa o inH₂O — NO la uses para extraer valores.
Extrae los valores numéricos de las filas de texto Presión escritas al pie de cada columna. Lee también código de instrumento, área, mes y año del encabezado.

En el encabezado de cada día suele estar escrita la FECHA (ej. "03-feb-25"): devuélvela en "fechas_columnas" en formato YYYY-MM-DD, sólo para los días que tengan fecha escrita.

📅 REGLA DE AÑO PLAUSIBLE (escritura a mano): el año NUNCA es 2024 o anterior: sólo 2025 en adelante (máximo 1 año adelante del actual). Si lees 2023 es un 5 mal leído: escribe 2025. Si lees otro año fuera de rango (ej. 2016, 2075), corrígelo cambiando UN solo dígito (2016→2026, 2075→2025). Todas las fechas de la hoja son de la MISMA semana: si una cae en otro año o a meses de distancia, corrígela para que sea consecutiva con las demás.
🗓️ AÑO DE LA HOJA: el recuadro "Año" del encabezado (ej. "Año: 2026") y el sufijo de las fechas ("16-mar-26") son la VERDAD del año: devuelve ese año en "anio" (4 dígitos) y usa ESE año en todas las fechas_columnas, aunque el día de la semana parezca no coincidir.
📅 MES DE LA HOJA: el recuadro "Mes" del encabezado (ej. "Mes: Mayo") es la VERDAD del mes: devuélvelo en "mes" tal cual y usa ESE mes en las fechas_columnas (solo puede pasar al mes contiguo si la semana cruza de un mes a otro).
📆 SÁBADO Y DOMINGO TRABAJADOS: en validación de procesos y otros casos la semana NO se interrumpe y sí hay lecturas en sábado y domingo. Lee las 7 columnas por igual: si sábado o domingo tienen fecha o valores escritos, extráelos (no los dejes en null ni los pases a otro día). NUNCA cambies el año o el día de una fecha para que caiga entre semana: el día de la columna (Lunes…Domingo) debe coincidir con la fecha real del calendario.
Responde SOLO en JSON, 21 combinaciones, vacíos como null:
{"mes":"","anio":"","instrumento":"","area":"","unidad":"Pa","fechas_columnas":[{"dia":"Lunes","fecha":"YYYY-MM-DD"}],"lecturas":[{"dia":"Lunes","turno":"Mañana","valor":null,"hora":null,"quien":null,"confianza":1}],"observaciones":""}` + REGLA_DIGITOS;
  }
  if (module === "filtros") {
    return `Eres un asistente de validación farmacéutica analizando una bitácora de PRESIÓN DE BANCO DE FILTROS de DIAFRA S.A. de C.V. Registra presión diferencial en inH₂O.
Estructura: columnas Lunes a Domingo, 3 turnos por día, cuadrícula gráfica (ignórala), filas de texto al pie con el valor numérico escrito.

Responde SOLO en JSON, 21 combinaciones, vacíos como null:
{"mes":"","anio":"","instrumento":"","area":"","unidad":"inH2O","lecturas":[{"dia":"Lunes","turno":"Mañana","valor":null,"hora":null,"quien":null}],"observaciones":""}` + REGLA_DIGITOS;
  }
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY no configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body.imageBase64 || !body.module) {
      return new Response(JSON.stringify({ error: "Faltan campos: imageBase64 y module son requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = buildPrompt(body.module, body.variable);
    const ctx = body.context ? `\nContexto adicional: ${JSON.stringify(body.context)}.` : "";
    const mediaType = body.mediaType ?? "image/jpeg";
    const dataUrl = `data:${mediaType};base64,${body.imageBase64}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        // Razonamiento no se puede apagar del todo en este modelo; 'minimal' es el mínimo aceptado.
        reasoning_effort: "minimal",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt + ctx },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI Gateway error:", aiResp.status, errText);
      const msg = aiResp.status === 429
        ? "Límite de uso alcanzado. Intenta más tarde."
        : aiResp.status === 402
        ? "Sin créditos en Lovable AI. Agrega fondos en Settings → Workspace → Usage."
        : `AI Gateway error ${aiResp.status}`;
      return new Response(JSON.stringify({ error: msg, detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const textOut: string = data?.choices?.[0]?.message?.content ?? "";

    // ===== MEJORA 1: log de tokens y costo estimado =====
    // El AI Gateway de Lovable devuelve usage en formato OpenAI:
    // { prompt_tokens, completion_tokens, total_tokens }
    // Pricing usado para estimación: tarifas de Gemini 2.5 Flash (el modelo ahora es 3.8 Flash;
    // la fórmula se conserva igual para no alterar el registro de costos).
    const usage = data?.usage ?? null;
    const tokens_input: number = usage?.prompt_tokens ?? 0;
    const tokens_output: number = usage?.completion_tokens ?? 0;
    const costo_estimado_usd =
      (tokens_input * 0.0000003) + (tokens_output * 0.0000025);

    console.log("tokens_usados:", JSON.stringify(usage));
    console.log("costo_estimado_usd:", costo_estimado_usd.toFixed(6));

    let parsed: unknown = null;
    let parseError: string | null = null;
    try {
      const cleaned = textOut.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }

    // ===== MEJORA 3: marcar si la extracción requiere revisión manual =====
    // Heurística: si hay muchos valores null o el modelo expuso "confianza" baja.
    let requiere_revision = false;
    const campos_dudosos: string[] = [];
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      const arrays = ["lecturas_t", "lecturas_hr", "lecturas"] as const;
      for (const key of arrays) {
        const arr = p[key];
        if (!Array.isArray(arr)) continue;
        arr.forEach((row: Record<string, unknown>, idx: number) => {
          const valor = row?.valor;
          const conf = typeof row?.confianza === "number" ? (row.confianza as number) : null;
          if (valor === null || valor === undefined || valor === "") {
            campos_dudosos.push(`${key}[${idx}]`);
          } else if (conf !== null && conf < 0.7) {
            campos_dudosos.push(`${key}[${idx}]`);
          }
        });
      }
      // Si más del 15% de las celdas están vacías/dudosas, marcar revisión
      const total = arrays.reduce((acc, k) => acc + (Array.isArray(p[k]) ? (p[k] as unknown[]).length : 0), 0);
      if (total > 0 && campos_dudosos.length / total > 0.15) {
        requiere_revision = true;
      }
    }

    return new Response(
      JSON.stringify({
        raw: textOut,
        parsed,
        parseError,
        usage,
        uso: {
          tokens_input,
          tokens_output,
          tokens_total: usage?.total_tokens ?? (tokens_input + tokens_output),
          costo_estimado_usd: Number(costo_estimado_usd.toFixed(6)),
          modelo: "google/gemini-3.8-flash",
        },
        requiere_revision,
        campos_dudosos,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("extract-bitacora error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
