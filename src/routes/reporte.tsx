import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/reporte")({
  component: () => <Outlet />,
});