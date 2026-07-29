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
      config: {
        Row: {
          eventos: Json
          id: number
          limite_estoque_baixo: number
          notificacoes_ativas: boolean
          updated_at: string
          webhook_whatsapp_url: string | null
        }
        Insert: {
          eventos?: Json
          id?: number
          limite_estoque_baixo?: number
          notificacoes_ativas?: boolean
          updated_at?: string
          webhook_whatsapp_url?: string | null
        }
        Update: {
          eventos?: Json
          id?: number
          limite_estoque_baixo?: number
          notificacoes_ativas?: boolean
          updated_at?: string
          webhook_whatsapp_url?: string | null
        }
        Relationships: []
      }
      dim_produto: {
        Row: {
          atualizado_em: string
          categoria: string | null
          custo_unitario: number | null
          item_id: number | null
          produto: string | null
          sku: string
        }
        Insert: {
          atualizado_em?: string
          categoria?: string | null
          custo_unitario?: number | null
          item_id?: number | null
          produto?: string | null
          sku: string
        }
        Update: {
          atualizado_em?: string
          categoria?: string | null
          custo_unitario?: number | null
          item_id?: number | null
          produto?: string | null
          sku?: string
        }
        Relationships: []
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
      pedido_itens: {
        Row: {
          created_at: string
          data_criacao_pedido: string | null
          id: number
          item_id: number
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
          comprador_username: string | null
          created_at: string
          data_criacao_pedido: string | null
          data_pagamento: string | null
          escrow_atualizado_em: string | null
          frete_real: number | null
          id: string
          itens: Json | null
          moeda: string | null
          order_sn: string
          payload: Json | null
          payload_json: Json | null
          qtd_itens: number | null
          status: string | null
          updated_at: string
          valor_liquido: number | null
          valor_total: number | null
        }
        Insert: {
          comprador_username?: string | null
          created_at?: string
          data_criacao_pedido?: string | null
          data_pagamento?: string | null
          escrow_atualizado_em?: string | null
          frete_real?: number | null
          id?: string
          itens?: Json | null
          moeda?: string | null
          order_sn: string
          payload?: Json | null
          payload_json?: Json | null
          qtd_itens?: number | null
          status?: string | null
          updated_at?: string
          valor_liquido?: number | null
          valor_total?: number | null
        }
        Update: {
          comprador_username?: string | null
          created_at?: string
          data_criacao_pedido?: string | null
          data_pagamento?: string | null
          escrow_atualizado_em?: string | null
          frete_real?: number | null
          id?: string
          itens?: Json | null
          moeda?: string | null
          order_sn?: string
          payload?: Json | null
          payload_json?: Json | null
          qtd_itens?: number | null
          status?: string | null
          updated_at?: string
          valor_liquido?: number | null
          valor_total?: number | null
        }
        Relationships: []
      }
      produtos: {
        Row: {
          estoque: number | null
          id: string
          item_id: number
          nome: string | null
          preco: number | null
          sku: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          estoque?: number | null
          id?: string
          item_id: number
          nome?: string | null
          preco?: number | null
          sku?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          estoque?: number | null
          id?: string
          item_id?: number
          nome?: string | null
          preco?: number | null
          sku?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shopee_connection: {
        Row: {
          access_token: string | null
          id: number
          refresh_token: string | null
          shop_id: number | null
          shop_name: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          id?: number
          refresh_token?: string | null
          shop_id?: number | null
          shop_name?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          id?: number
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
    }
    Views: {
      shopee_connection_status: {
        Row: {
          id: number | null
          shop_id: number | null
          shop_name: string | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number | null
          shop_id?: number | null
          shop_name?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number | null
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
      dashboard_kpis_periodo: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          cobertura_liquido: number
          faturamento_total: number
          itens_vendidos: number
          pedidos_cancelados: number
          pedidos_total: number
          pedidos_validos: number
          ticket_medio: number
          valor_liquido: number
        }[]
      }
      dashboard_serie_diaria: {
        Args: { p_dias?: number }
        Returns: {
          dia: string
          faturamento: number
          pedidos: number
        }[]
      }
      dashboard_serie_periodo: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          faturamento: number
          parcial: boolean
          pedidos: number
          periodo: string
          rotulo: string
        }[]
      }
      dashboard_top_produtos: {
        Args: { p_dias?: number; p_limite?: number }
        Returns: {
          produto: string
          quantidade: number
          receita: number
          sku: string
        }[]
      }
      dashboard_top_produtos_periodo: {
        Args: { p_ate: string; p_de: string; p_limite?: number }
        Returns: {
          produto: string
          quantidade: number
          receita: number
          sku: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
