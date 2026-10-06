ALTER TABLE public.instrumentos
  ADD COLUMN spec_estado text CHECK (spec_estado IN ('validada','pendiente','na')),
  ADD COLUMN spec_texto text,
  ADD COLUMN spec_lie numeric,
  ADD COLUMN spec_lse numeric,
  ADD COLUMN spec_lie_estricto boolean NOT NULL DEFAULT false,
  ADD COLUMN spec_lse_estricto boolean NOT NULL DEFAULT false,
  ADD COLUMN spec_texto_hr text,
  ADD COLUMN spec_lie_hr numeric,
  ADD COLUMN spec_lse_hr numeric,
  ADD COLUMN spec_referencia text,
  ADD COLUMN spec_fecha_validacion date,
  ADD COLUMN area_estado text NOT NULL DEFAULT 'validada' CHECK (area_estado IN ('validada','pendiente')),
  ADD COLUMN area_nota text;

COMMENT ON COLUMN public.instrumentos.lie_pa IS 'DEPRECATED: replaced by spec_lie (normative) and op_min_pa (operating range)';
COMMENT ON COLUMN public.instrumentos.lse_pa IS 'DEPRECATED: replaced by spec_lse (normative) and op_max_pa (operating range)';

UPDATE public.instrumentos SET op_min_pa = COALESCE(op_min_pa, lie_pa), op_max_pa = COALESCE(op_max_pa, lse_pa)
  WHERE tipo = 'manometro_diferencial' AND lie_pa IS NOT NULL AND lse_pa IS NOT NULL;

UPDATE public.instrumentos SET spec_estado='validada', spec_lie=5, spec_lie_estricto=true, spec_texto='>5 Pa'
  WHERE codigo IN ('INS-CMB-10','INS-CMB-19','INS-CMB-22');
UPDATE public.instrumentos SET spec_estado='validada', spec_lie=10, spec_lie_estricto=true, spec_texto='>10 Pa'
  WHERE codigo IN ('INS-CMB-11','INS-CMB-12');
UPDATE public.instrumentos SET spec_estado='validada', spec_lie=18, spec_lse=25, spec_texto='18 – 25 °C',
  spec_lie_hr=30, spec_lse_hr=65, spec_texto_hr='30 – 65 %'
  WHERE codigo IN ('INS-CMB-03','INS-CMB-20','INS-CMB-28','INS-CMB-29');
UPDATE public.instrumentos SET spec_estado='na', spec_texto='N/A'
  WHERE codigo IN ('INS-CMB-07','INS-CMB-08','INS-CMB-09');
UPDATE public.instrumentos SET spec_estado='pendiente', spec_texto='Presión positiva con respecto a áreas no clasificadas'
  WHERE codigo IN ('INS-CMB-18','INS-CMB-21');
UPDATE public.instrumentos SET area_estado='pendiente', area_nota='Confirmar sentido DCC-03 / DCC-04' WHERE codigo='INS-CMB-12';
UPDATE public.instrumentos SET area_estado='pendiente', area_nota='Confirmar nombres y códigos DCC-05 / DCC-06'
  WHERE codigo IN ('INS-CMB-19','INS-CMB-22','INS-CMB-29');