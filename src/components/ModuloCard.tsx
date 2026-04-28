import { Link } from "@tanstack/react-router";
import { Filter, Thermometer, Gauge, Droplets, Microscope, FileText, ArrowRight, Lock } from "lucide-react";
import { MODULOS } from "@/lib/diafra-data";

const ICONS = { Filter, Thermometer, Gauge, Droplets, Microscope, FileText } as const;
type IconKey = keyof typeof ICONS;

interface Props {
  modulo: (typeof MODULOS)[number];
}

export function ModuloCard({ modulo }: Props) {
  const Icon = ICONS[modulo.icon as IconKey] ?? FileText;
  const card = (
    <div
      className={`group h-full rounded-xl border bg-card p-5 transition-all ${
        modulo.enabled
          ? "border-border hover:border-primary hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
          : "border-dashed border-border/70 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-lg ${
            modulo.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        {!modulo.enabled && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <Lock className="h-3 w-3" /> Próximamente
          </span>
        )}
      </div>
      <h3 className="text-base font-semibold text-foreground leading-tight">{modulo.nombre}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{modulo.descripcion}</p>
      {modulo.enabled && (
        <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
          Abrir módulo <ArrowRight className="h-4 w-4" />
        </div>
      )}
    </div>
  );

  if (!modulo.enabled) return card;
  return (
    <Link to="/modulo/$slug" params={{ slug: modulo.slug }} className="block h-full">
      {card}
    </Link>
  );
}
