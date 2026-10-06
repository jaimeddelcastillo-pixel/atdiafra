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
      areas_clasificadas: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          hvac_id: string | null
          id: string
          iso: Database["public"]["Enums"]["iso_clase"]
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          hvac_id?: string | null
          id?: string
          iso: Database["public"]["Enums"]["iso_clase"]
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          hvac_id?: string | null
          id?: string
          iso?: Database["public"]["Enums"]["iso_clase"]
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_clasificadas_hvac_id_fkey"
            columns: ["hvac_id"]
            isOneToOne: false
            referencedRelation: "sistemas_hvac"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      cambios_filtro: {
        Row: {
          created_at: string
          fecha: string
          id: string
          instrumento_id: string
          nota: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fecha: string
          id?: string
          instrumento_id: string
          nota?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          instrumento_id?: string
          nota?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cambios_filtro_instrumento_id_fkey"
            columns: ["instrumento_id"]
            isOneToOne: false
            referencedRelation: "instrumentos"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      instrumentos: {
        Row: {
          activo: boolean
          area_id: string | null
          area_libre: string | null
          baseline_pa: number | null
          baseline_tolerancia_pct: number | null
          codigo: string
          codigo_bitacora: string | null
          created_at: string
          dp_final_fabricante: number | null
          especificacion: string | null
          id: string
          lie_pa: number | null
          lse_pa: number | null
          parametro: string
          tipo: Database["public"]["Enums"]["instrumento_tipo"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          area_id?: string | null
          area_libre?: string | null
          baseline_pa?: number | null
          baseline_tolerancia_pct?: number | null
          codigo: string
          codigo_bitacora?: string | null
          created_at?: string
          dp_final_fabricante?: number | null
          especificacion?: string | null
          id?: string
          lie_pa?: number | null
          lse_pa?: number | null
          parametro: string
          tipo: Database["public"]["Enums"]["instrumento_tipo"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          area_id?: string | null
          area_libre?: string | null
          baseline_pa?: number | null
          baseline_tolerancia_pct?: number | null
          codigo?: string
          codigo_bitacora?: string | null
          created_at?: string
          dp_final_fabricante?: number | null
          especificacion?: string | null
          id?: string
          lie_pa?: number | null
          lse_pa?: number | null
          parametro?: string
          tipo?: Database["public"]["Enums"]["instrumento_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instrumentos_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas_clasificadas"
            referencedColumns: ["id"]
          },
        ]
      }
      objetivos_presion: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          cuarto_x_id: string | null
          cuarto_y_id: string | null
          id: string
          instrumento_id: string | null
          iso: string | null
          lie_pa: number | null
          limite_normativo_pa: number | null
          lse_pa: number | null
          nombre: string
          par_cuartos_id: string | null
          tipo: Database["public"]["Enums"]["tipo_objetivo_presion"]
          unidad: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          cuarto_x_id?: string | null
          cuarto_y_id?: string | null
          id?: string
          instrumento_id?: string | null
          iso?: string | null
          lie_pa?: number | null
          limite_normativo_pa?: number | null
          lse_pa?: number | null
          nombre: string
          par_cuartos_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_objetivo_presion"]
          unidad?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          cuarto_x_id?: string | null
          cuarto_y_id?: string | null
          id?: string
          instrumento_id?: string | null
          iso?: string | null
          lie_pa?: number | null
          limite_normativo_pa?: number | null
          lse_pa?: number | null
          nombre?: string
          par_cuartos_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_objetivo_presion"]
          unidad?: string
          updated_at?: string
        }
        Relationships: []
      }
      registro_semanas: {
        Row: {
          anio: string
          created_at: string
          foto_path: string | null
          id: string
          lecturas: Json
          lecturas_hr: Json | null
          mes: string
          objetivo_presion_id: string | null
          observaciones: string
          registro_id: string
          saved_at: string
          semana_inicio: string
          source: string
          unidad: string
          updated_at: string
        }
        Insert: {
          anio: string
          created_at?: string
          foto_path?: string | null
          id?: string
          lecturas?: Json
          lecturas_hr?: Json | null
          mes: string
          objetivo_presion_id?: string | null
          observaciones?: string
          registro_id: string
          saved_at?: string
          semana_inicio: string
          source?: string
          unidad: string
          updated_at?: string
        }
        Update: {
          anio?: string
          created_at?: string
          foto_path?: string | null
          id?: string
          lecturas?: Json
          lecturas_hr?: Json | null
          mes?: string
          objetivo_presion_id?: string | null
          observaciones?: string
          registro_id?: string
          saved_at?: string
          semana_inicio?: string
          source?: string
          unidad?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registro_semanas_registro_id_fkey"
            columns: ["registro_id"]
            isOneToOne: false
            referencedRelation: "registros"
            referencedColumns: ["id"]
          },
        ]
      }
      registros: {
        Row: {
          activo: boolean
          area_id: string | null
          codigo_area_libre: string | null
          created_at: string
          etapa: string | null
          hvac_id: string | null
          id: string
          instrumento_id: string | null
          iso: string | null
          lie: number | null
          lie_hr: number | null
          lie_t: number | null
          lse: number | null
          lse_hr: number | null
          lse_t: number | null
          modulo: string
          nombre: string
          nombre_area_libre: string | null
          par_cuartos_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          area_id?: string | null
          codigo_area_libre?: string | null
          created_at?: string
          etapa?: string | null
          hvac_id?: string | null
          id?: string
          instrumento_id?: string | null
          iso?: string | null
          lie?: number | null
          lie_hr?: number | null
          lie_t?: number | null
          lse?: number | null
          lse_hr?: number | null
          lse_t?: number | null
          modulo: string
          nombre: string
          nombre_area_libre?: string | null
          par_cuartos_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          area_id?: string | null
          codigo_area_libre?: string | null
          created_at?: string
          etapa?: string | null
          hvac_id?: string | null
          id?: string
          instrumento_id?: string | null
          iso?: string | null
          lie?: number | null
          lie_hr?: number | null
          lie_t?: number | null
          lse?: number | null
          lse_hr?: number | null
          lse_t?: number | null
          modulo?: string
          nombre?: string
          nombre_area_libre?: string | null
          par_cuartos_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sistemas_hvac: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string
          etapas: string[]
          id: string
          nombre_uma: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion: string
          etapas?: string[]
          id?: string
          nombre_uma: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string
          etapas?: string[]
          id?: string
          nombre_uma?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      [_ in never]: never
    }
    Functions: {
      can_write_catalogs: { Args: { _user_id: string }; Returns: boolean }
      can_write_records: { Args: { _user_id: string }; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "editor" | "viewer"
      instrumento_tipo:
        | "termohigrometro"
        | "manometro_filtro"
        | "manometro_diferencial"
        | "otro"
      iso_clase:
        | "ISO-5"
        | "ISO-7"
        | "ISO-8"
        | "ISO-9"
        | "ISO-6"
        | "No clasificada"
      tipo_objetivo_presion: "par_cuartos"
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
      app_role: ["super_admin", "admin", "editor", "viewer"],
      instrumento_tipo: [
        "termohigrometro",
        "manometro_filtro",
        "manometro_diferencial",
        "otro",
      ],
      iso_clase: [
        "ISO-5",
        "ISO-7",
        "ISO-8",
        "ISO-9",
        "ISO-6",
        "No clasificada",
      ],
      tipo_objetivo_presion: ["par_cuartos"],
    },
  },
} as const
