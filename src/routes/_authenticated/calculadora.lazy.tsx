import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator, TrendingUp, TrendingDown } from "lucide-react";

export const Route = createLazyFileRoute("/_authenticated/calculadora")({
  component: CalculadoraPage,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (v: number) =>
  v.toFixed(2).replace(".", ",") + "%";

function parseNumber(value: string): number {
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function CalculadoraPage() {
  const [precoVenda, setPrecoVenda] = useState<string>("");
  const [precoCompra, setPrecoCompra] = useState<string>("");
  const [custoInsumos, setCustoInsumos] = useState<string>("0,20");
  const [imposto, setImposto] = useState<string>("8");
  const [mostrarResultado, setMostrarResultado] = useState(false);
  const resultadoRef = useRef<HTMLDivElement>(null);

  const comissaoShopeePerc = 20;
  const taxaFixaShopee = 4;

  const precoVendaNum = parseNumber(precoVenda);
  const precoCompraNum = parseNumber(precoCompra);
  const insumosNum = parseNumber(custoInsumos);
  const impostoPerc = parseNumber(imposto);

  const comissaoShopee = precoVendaNum * (comissaoShopeePerc / 100);
  const impostos = precoVendaNum * (impostoPerc / 100);
  const totalCustos =
    precoCompraNum + insumosNum + comissaoShopee + taxaFixaShopee + impostos;
  const lucroBruto = precoVendaNum - totalCustos;
  const margemLucro = precoVendaNum > 0 ? (lucroBruto / precoVendaNum) * 100 : 0;

  const calcular = () => {
    setMostrarResultado(true);
  };

  useEffect(() => {
    if (mostrarResultado && resultadoRef.current) {
      resultadoRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [mostrarResultado, precoVenda, precoCompra, custoInsumos, imposto]);

  const inputClass =
    "bg-background/50 border-border pl-10 pr-3 text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary/40";
  const inputClassNoPrefix =
    "bg-background/50 border-border pr-10 text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary/40";

  return (
    <div className="mx-auto max-w-xl space-y-6 py-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calculadora de Precificação</h1>
        <p className="text-sm text-muted-foreground">
          Simule comissão, impostos, custos e margem de lucro na Shopee.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Dados do Produto</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">Preencha os valores abaixo para simular.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="precoVenda">
              Preço de Venda <span className="text-primary">*</span>
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id="precoVenda"
                type="text"
                inputMode="decimal"
                placeholder="100,00"
                value={precoVenda}
                onChange={(e) => setPrecoVenda(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="precoCompra">Preço de Compra</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id="precoCompra"
                type="text"
                inputMode="decimal"
                placeholder="50,00"
                value={precoCompra}
                onChange={(e) => setPrecoCompra(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custoInsumos">Custo de Insumos / Embalagem</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id="custoInsumos"
                type="text"
                inputMode="decimal"
                placeholder="0,20"
                value={custoInsumos}
                onChange={(e) => setCustoInsumos(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imposto">Imposto (%)</Label>
            <div className="relative">
              <Input
                id="imposto"
                type="text"
                inputMode="decimal"
                placeholder="8,0"
                value={imposto}
                onChange={(e) => setImposto(e.target.value)}
                className={inputClassNoPrefix}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Valor padrão 8%, mas você pode ajustar.</p>
          </div>

          <Button
            onClick={calcular}
            className="w-full gap-2 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20"
          >
            <Calculator className="h-4 w-4" />
            Calcular Precificação
          </Button>
        </CardContent>
      </Card>

      {mostrarResultado && (
        <div ref={resultadoRef}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                {lucroBruto >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                )}
                <CardTitle className="text-base">Detalhamento</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Resumo da sua precificação.</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Preço de Venda</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{brl(precoVendaNum)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">(-) Preço de Compra</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(precoCompraNum)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">(-) Custo de Insumos / Embalagem</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(insumosNum)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">(-) Comissão Shopee ({comissaoShopeePerc}%)</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(comissaoShopee)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">(-) Taxa Fixa Shopee</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(taxaFixaShopee)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">(-) Impostos ({impostoPerc}%)</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(impostos)}</TableCell>
                  </TableRow>
                  <TableRow className="border-t font-semibold">
                    <TableCell>(=) Total de Custos</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(totalCustos)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-primary/10">
                    <TableCell className="font-semibold text-primary">(=) Lucro Bruto</TableCell>
                    <TableCell className="text-right font-bold tabular-nums text-primary">{brl(lucroBruto)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">(=) Margem de Lucro</TableCell>
                    <TableCell
                      className={`text-right font-bold tabular-nums ${
                        margemLucro > 15 ? "text-emerald-500" : margemLucro >= 0 ? "text-amber-500" : "text-destructive"
                      }`}
                    >
                      {pct(margemLucro)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
