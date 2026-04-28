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
    const varTxt = variable === "HR" ? "HUMEDAD RELATIVA (%HR)" : "TEMPERATURA (°C)";
    return `Eres un asistente de validación farmacéutica analizando una bitácora de TEMPERATURA y HUMEDAD RELATIVA de DIAFRA S.A. de C.V. (formato FOR-MAN-06-01).
La bitácora tiene columnas Lunes a Domingo con 3 sub-columnas por día: Mañana, Media Tarde, Tarde.
Hay una cuadrícula gráfica que el operador usa para marcar visualmente el valor — NO la uses.
Extrae ÚNICAMENTE los valores numéricos de ${varTxt} escritos en las filas de texto al pie de la tabla, junto con Hora de lectura y Nombre/iniciales de quien registra.
Lee también instrumento, área, mes y año del encabezado.

Responde SOLO en JSON sin texto adicional, sin markdown, con esta forma exacta:
{"mes":"","anio":"","instrumento":"","area":"","variable":"${variable === "HR" ? "HR" : "T"}","lecturas":[{"dia":"Lunes","turno":"Mañana","valor":null,"hora":null,"quien":null}],"observaciones":""}

Incluye las 21 combinaciones (7 días × 3 turnos: Lunes/Martes/Miércoles/Jueves/Viernes/Sábado/Domingo × Mañana/Media tarde/Tarde).
Si una celda está vacía o ilegible escribe valor:null. Los demás campos en null si no son legibles.`;
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
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY no configurada" }), {
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

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: body.mediaType ?? "image/jpeg", data: body.imageBase64 } },
            { type: "text", text: prompt + ctx },
          ],
        }],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error("Anthropic error:", anthropicResp.status, errText);
      return new Response(JSON.stringify({ error: `Anthropic API error ${anthropicResp.status}`, detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicResp.json();
    const textOut: string = data?.content?.[0]?.text ?? "";

    let parsed: unknown = null;
    let parseError: string | null = null;
    try {
      const cleaned = textOut.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }

    return new Response(JSON.stringify({ raw: textOut, parsed, parseError, usage: data?.usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-bitacora error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
