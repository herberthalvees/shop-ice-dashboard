import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Dream Ice" }] }),
});