import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — Dream Ice" }] }),
});