import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Dream Ice" }] }),
});