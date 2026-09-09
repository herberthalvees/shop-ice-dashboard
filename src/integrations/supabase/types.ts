export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ads_campanhas: {
        Row: {
          campaign_id: number
          cliques: number | null
          created_at: string
          ctr: number | null
          data: string
          id: number
          impressoes: number | null
          investimento: number | null
          item_id: number | null
          nome: string | null
          payload: Json | null
          pedidos: number | null
          receita: number | null
          roas: number | null
          status: string | null
        }
        Insert: {
          campaign_id: number
          cliques?: number | null
          created_at?: string
          ctr?: number | null
          data: string
          id?: number
          impressoes?: number | null
          investimento?: number | null
          item_id?: number | null
          nome?: string | null
          payload?: Json | null
          pedidos?: number | null
          receita?: number | null
          roas?: number | null
          status?: string | null
        }
        Update: {
          campaign_id?: number
          cliques?: number | null
          created_at?: string
          ctr?: number | null
          data?: string
          id?: number
          impressoes?: number | null
          investimento?: number | null
          item_id?: number | null
          nome?: string | null
          payload?: Json | null
          pedidos?: number | null
          receita?: number | null
          roas?: number | null
          status?: string | null
        }
        Relationships: []
      }
      ads_gasto_horario: {
        Row: {
          atualizado_em: string
          data: string
          hora: number
          investimento: number
        }
        Insert: {
          atualizado_em?: string
          data: string
          hora: number
          investimento?: number
        }
        Update: {
          atualizado_em?: string
          data?: string
          hora?: number
          investimento?: number
        }
        Relationships: []
      }
      alertas_enviados: {
        Row: {
          chave: string
          created_at: string
          detalhe: Json | null
          enviado: boolean
          erro: string | null
          id: string
          tipo: string
        }
        Insert: {
          chave: string
          created_at?: string
          detalhe?: Json | null
          enviado?: boolean
          erro?: string | null
          id?: string
          tipo: string
        }
        Update: {
          chave?: string
          created_at?: string
          detalhe?: Json | null
          enviado?: boolean
          erro?: string | null
          id?: string
          tipo?: string
        }
        Relationships: []
      }
      avaliacoes: {
        Row: {
          comentario: string | null
          comment_id: number
          comprador: string | null
          created_at: string
          criado_em: string | null
          enviada_em: string | null
          erro: string | null
          item_id: number | null
          model_id: number | null
          order_sn: string | null
          payload: Json | null
          produto: string | null
          rating: number | null
          respondida: boolean
          resposta_gerada: string | null
          resposta_shopee: string | null
          status: string
          updated_at: string
        }
        Insert: {
          comentario?: string | null
          comment_id: number
          comprador?: string | null
          created_at?: string
          criado_em?: string | null
          enviada_em?: string | null
          erro?: string | null
          item_id?: number | null
          model_id?: number | null
          order_sn?: string | null
          payload?: Json | null
          produto?: string | null
          rating?: number | null
          respondida?: boolean
          resposta_gerada?: string | null
          resposta_shopee?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          comentario?: string | null
          comment_id?: number
          comprador?: string | null
          created_at?: string
          criado_em?: string | null
          enviada_em?: string | null
          erro?: string | null
          item_id?: number | null
          model_id?: number | null
          order_sn?: string | null
          payload?: Json | null
          produto?: string | null
          rating?: number | null
          respondida?: boolean
          resposta_gerada?: string | null
          resposta_shopee?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      avaliacoes_exemplos: {
        Row: {
          ativo: boolean
          created_at: string
          estrelas: number
          id: string
          texto: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          estrelas: number
          id?: string
          texto: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          estrelas?: number
          id?: string
          texto?: string
          updated_at?: string
        }
        Relationships: []
      }
      carteira_transacoes: {
        Row: {
          comprador: string | null
          created_at: string
          data_transacao: string | null
          descricao: string | null
          fluxo: string | null
          order_sn: string | null
          payload: Json | null
          refund_sn: string | null
          saldo_apos: number | null
          status: string | null
          tab_type: string | null
          taxa: number | null
          tipo: string | null
          transaction_id: number
          valor: number | null
          wallet_type: string | null
          withdrawal_id: number | null
          withdrawal_type: string | null
        }
        Insert: {
          comprador?: string | null
          created_at?: string
          data_transacao?: string | null
          descricao?: string | null
          fluxo?: string | null
          order_sn?: string | null
          payload?: Json | null
          refund_sn?: string | null
          saldo_apos?: number | null
          status?: string | null
          tab_type?: string | null
          taxa?: number | null
          tipo?: string | null
          transaction_id: number
          valor?: number | null
          wallet_type?: string | null
          withdrawal_id?: number | null
          withdrawal_type?: string | null
        }
        Update: {
          comprador?: string | null
          created_at?: string
          data_transacao?: string | null
          descricao?: string | null
          fluxo?: string | null
          order_sn?: string | null
          payload?: Json | null
          refund_sn?: string | null
          saldo_apos?: number | null
          status?: string | null
          tab_type?: string | null
          taxa?: number | null
          tipo?: string | null
          transaction_id?: number
          valor?: number | null
          wallet_type?: string | null
          withdrawal_id?: number | null
          withdrawal_type?: string | null
        }
        Relationships: []
      }
      chat_envios: {
        Row: {
          comprador: string | null
          conversation_id: string | null
          created_at: string
          erro: string | null
          id: string
          ok: boolean
          texto: string
          to_id: string | null
        }
        Insert: {
          comprador?: string | null
          conversation_id?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          ok?: boolean
          texto: string
          to_id?: string | null
        }
        Update: {
          comprador?: string | null
          conversation_id?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          ok?: boolean
          texto?: string
          to_id?: string | null
        }
        Relationships: []
      }
      chat_respostas_rapidas: {
        Row: {
          ativo: boolean
          corpo: string
          created_at: string
          id: string
          ordem: number
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          corpo: string
          created_at?: string
          id?: string
          ordem?: number
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          corpo?: string
          created_at?: string
          id?: string
          ordem?: number
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      config: {
        Row: {
          aliquota_imposto: number
          avaliacoes_auto_ativo: boolean
          avaliacoes_prompt: string
          avaliacoes_usar_ia: boolean
          eventos: Json
          id: number
          limite_estoque_baixo: number
          notificacoes_ativas: boolean
          push_chat_ativo: boolean
          push_chat_corpo: string
          push_chat_titulo: string
          push_venda_ativo: boolean
          push_venda_corpo: string
          push_venda_titulo: string
          updated_at: string
          webhook_whatsapp_url: string | null
        }
        Insert: {
          aliquota_imposto?: number
          avaliacoes_auto_ativo?: boolean
          avaliacoes_prompt?: string
          avaliacoes_usar_ia?: boolean
          eventos?: Json
          id?: number
          limite_estoque_baixo?: number
          notificacoes_ativas?: boolean
          push_chat_ativo?: boolean
          push_chat_corpo?: string
          push_chat_titulo?: string
          push_venda_ativo?: boolean
          push_venda_corpo?: string
          push_venda_titulo?: string
          updated_at?: string
          webhook_whatsapp_url?: string | null
        }
        Update: {
          aliquota_imposto?: number
          avaliacoes_auto_ativo?: boolean
          avaliacoes_prompt?: string
          avaliacoes_usar_ia?: boolean
          eventos?: Json
          id?: number
          limite_estoque_baixo?: number
          notificacoes_ativas?: boolean
          push_chat_ativo?: boolean
          push_chat_corpo?: string
          push_chat_titulo?: string
          push_venda_ativo?: boolean
          push_venda_corpo?: string
          push_venda_titulo?: string
          updated_at?: string
          webhook_whatsapp_url?: string | null
        }
        Relationships: []
      }
      despesas_fixas: {
        Row: {
          ativa: boolean
          categoria: string | null
          created_at: string
          descricao: string
          id: number
          valor: number
        }
        Insert: {
          ativa?: boolean
          categoria?: string | null
          created_at?: string
          descricao: string
          id?: number
          valor: number
        }
        Update: {
          ativa?: boolean
          categoria?: string | null
          created_at?: string
          descricao?: string
          id?: number
          valor?: number
        }
        Relationships: []
      }
      despesas_variaveis: {
        Row: {
          ativa: boolean
          created_at: string
          descricao: string
          dia_corte_ciclo: number | null
          franquia_pedidos: number | null
          id: number
          updated_at: string
          valor_por_pedido: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          descricao: string
          dia_corte_ciclo?: number | null
          franquia_pedidos?: number | null
          id?: number
          updated_at?: string
          valor_por_pedido?: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          descricao?: string
          dia_corte_ciclo?: number | null
          franquia_pedidos?: number | null
          id?: number
          updated_at?: string
          valor_por_pedido?: number
        }
        Relationships: []
      }
      dim_produto: {
        Row: {
          atualizado_em: string
          categoria: string | null
          item_id: number
          model_id: number
          produto: string | null
          sku: string | null
        }
        Insert: {
          atualizado_em?: string
          categoria?: string | null
          item_id: number
          model_id?: number
          produto?: string | null
          sku?: string | null
        }
        Update: {
          atualizado_em?: string
          categoria?: string | null
          item_id?: number
          model_id?: number
          produto?: string | null
          sku?: string | null
        }
        Relationships: []
      }
      estoque_itens: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          estoque_minimo: number
          id: string
          imagem_url: string | null
          nome: string
          saldo: number
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          estoque_minimo?: number
          id?: string
          imagem_url?: string | null
          nome: string
          saldo?: number
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          estoque_minimo?: number
          id?: string
          imagem_url?: string | null
          nome?: string
          saldo?: number
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      estoque_movimentos: {
        Row: {
          created_at: string
          estoque_item_id: string
          id: string
          item_id: number | null
          marketplace: string | null
          model_id: number | null
          observacao: string | null
          order_sn: string | null
          origem: string
          quantidade: number
          saldo_apos: number | null
          tipo: string
        }
        Insert: {
          created_at?: string
          estoque_item_id: string
          id?: string
          item_id?: number | null
          marketplace?: string | null
          model_id?: number | null
          observacao?: string | null
          order_sn?: string | null
          origem?: string
          quantidade: number
          saldo_apos?: number | null
          tipo: string
        }
        Update: {
          created_at?: string
          estoque_item_id?: string
          id?: string
          item_id?: number | null
          marketplace?: string | null
          model_id?: number | null
          observacao?: string | null
          order_sn?: string | null
          origem?: string
          quantidade?: number
          saldo_apos?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_estoque_item_id_fkey"
            columns: ["estoque_item_id"]
            isOneToOne: false
            referencedRelation: "estoque_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_vinculos: {
        Row: {
          ativo: boolean
          created_at: string
          estoque_item_id: string
          fator: number
          id: string
          item_id: number
          marketplace: string
          model_id: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          estoque_item_id: string
          fator?: number
          id?: string
          item_id: number
          marketplace?: string
          model_id?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          estoque_item_id?: string
          fator?: number
          id?: string
          item_id?: number
          marketplace?: string
          model_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_vinculos_estoque_item_id_fkey"
            columns: ["estoque_item_id"]
            isOneToOne: false
            referencedRelation: "estoque_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_log: {
        Row: {
          assinatura_valida: boolean
          code: number | null
          created_at: string
          erro: string | null
          id: string
          notificado: boolean
          payload: Json
          processado: boolean
          shop_id: number | null
          tipo_evento: string | null
        }
        Insert: {
          assinatura_valida?: boolean
          code?: number | null
          created_at?: string
          erro?: string | null
          id?: string
          notificado?: boolean
          payload: Json
          processado?: boolean
          shop_id?: number | null
          tipo_evento?: string | null
        }
        Update: {
          assinatura_valida?: boolean
          code?: number | null
          created_at?: string
          erro?: string | null
          id?: string
          notificado?: boolean
          payload?: Json
          processado?: boolean
          shop_id?: number | null
          tipo_evento?: string | null
        }
        Relationships: []
      }
      ia_conversas: {
        Row: {
          created_at: string
          id: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ia_memoria: {
        Row: {
          chave: string
          conteudo: string
          created_at: string
          id: string
          peso: number
          tipo: string
          updated_at: string
        }
        Insert: {
          chave: string
          conteudo: string
          created_at?: string
          id?: string
          peso?: number
          tipo?: string
          updated_at?: string
        }
        Update: {
          chave?: string
          conteudo?: string
          created_at?: string
          id?: string
          peso?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      ia_mensagens: {
        Row: {
          conversa_id: string
          created_at: string
          id: string
          msg_id: string | null
          parts: Json
          role: string
        }
        Insert: {
          conversa_id: string
          created_at?: string
          id?: string
          msg_id?: string | null
          parts?: Json
          role: string
        }
        Update: {
          conversa_id?: string
          created_at?: string
          id?: string
          msg_id?: string | null
          parts?: Json
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "ia_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_uso: {
        Row: {
          conversa_id: string | null
          created_at: string
          custo_creditos: number
          id: string
          modelo: string
          passos: number
          tokens_entrada: number
          tokens_raciocinio: number
          tokens_saida: number
        }
        Insert: {
          conversa_id?: string | null
          created_at?: string
          custo_creditos?: number
          id?: string
          modelo: string
          passos?: number
          tokens_entrada?: number
          tokens_raciocinio?: number
          tokens_saida?: number
        }
        Update: {
          conversa_id?: string | null
          created_at?: string
          custo_creditos?: number
          id?: string
          modelo?: string
          passos?: number
          tokens_entrada?: number
          tokens_raciocinio?: number
          tokens_saida?: number
        }
        Relationships: [
          {
            foreignKeyName: "ia_uso_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "ia_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          created_at: string
          data_criacao_pedido: string | null
          id: number
          item_id: number
          marketplace: string
          model_id: number
          order_sn: string
          preco_unitario: number | null
          produto: string | null
          quantidade: number
          receita: number | null
          sku: string | null
          status_pedido: string | null
        }
        Insert: {
          created_at?: string
          data_criacao_pedido?: string | null
          id?: number
          item_id?: number
          marketplace?: string
          model_id?: number
          order_sn: string
          preco_unitario?: number | null
          produto?: string | null
          quantidade?: number
          receita?: number | null
          sku?: string | null
          status_pedido?: string | null
        }
        Update: {
          created_at?: string
          data_criacao_pedido?: string | null
          id?: number
          item_id?: number
          marketplace?: string
          model_id?: number
          order_sn?: string
          preco_unitario?: number | null
          produto?: string | null
          quantidade?: number
          receita?: number | null
          sku?: string | null
          status_pedido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_order_sn_fkey"
            columns: ["order_sn"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["order_sn"]
          },
        ]
      }
      pedidos: {
        Row: {
          comissao: number | null
          comprador_username: string | null
          created_at: string
          data_criacao_pedido: string | null
          data_pagamento: string | null
          escrow_atualizado_em: string | null
          escrow_payload: Json | null
          frete_real: number | null
          id: string
          itens: Json | null
          marketplace: string
          moeda: string | null
          order_sn: string
          payload: Json | null
          payload_json: Json | null
          qtd_itens: number | null
          status: string | null
          taxa_servico: number | null
          taxa_transacao: number | null
          updated_at: string
          valor_liquido: number | null
          valor_total: number | null
        }
        Insert: {
          comissao?: number | null
          comprador_username?: string | null
          created_at?: string
          data_criacao_pedido?: string | null
          data_pagamento?: string | null
          escrow_atualizado_em?: string | null
          escrow_payload?: Json | null
          frete_real?: number | null
          id?: string
          itens?: Json | null
          marketplace?: string
          moeda?: string | null
          order_sn: string
          payload?: Json | null
          payload_json?: Json | null
          qtd_itens?: number | null
          status?: string | null
          taxa_servico?: number | null
          taxa_transacao?: number | null
          updated_at?: string
          valor_liquido?: number | null
          valor_total?: number | null
        }
        Update: {
          comissao?: number | null
          comprador_username?: string | null
          created_at?: string
          data_criacao_pedido?: string | null
          data_pagamento?: string | null
          escrow_atualizado_em?: string | null
          escrow_payload?: Json | null
          frete_real?: number | null
          id?: string
          itens?: Json | null
          marketplace?: string
          moeda?: string | null
          order_sn?: string
          payload?: Json | null
          payload_json?: Json | null
          qtd_itens?: number | null
          status?: string | null
          taxa_servico?: number | null
          taxa_transacao?: number | null
          updated_at?: string
          valor_liquido?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      produto_custos: {
        Row: {
          created_at: string
          custo_unitario: number
          id: number
          item_id: number
          model_id: number
          observacao: string | null
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          created_at?: string
          custo_unitario: number
          id?: number
          item_id: number
          model_id?: number
          observacao?: string | null
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          created_at?: string
          custo_unitario?: number
          id?: number
          item_id?: number
          model_id?: number
          observacao?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          atualizado_em: string
          estoque_disponivel: number | null
          estoque_reservado: number | null
          id: number
          imagem_url: string | null
          item_id: number
          marketplace: string
          model_id: number
          preco_atual: number | null
          preco_original: number | null
          produto: string | null
          sku: string | null
          status_item: string | null
          variacao: string | null
        }
        Insert: {
          atualizado_em?: string
          estoque_disponivel?: number | null
          estoque_reservado?: number | null
          id?: number
          imagem_url?: string | null
          item_id: number
          marketplace?: string
          model_id?: number
          preco_atual?: number | null
          preco_original?: number | null
          produto?: string | null
          sku?: string | null
          status_item?: string | null
          variacao?: string | null
        }
        Update: {
          atualizado_em?: string
          estoque_disponivel?: number | null
          estoque_reservado?: number | null
          id?: number
          imagem_url?: string | null
          item_id?: number
          marketplace?: string
          model_id?: number
          preco_atual?: number | null
          preco_original?: number | null
          produto?: string | null
          sku?: string | null
          status_item?: string | null
          variacao?: string | null
        }
        Relationships: []
      }
      push_dispositivos: {
        Row: {
          apelido: string | null
          ativo: boolean
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          ultimo_envio_em: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          apelido?: string | null
          ativo?: boolean
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          ultimo_envio_em?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          apelido?: string | null
          ativo?: boolean
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          ultimo_envio_em?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_envios: {
        Row: {
          corpo: string | null
          created_at: string
          dispositivos: number
          erro: string | null
          id: string
          referencia: string | null
          sucesso: number
          tipo: string
          titulo: string
        }
        Insert: {
          corpo?: string | null
          created_at?: string
          dispositivos?: number
          erro?: string | null
          id?: string
          referencia?: string | null
          sucesso?: number
          tipo: string
          titulo: string
        }
        Update: {
          corpo?: string | null
          created_at?: string
          dispositivos?: number
          erro?: string | null
          id?: string
          referencia?: string | null
          sucesso?: number
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      pv_campanhas: {
        Row: {
          agendada_para: string | null
          created_at: string
          cupom_id: string | null
          filtros: Json
          id: string
          janela_dias: number
          limite_diario: number
          nome: string
          ritmo: number
          status: string
          updated_at: string
          variacoes: string[]
        }
        Insert: {
          agendada_para?: string | null
          created_at?: string
          cupom_id?: string | null
          filtros?: Json
          id?: string
          janela_dias?: number
          limite_diario?: number
          nome: string
          ritmo?: number
          status?: string
          updated_at?: string
          variacoes?: string[]
        }
        Update: {
          agendada_para?: string | null
          created_at?: string
          cupom_id?: string | null
          filtros?: Json
          id?: string
          janela_dias?: number
          limite_diario?: number
          nome?: string
          ritmo?: number
          status?: string
          updated_at?: string
          variacoes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "pv_campanhas_cupom_id_fkey"
            columns: ["cupom_id"]
            isOneToOne: false
            referencedRelation: "pv_cupons"
            referencedColumns: ["id"]
          },
        ]
      }
      pv_contatos: {
        Row: {
          atualizado_em: string
          comprador_username: string | null
          conversation_id: string | null
          created_at: string
          nome: string | null
          to_id: string
          ultima_em: string | null
        }
        Insert: {
          atualizado_em?: string
          comprador_username?: string | null
          conversation_id?: string | null
          created_at?: string
          nome?: string | null
          to_id: string
          ultima_em?: string | null
        }
        Update: {
          atualizado_em?: string
          comprador_username?: string | null
          conversation_id?: string | null
          created_at?: string
          nome?: string | null
          to_id?: string
          ultima_em?: string | null
        }
        Relationships: []
      }
      pv_cupons: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          desconto: string | null
          id: string
          observacao: string | null
          pedido_minimo: number | null
          validade: string | null
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          desconto?: string | null
          id?: string
          observacao?: string | null
          pedido_minimo?: number | null
          validade?: string | null
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          desconto?: string | null
          id?: string
          observacao?: string | null
          pedido_minimo?: number | null
          validade?: string | null
        }
        Relationships: []
      }
      pv_envios: {
        Row: {
          campanha_id: string
          comprador: string | null
          conversation_id: string | null
          created_at: string
          enviado_em: string | null
          erro: string | null
          id: string
          produto: string | null
          status: string
          texto: string | null
          to_id: string
        }
        Insert: {
          campanha_id: string
          comprador?: string | null
          conversation_id?: string | null
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          produto?: string | null
          status?: string
          texto?: string | null
          to_id: string
        }
        Update: {
          campanha_id?: string
          comprador?: string | null
          conversation_id?: string | null
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          produto?: string | null
          status?: string
          texto?: string | null
          to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pv_envios_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "pv_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      pv_envios_manuais: {
        Row: {
          comprador: string | null
          conversation_id: string | null
          created_at: string
          erro: string | null
          id: string
          ok: boolean
          texto: string
          to_id: string
        }
        Insert: {
          comprador?: string | null
          conversation_id?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          ok?: boolean
          texto: string
          to_id: string
        }
        Update: {
          comprador?: string | null
          conversation_id?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          ok?: boolean
          texto?: string
          to_id?: string
        }
        Relationships: []
      }
      pv_optout: {
        Row: {
          comprador_username: string
          created_at: string
          motivo: string | null
        }
        Insert: {
          comprador_username: string
          created_at?: string
          motivo?: string | null
        }
        Update: {
          comprador_username?: string
          created_at?: string
          motivo?: string | null
        }
        Relationships: []
      }
      resumo_cron_config: {
        Row: {
          base_url: string
          cron_secret: string
          id: number
          updated_at: string
        }
        Insert: {
          base_url: string
          cron_secret: string
          id?: number
          updated_at?: string
        }
        Update: {
          base_url?: string
          cron_secret?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      resumo_horarios: {
        Row: {
          ativo: boolean
          created_at: string
          hora: number
          id: string
          minuto: number
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          hora: number
          id?: string
          minuto?: number
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          hora?: number
          id?: string
          minuto?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      shopee_connection: {
        Row: {
          access_token: string | null
          app_tipo: string
          id: number
          partner_id: number | null
          refresh_token: string | null
          shop_id: number | null
          shop_name: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          app_tipo?: string
          id?: number
          partner_id?: number | null
          refresh_token?: string | null
          shop_id?: number | null
          shop_name?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          app_tipo?: string
          id?: number
          partner_id?: number | null
          refresh_token?: string | null
          shop_id?: number | null
          shop_name?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          ate: string | null
          campo: string | null
          created_at: string
          de: string | null
          duracao_ms: number | null
          encontrados: number | null
          erros: Json | null
          gravados: number | null
          id: string
          ok: boolean
        }
        Insert: {
          ate?: string | null
          campo?: string | null
          created_at?: string
          de?: string | null
          duracao_ms?: number | null
          encontrados?: number | null
          erros?: Json | null
          gravados?: number | null
          id?: string
          ok?: boolean
        }
        Update: {
          ate?: string | null
          campo?: string | null
          created_at?: string
          de?: string | null
          duracao_ms?: number | null
          encontrados?: number | null
          erros?: Json | null
          gravados?: number | null
          id?: string
          ok?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuarios_papeis: {
        Row: {
          created_at: string
          nome: string | null
          papel: string
          user_id: string
        }
        Insert: {
          created_at?: string
          nome?: string | null
          papel?: string
          user_id: string
        }
        Update: {
          created_at?: string
          nome?: string | null
          papel?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      pedido_itens_custeado: {
        Row: {
          created_at: string | null
          custo_total: number | null
          custo_vigente: number | null
          data_criacao_pedido: string | null
          id: number | null
          item_id: number | null
          marketplace: string | null
          model_id: number | null
          order_sn: string | null
          preco_unitario: number | null
          produto: string | null
          quantidade: number | null
          receita: number | null
          sku: string | null
          status_pedido: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_order_sn_fkey"
            columns: ["order_sn"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["order_sn"]
          },
        ]
      }
      shopee_connection_status: {
        Row: {
          app_tipo: string | null
          id: number | null
          partner_id: number | null
          shop_id: number | null
          shop_name: string | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          app_tipo?: string | null
          id?: number | null
          partner_id?: number | null
          shop_id?: number | null
          shop_name?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          app_tipo?: string | null
          id?: number | null
          partner_id?: number | null
          shop_id?: number | null
          shop_name?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      ads_resumo: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          acos: number
          investimento: number
          pedidos: number
          receita: number
          roas: number
          tacos: number
        }[]
      }
      ads_totais_periodo: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          cliques: number
          impressoes: number
          investimento: number
          pedidos: number
          receita: number
        }[]
      }
      analise_margem_sku: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          custo_atual: number
          custo_periodo: number
          item_id: number
          liquido_unitario: number
          lucro_unitario: number
          margem_pct: number
          model_id: number
          preco_medio: number
          preco_minimo: number
          produto: string
          roas_minimo: number
          situacao: string
          sku: string
          unidades: number
        }[]
      }
      analise_margem_sku_impl: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          custo_atual: number
          custo_periodo: number
          item_id: number
          liquido_unitario: number
          lucro_unitario: number
          margem_pct: number
          model_id: number
          preco_medio: number
          preco_minimo: number
          produto: string
          roas_minimo: number
          situacao: string
          sku: string
          unidades: number
        }[]
      }
      aplicar_ads: { Args: { p_dados: Json }; Returns: number }
      aplicar_carteira: { Args: { p_dados: Json }; Returns: number }
      aplicar_escrow: { Args: { p_dados: Json }; Returns: number }
      aplicar_produtos: { Args: { p_dados: Json }; Returns: number }
      carteira_resumo: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          em_transito: number
          entradas: number
          pedidos_em_transito: number
          saidas: number
          saldo_atual: number
          saldo_em: string
          saques: number
        }[]
      }
      carteira_resumo_impl: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          em_transito: number
          entradas: number
          pedidos_em_transito: number
          saidas: number
          saldo_atual: number
          saldo_em: string
          saques: number
        }[]
      }
      contar_pedidos_periodo: {
        Args: { p_ate: string; p_de: string }
        Returns: number
      }
      dashboard_curva_abc: {
        Args: {
          p_ate: string
          p_de: string
          p_limite: number
          p_marketplace?: string
        }
        Returns: {
          acumulado: number
          classe: string
          participacao: number
          produto: string
          receita: number
          sku: string
          unidades: number
        }[]
      }
      dashboard_curva_abc_impl: {
        Args: {
          p_ate: string
          p_de: string
          p_limite?: number
          p_marketplace?: string
        }
        Returns: {
          acumulado: number
          classe: string
          participacao: number
          produto: string
          receita: number
          sku: string
          unidades: number
        }[]
      }
      dashboard_kpis: {
        Args: never
        Returns: {
          aguardando_envio: number
          faturamento_hoje: number
          faturamento_mes: number
          pedidos_hoje: number
          pedidos_mes: number
        }[]
      }
      dashboard_kpis_impl: {
        Args: never
        Returns: {
          aguardando_envio: number
          faturamento_hoje: number
          faturamento_mes: number
          pedidos_hoje: number
          pedidos_mes: number
        }[]
      }
      dashboard_kpis_parcial: {
        Args: {
          p_ate: string
          p_de: string
          p_marketplace?: string
          p_minuto_max: number
        }
        Returns: {
          ads_investimento: number
          ads_pct: number
          cobertura_custo: number
          custo_pct: number
          custo_total: number
          faturamento: number
          imposto: number
          imposto_pct: number
          lucro_com_ads: number
          lucro_com_ads_pct: number
          lucro_medio: number
          lucro_sem_ads: number
          lucro_sem_ads_pct: number
          pedidos_cancelados: number
          pedidos_devolvidos: number
          pedidos_validos: number
          taxas: number
          taxas_pct: number
          ticket_medio: number
          unidades: number
          valor_cancelado: number
          valor_devolvido: number
          valor_liquido: number
        }[]
      }
      dashboard_kpis_parcial_impl: {
        Args: {
          p_ate: string
          p_de: string
          p_marketplace?: string
          p_minuto_max: number
        }
        Returns: {
          ads_investimento: number
          ads_pct: number
          cobertura_custo: number
          custo_pct: number
          custo_total: number
          faturamento: number
          imposto: number
          imposto_pct: number
          lucro_com_ads: number
          lucro_com_ads_pct: number
          lucro_medio: number
          lucro_sem_ads: number
          lucro_sem_ads_pct: number
          pedidos_cancelados: number
          pedidos_devolvidos: number
          pedidos_validos: number
          taxas: number
          taxas_pct: number
          ticket_medio: number
          unidades: number
          valor_cancelado: number
          valor_devolvido: number
          valor_liquido: number
        }[]
      }
      dashboard_kpis_periodo: {
        Args: { p_ate: string; p_de: string; p_marketplace?: string }
        Returns: {
          ads_investimento: number
          ads_pct: number
          cobertura_custo: number
          custo_pct: number
          custo_total: number
          faturamento: number
          imposto: number
          imposto_pct: number
          lucro_com_ads: number
          lucro_com_ads_pct: number
          lucro_medio: number
          lucro_sem_ads: number
          lucro_sem_ads_pct: number
          pedidos_cancelados: number
          pedidos_devolvidos: number
          pedidos_validos: number
          taxas: number
          taxas_pct: number
          ticket_medio: number
          unidades: number
          valor_cancelado: number
          valor_devolvido: number
          valor_liquido: number
        }[]
      }
      dashboard_kpis_periodo_impl: {
        Args: { p_ate: string; p_de: string; p_marketplace?: string }
        Returns: {
          ads_investimento: number
          ads_pct: number
          cobertura_custo: number
          custo_pct: number
          custo_total: number
          faturamento: number
          imposto: number
          imposto_pct: number
          lucro_com_ads: number
          lucro_com_ads_pct: number
          lucro_medio: number
          lucro_sem_ads: number
          lucro_sem_ads_pct: number
          pedidos_cancelados: number
          pedidos_devolvidos: number
          pedidos_validos: number
          taxas: number
          taxas_pct: number
          ticket_medio: number
          unidades: number
          valor_cancelado: number
          valor_devolvido: number
          valor_liquido: number
        }[]
      }
      dashboard_serie_diaria: {
        Args: { p_dias: number }
        Returns: {
          dia: string
          faturamento: number
          pedidos: number
        }[]
      }
      dashboard_serie_diaria_impl: {
        Args: { p_dias?: number }
        Returns: {
          dia: string
          faturamento: number
          pedidos: number
        }[]
      }
      dashboard_serie_horaria: {
        Args: { p_ate: string; p_de: string; p_marketplace?: string }
        Returns: {
          ads_investimento: number
          faturamento: number
          hora: number
          pedidos: number
          rotulo: string
        }[]
      }
      dashboard_serie_horaria_impl: {
        Args: { p_ate: string; p_de: string; p_marketplace?: string }
        Returns: {
          ads_investimento: number
          faturamento: number
          hora: number
          pedidos: number
          rotulo: string
        }[]
      }
      dashboard_serie_periodo: {
        Args: { p_ate: string; p_de: string; p_marketplace?: string }
        Returns: {
          faturamento: number
          pedidos: number
          periodo: string
          rotulo: string
        }[]
      }
      dashboard_serie_periodo_impl: {
        Args: { p_ate: string; p_de: string; p_marketplace?: string }
        Returns: {
          faturamento: number
          parcial: boolean
          pedidos: number
          periodo: string
          rotulo: string
        }[]
      }
      dashboard_top_produtos: {
        Args: { p_dias: number; p_limite: number }
        Returns: {
          produto: string
          quantidade: number
          receita: number
          sku: string
        }[]
      }
      dashboard_top_produtos_impl: {
        Args: { p_dias?: number; p_limite?: number }
        Returns: {
          produto: string
          quantidade: number
          receita: number
          sku: string
        }[]
      }
      dashboard_top_produtos_periodo: {
        Args: {
          p_ate: string
          p_de: string
          p_limite: number
          p_marketplace?: string
        }
        Returns: {
          produto: string
          quantidade: number
          receita: number
          sku: string
        }[]
      }
      dashboard_top_produtos_periodo_impl: {
        Args: {
          p_ate: string
          p_de: string
          p_limite?: number
          p_marketplace?: string
        }
        Returns: {
          produto: string
          quantidade: number
          receita: number
          sku: string
        }[]
      }
      dre_mensal: {
        Args: { p_ano: number; p_mes: number }
        Returns: {
          ads: number
          ads_pct: number
          cancelamentos: number
          cmv: number
          cmv_pct: number
          despesas_fixas: number
          despesas_fixas_pct: number
          despesas_variaveis: number
          despesas_variaveis_pct: number
          devolucoes: number
          devolucoes_pct: number
          impostos: number
          impostos_pct: number
          lucro_bruto: number
          lucro_bruto_pct: number
          lucro_liquido: number
          lucro_liquido_pct: number
          receita_bruta: number
          receita_liquida: number
          resultado_operacional: number
          resultado_operacional_pct: number
          taxas_marketplace: number
          taxas_pct: number
        }[]
      }
      dre_mensal_impl: {
        Args: { p_ano: number; p_mes: number }
        Returns: {
          ads: number
          ads_pct: number
          cancelamentos: number
          cmv: number
          cmv_pct: number
          despesas_fixas: number
          despesas_fixas_pct: number
          impostos: number
          impostos_pct: number
          lucro_bruto: number
          lucro_bruto_pct: number
          lucro_liquido: number
          lucro_liquido_pct: number
          receita_bruta: number
          receita_liquida: number
          resultado_operacional: number
          resultado_operacional_pct: number
          taxas_marketplace: number
          taxas_pct: number
        }[]
      }
      dre_variaveis_detalhe: {
        Args: { p_ano: number; p_mes: number }
        Returns: {
          ciclo_fim: string
          ciclo_inicio: string
          descricao: string
          dia_corte_ciclo: number
          franquia_pedidos: number
          id: number
          pedidos_base: number
          pedidos_cobrados: number
          valor: number
          valor_por_pedido: number
        }[]
      }
      eh_owner: { Args: never; Returns: boolean }
      eh_owner_ou_service_role: { Args: never; Returns: boolean }
      estoque_listar: {
        Args: never
        Returns: {
          ativo: boolean
          descricao: string
          estoque_minimo: number
          id: string
          imagem_url: string
          nome: string
          saldo: number
          unidade: string
          vendidos_30d: number
          vinculos: Json
        }[]
      }
      estoque_movimentar: {
        Args: {
          p_estoque_item_id: string
          p_observacao?: string
          p_quantidade: number
          p_tipo?: string
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ia_schema: { Args: never; Returns: Json }
      ia_sql: { Args: { consulta: string; limite?: number }; Returns: Json }
      pedidos_detalhe: {
        Args: {
          p_ate: string
          p_busca: string
          p_de: string
          p_limite: number
          p_marketplace?: string
          p_offset: number
          p_status: string
        }
        Returns: {
          comprador: string
          custo: number
          data_pedido: string
          frete_vendedor: number
          imagem_url: string
          imposto: number
          lucro: number
          margem_pct: number
          order_sn: string
          produto: string
          quantidade: number
          sku: string
          status: string
          tarifa: number
          tem_escrow: boolean
          total_linhas: number
          valor: number
        }[]
      }
      pedidos_detalhe_impl: {
        Args: {
          p_ate: string
          p_busca?: string
          p_de: string
          p_limite?: number
          p_marketplace?: string
          p_offset?: number
          p_status?: string
        }
        Returns: {
          comprador: string
          custo: number
          data_pedido: string
          frete_vendedor: number
          imagem_url: string
          imposto: number
          lucro: number
          margem_pct: number
          order_sn: string
          produto: string
          quantidade: number
          sku: string
          status: string
          tarifa: number
          tem_escrow: boolean
          total_linhas: number
          valor: number
        }[]
      }
      pedidos_detalhe_totais: {
        Args: {
          p_ate: string
          p_busca: string
          p_de: string
          p_marketplace?: string
          p_status: string
        }
        Returns: {
          custo: number
          frete_vendedor: number
          imposto: number
          linhas: number
          linhas_estimadas: number
          lucro: number
          tarifa: number
          valor: number
        }[]
      }
      pedidos_detalhe_totais_impl: {
        Args: {
          p_ate: string
          p_busca?: string
          p_de: string
          p_marketplace?: string
          p_status?: string
        }
        Returns: {
          custo: number
          frete_vendedor: number
          imposto: number
          linhas: number
          linhas_estimadas: number
          lucro: number
          tarifa: number
          valor: number
        }[]
      }
      pedidos_em_transito: {
        Args: { p_marketplace?: string }
        Returns: {
          cobertura_custo: number
          custo: number
          pedidos: number
          unidades: number
          valor: number
        }[]
      }
      pedidos_em_transito_impl: {
        Args: { p_marketplace?: string }
        Returns: {
          cobertura_custo: number
          custo: number
          pedidos: number
          unidades: number
          valor: number
        }[]
      }
      pedidos_escrow_pendentes: {
        Args: { p_limite?: number }
        Returns: {
          order_sn: string
        }[]
      }
      produtos_com_ads: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          cliques: number
          ctr: number
          impressoes: number
          investimento: number
          item_id: number
          produto: string
          receita_ads: number
          roas: number
        }[]
      }
      produtos_com_giro: {
        Args: { p_ate: string; p_de: string; p_marketplace?: string }
        Returns: {
          dias_de_estoque: number
          estoque_disponivel: number
          imagem_url: string
          item_id: number
          media_diaria: number
          model_id: number
          preco_atual: number
          produto: string
          sku: string
          status_item: string
          variacao: string
          vendidos_periodo: number
        }[]
      }
      produtos_com_giro_impl: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          dias_de_estoque: number
          estoque_disponivel: number
          imagem_url: string
          item_id: number
          media_diaria: number
          model_id: number
          preco_atual: number
          produto: string
          sku: string
          status_item: string
          variacao: string
          vendidos_periodo: number
        }[]
      }
      produtos_giro_ordenado: {
        Args: { p_dias?: number; p_dir?: string; p_sort?: string }
        Returns: {
          custo_unitario: number
          dias_de_estoque: number
          estoque_disponivel: number
          imagem_url: string
          item_id: number
          margem_pct: number
          media_diaria: number
          model_id: number
          preco_atual: number
          produto: string
          sku: string
          status_item: string
          variacao: string
          vendidos_periodo: number
        }[]
      }
      pv_campanha_resultado: { Args: { _campanha: string }; Returns: Json }
      pv_contatos_lista: {
        Args: {
          _busca?: string
          _janela_dias?: number
          _limite?: number
          _offset?: number
        }
        Returns: Json
      }
      pv_materializar_publico: { Args: { _campanha: string }; Returns: number }
      pv_publico: {
        Args: { _f: Json }
        Returns: {
          comprador: string
          conversation_id: string
          pedidos: number
          to_id: string
          total_gasto: number
          ultimo_em: string
          ultimo_produto: string
          ultimo_ticket: number
        }[]
      }
      pv_publico_preview: { Args: { _f: Json }; Returns: Json }
      registrar_custo: {
        Args: {
          p_custo: number
          p_inicio?: string
          p_item_id: number
          p_model_id: number
          p_observacao?: string
        }
        Returns: undefined
      }
      resumo_horarios_aplicar: { Args: never; Returns: number }
      status_disponiveis: {
        Args: never
        Returns: {
          pedidos: number
          status: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
