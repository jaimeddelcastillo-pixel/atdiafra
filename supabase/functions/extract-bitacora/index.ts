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

function buildPrompt(module: string, variable?: string): string {
  if (module === "temp_hr") {
    return `Eres un asistente de validación farmacéutica analizando una bitácora de TEMPERATURA y HUMEDAD RELATIVA de DIAFRA S.A. de C.V. (formato FOR-MAN-06-01).
La bitácora tiene columnas Lunes a Domingo con 3 sub-columnas por día: Mañana (1°), Media Tarde (2°), Tarde (3°).
Hay DOS cuadrículas gráficas (una para Temperatura °C, otra para Humedad Relativa %) que el operador usa para marcar visualmente — NO las uses para extraer valores.
Debes extraer AMBAS variables al mismo tiempo:
  • TEMPERATURA (°C): valores en la fila de texto "TEMPERATURA °C" al pie de la primera cuadrícula (típicamente 16-27 °C).
  • HUMEDAD RELATIVA (%): valores en la fila de texto "HUMEDAD RELATIVA" al pie de la segunda cuadrícula (típicamente 30-65 %).
Lee también: HORA DE LECTURA, ANTEFIRMA DE QUIEN REGISTRA, código de instrumento, área, mes, año y observaciones.

Responde SOLO en JSON sin texto adicional, sin markdown, con esta forma exacta:
{"mes":"","anio":"","instrumento":"","area":"","lecturas_t":[{"dia":"Lunes","turno":"Mañana","valor":null,"hora":null,"quien":null}],"lecturas_hr":[{"dia":"Lunes","turno":"Mañana","valor":null,"hora":null,"quien":null}],"observaciones":""}

Incluye las 21 combinaciones por cada variable (7 días × 3 turnos: Lunes/Martes/Miércoles/Jueves/Viernes/Sábado/Domingo × Mañana/Media tarde/Tarde).
La hora y quien registra es la MISMA para T y HR del mismo turno (cópiala en ambos arreglos).
Si una celda está vacía, tachada, marcada N/A o ilegible escribe valor:null.`;
  }
  if (module === "presiones") {
    return `Eres un asistente de validación farmacéutica analizando una bitácora de PRESIONES DIFERENCIALES de DIAFRA S.A. de C.V. (formato FOR-MAN-07-01).
Columnas Lunes a Domingo, 3 sub-columnas: Mañana, Media Tarde, Tarde. Hay una cuadrícula gráfica con escala en Pa o inH₂O — NO la uses para extraer valores.
Extrae los valores numéricos de las filas de texto Presión escritas al pie de cada columna. Lee también código de instrumento, área, mes y año del encabezado.

Responde SOLO en JSON, 21 combinaciones, vacíos como null:
{"mes":"","anio":"","instrumento":"","area":"","unidad":"Pa","lecturas":[{"dia":"Lunes","turno":"Mañana","valor":null,"hora":null,"quien":null}],"observaciones":""}`;
  }
  if (module === "filtros") {
    return `Eres un asistente de validación farmacéutica analizando una bitácora de PRESIÓN DE BANCO DE FILTROS de DIAFRA S.A. de C.V. Registra presión diferencial en inH₂O.
Estructura: columnas Lunes a Domingo, 3 turnos por día, cuadrícula gráfica (ignórala), filas de texto al pie con el valor numérico escrito.

Responde SOLO en JSON, 21 combinaciones, vacíos como null:
{"mes":"","anio":"","instrumento":"","area":"","unidad":"inH2O","lecturas":[{"dia":"Lunes","turno":"Mañana","valor":null,"hora":null,"quien":null}],"observaciones":""}`;
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
        model: "google/gemini-2.5-flash",
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
    // Pricing Gemini 2.5 Flash (text/image input): $0.30/M input · $2.50/M output
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
          modelo: "google/gemini-2.5-flash",
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
