import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TraceaLogo } from "@/components/TraceaLogo";
import { cn } from "@/lib/utils";

interface TraceaSiteButtonProps {
  className?: string;
}

/** Enlace discreto al sitio público de TRACEA. No afecta el inicio de sesión. */
export function TraceaSiteButton({ className }: TraceaSiteButtonProps) {
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className={cn(
        "gap-2 border-border/70 bg-background font-normal text-foreground hover:bg-muted",
        className,
      )}
    >
      <a
        href="https://tracea.com.mx"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Abrir el sitio de TRACEA en una pestaña nueva"
      >
        <TraceaLogo size={16} />
        <span className="text-xs tracking-[0.14em]">TRACEA</span>
        <ExternalLink className="ml-auto text-muted-foreground" aria-hidden="true" />
      </a>
    </Button>
  );
}
