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
      articles: {
        Row: {
          active: boolean
          article_number: string
          category_code: string | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          note: string | null
          packaging_unit: string | null
          requires_charge_or_haspel: boolean
          sort_order: number
          source: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          article_number: string
          category_code?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          note?: string | null
          packaging_unit?: string | null
          requires_charge_or_haspel?: boolean
          sort_order?: number
          source?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          article_number?: string
          category_code?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          note?: string | null
          packaging_unit?: string | null
          requires_charge_or_haspel?: boolean
          sort_order?: number
          source?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      case_material_lines: {
        Row: {
          article_id: string | null
          article_number: string | null
          case_id: string
          category_code: string | null
          category_id: string | null
          charge_or_haspel_number: string | null
          created_at: string
          description: string | null
          id: string
          is_auto_generated: boolean
          is_manual: boolean
          note: string | null
          quantity: number
          return_quantity: number
          sort_order: number
          source_rule: string | null
          total_quantity: number
          unit: string | null
          updated_at: string
          used_quantity: number
        }
        Insert: {
          article_id?: string | null
          article_number?: string | null
          case_id: string
          category_code?: string | null
          category_id?: string | null
          charge_or_haspel_number?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_auto_generated?: boolean
          is_manual?: boolean
          note?: string | null
          quantity?: number
          return_quantity?: number
          sort_order?: number
          source_rule?: string | null
          total_quantity?: number
          unit?: string | null
          updated_at?: string
          used_quantity?: number
        }
        Update: {
          article_id?: string | null
          article_number?: string | null
          case_id?: string
          category_code?: string | null
          category_id?: string | null
          charge_or_haspel_number?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_auto_generated?: boolean
          is_manual?: boolean
          note?: string | null
          quantity?: number
          return_quantity?: number
          sort_order?: number
          source_rule?: string | null
          total_quantity?: number
          unit?: string | null
          updated_at?: string
          used_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_material_lines_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_material_lines_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_material_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      case_order_lines: {
        Row: {
          article_number: string | null
          case_id: string
          created_at: string
          customer_quantity: number
          description: string | null
          id: string
          match_status: string
          matched_liander_assortment_item_id: string | null
          note: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          article_number?: string | null
          case_id: string
          created_at?: string
          customer_quantity?: number
          description?: string | null
          id?: string
          match_status?: string
          matched_liander_assortment_item_id?: string | null
          note?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          article_number?: string | null
          case_id?: string
          created_at?: string
          customer_quantity?: number
          description?: string | null
          id?: string
          match_status?: string
          matched_liander_assortment_item_id?: string | null
          note?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_order_lines_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_order_lines_matched_liander_assortment_item_id_fkey"
            columns: ["matched_liander_assortment_item_id"]
            isOneToOne: false
            referencedRelation: "liander_assortment_items"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          asp_sap_code: string | null
          case_date: string | null
          case_number: string | null
          contact_person: string | null
          created_at: string
          delivery_address: string | null
          description: string | null
          export_stale: boolean
          id: string
          internal_note: string | null
          last_exported_at: string | null
          last_material_change_at: string | null
          last_verkooporder_rebuild_at: string | null
          project_number: string | null
          so_customernumber: string | null
          so_number: string | null
          so_project: string | null
          status: string
          template_version: string | null
          updated_at: string
        }
        Insert: {
          asp_sap_code?: string | null
          case_date?: string | null
          case_number?: string | null
          contact_person?: string | null
          created_at?: string
          delivery_address?: string | null
          description?: string | null
          export_stale?: boolean
          id?: string
          internal_note?: string | null
          last_exported_at?: string | null
          last_material_change_at?: string | null
          last_verkooporder_rebuild_at?: string | null
          project_number?: string | null
          so_customernumber?: string | null
          so_number?: string | null
          so_project?: string | null
          status?: string
          template_version?: string | null
          updated_at?: string
        }
        Update: {
          asp_sap_code?: string | null
          case_date?: string | null
          case_number?: string | null
          contact_person?: string | null
          created_at?: string
          delivery_address?: string | null
          description?: string | null
          export_stale?: boolean
          id?: string
          internal_note?: string | null
          last_exported_at?: string | null
          last_material_change_at?: string | null
          last_verkooporder_rebuild_at?: string | null
          project_number?: string | null
          so_customernumber?: string | null
          so_number?: string | null
          so_project?: string | null
          status?: string
          template_version?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          category_code: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_code?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_code?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      export_logs: {
        Row: {
          case_id: string | null
          created_at: string
          error_message: string | null
          export_type: string
          exported_at: string
          exported_by: string | null
          file_name: string | null
          id: string
          row_count: number
          status: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          error_message?: string | null
          export_type?: string
          exported_at?: string
          exported_by?: string | null
          file_name?: string | null
          id?: string
          row_count?: number
          status?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          error_message?: string | null
          export_type?: string
          exported_at?: string
          exported_by?: string | null
          file_name?: string | null
          id?: string
          row_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      haspel_numbers: {
        Row: {
          article_number: string | null
          case_id: string
          charge_or_haspel_number: string | null
          created_at: string
          description: string | null
          id: string
          note: string | null
        }
        Insert: {
          article_number?: string | null
          case_id: string
          charge_or_haspel_number?: string | null
          created_at?: string
          description?: string | null
          id?: string
          note?: string | null
        }
        Update: {
          article_number?: string | null
          case_id?: string
          charge_or_haspel_number?: string | null
          created_at?: string
          description?: string | null
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "haspel_numbers_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      liander_assortment_imports: {
        Row: {
          created_at: string
          error_message: string | null
          file_name: string | null
          header_row_index: number | null
          id: string
          import_date: string
          imported_by: string | null
          inactive_items_count: number
          new_items_count: number
          sheet_name: string | null
          skipped_rows_count: number
          status: string
          total_rows: number
          updated_items_count: number
          warnings: Json | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          header_row_index?: number | null
          id?: string
          import_date?: string
          imported_by?: string | null
          inactive_items_count?: number
          new_items_count?: number
          sheet_name?: string | null
          skipped_rows_count?: number
          status?: string
          total_rows?: number
          updated_items_count?: number
          warnings?: Json | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          header_row_index?: number | null
          id?: string
          import_date?: string
          imported_by?: string | null
          inactive_items_count?: number
          new_items_count?: number
          sheet_name?: string | null
          skipped_rows_count?: number
          status?: string
          total_rows?: number
          updated_items_count?: number
          warnings?: Json | null
        }
        Relationships: []
      }
      liander_assortment_items: {
        Row: {
          active: boolean
          article_number: string
          created_at: string
          customer_quantity_field_name: string | null
          description: string | null
          id: string
          import_id: string | null
          raw_data: Json | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          article_number: string
          created_at?: string
          customer_quantity_field_name?: string | null
          description?: string | null
          id?: string
          import_id?: string | null
          raw_data?: Json | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          article_number?: string
          created_at?: string
          customer_quantity_field_name?: string | null
          description?: string | null
          id?: string
          import_id?: string | null
          raw_data?: Json | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liander_assortment_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "liander_assortment_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      verkooporder_lines: {
        Row: {
          case_id: string
          created_at: string
          id: string
          so_customernumber: string | null
          so_number: string | null
          so_project: string | null
          sol_articlenumber: string | null
          sol_quantity: number
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          so_customernumber?: string | null
          so_number?: string | null
          so_project?: string | null
          sol_articlenumber?: string | null
          sol_quantity?: number
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          so_customernumber?: string | null
          so_number?: string | null
          so_project?: string | null
          sol_articlenumber?: string | null
          sol_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verkooporder_lines_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
