// Edge function: recibe imagen base64 + tipo de bitácora y devuelve datos extraídos via Anthropic Vision
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  imageBase64: string; // sin el prefijo data:
  mediaType?: string; // image/jpeg | image/png | image/webp
  module: "temp_hr" | "filtros" | "presiones" | "agua";
  context?: {
    sistema?: string;
    uma?: string;
    area?: string;
    iso?: string;
  };
}

const PROMPTS: Record<string, string> = {
  temp_hr: `Eres un asistente de validación farmacéutica. Analiza esta imagen de una bitácora de Temperatura y Humedad Relativa de un área clasificada (NOM-241-SSA1-2025, ISO 14644).

Extrae TODAS las lecturas visibles. Cada lectura tiene: fecha, hora, temperatura (°C), humedad relativa (%), y opcionalmente turno y operador/iniciales.

Devuelve EXCLUSIVAMENTE un JSON válido con esta forma exacta (sin markdown, sin texto adicional):
{
  "readings": [
    { "fecha": "YYYY-MM-DD", "hora": "HH:MM", "temperatura": 22.5, "humedad": 45.2, "turno": "M", "operador": "JL" }
  ],
  "notas": "string con observaciones legibles en la bitácora, o vacío"
}

Reglas:
- Si la fecha está en formato DD/MM/AAAA conviértela a YYYY-MM-DD.
- Si un campo no es legible usa null.
- No inventes datos. Si una fila no es legible omítela.
- Las temperaturas suelen estar entre 15 y 30°C, la humedad entre 20 y 80%.`,
  filtros: `Eres un asistente de validación. Extrae lecturas de una bitácora de Banco de Filtros (presión diferencial por etapa). Devuelve JSON: { "readings": [{"fecha":"YYYY-MM-DD","hora":"HH:MM","etapa":"35%","dp_pa":120,"operador":"JL"}], "notas":"" }`,
  presiones: `Extrae lecturas de presiones diferenciales entre áreas. JSON: { "readings": [{"fecha":"YYYY-MM-DD","hora":"HH:MM","area":"X","dp_pa":15,"operador":"JL"}], "notas":"" }`,
  agua: `Extrae lecturas de sistema de agua purificada nivel 1. JSON: { "readings": [{"fecha":"YYYY-MM-DD","hora":"HH:MM","conductividad":1.2,"toc":120,"temperatura":22,"operador":"JL"}], "notas":"" }`,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body.imageBase64 || !body.module) {
      return new Response(JSON.stringify({ error: "Faltan campos: imageBase64 y module son requeridos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = PROMPTS[body.module] ?? PROMPTS.temp_hr;
    const ctx = body.context
      ? `\nContexto: Sistema=${body.context.sistema ?? "?"}, UMA=${body.context.uma ?? "?"}, Área=${body.context.area ?? "?"}, Clasificación=${body.context.iso ?? "?"}.`
      : "";

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
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: body.mediaType ?? "image/jpeg",
                  data: body.imageBase64,
                },
              },
              { type: "text", text: prompt + ctx },
            ],
          },
        ],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error("Anthropic error:", anthropicResp.status, errText);
      return new Response(
        JSON.stringify({ error: `Anthropic API error ${anthropicResp.status}`, detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await anthropicResp.json();
    const textOut: string = data?.content?.[0]?.text ?? "";

    // Intentar parsear JSON limpio (a veces el modelo envuelve en ```json)
    let parsed: unknown = null;
    let parseError: string | null = null;
    try {
      const cleaned = textOut.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }

    return new Response(
      JSON.stringify({ raw: textOut, parsed, parseError, usage: data?.usage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("extract-bitacora error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
