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
          excel_row_number: number | null
          formula_source_text: string | null
          formula_status: string | null
          id: string
          is_auto_generated: boolean
          is_manual: boolean
          note: string | null
          quantity: number
          return_quantity: number
          sort_order: number
          source_rule: string | null
          source_template_id: string | null
          template_line_id: string | null
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
          excel_row_number?: number | null
          formula_source_text?: string | null
          formula_status?: string | null
          id?: string
          is_auto_generated?: boolean
          is_manual?: boolean
          note?: string | null
          quantity?: number
          return_quantity?: number
          sort_order?: number
          source_rule?: string | null
          source_template_id?: string | null
          template_line_id?: string | null
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
          excel_row_number?: number | null
          formula_source_text?: string | null
          formula_status?: string | null
          id?: string
          is_auto_generated?: boolean
          is_manual?: boolean
          note?: string | null
          quantity?: number
          return_quantity?: number
          sort_order?: number
          source_rule?: string | null
          source_template_id?: string | null
          template_line_id?: string | null
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
      case_template_applications: {
        Row: {
          applied_at: string
          applied_by: string | null
          case_id: string
          created_at: string
          id: string
          lines_created_count: number
          note: string | null
          status: string
          template_id: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          case_id: string
          created_at?: string
          id?: string
          lines_created_count?: number
          note?: string | null
          status?: string
          template_id: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          case_id?: string
          created_at?: string
          id?: string
          lines_created_count?: number
          note?: string | null
          status?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_template_applications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "material_templates"
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
      material_template_lines: {
        Row: {
          article_number: string | null
          category_code: string | null
          category_id: string | null
          created_at: string
          default_quantity: number | null
          default_return_quantity: number | null
          default_total_quantity: number | null
          default_used_quantity: number | null
          description: string | null
          excel_category_id: number | null
          excel_row_number: number | null
          formula_references: Json | null
          id: string
          is_blank_or_separator: boolean
          is_formula_quantity: boolean
          is_section_header: boolean
          note: string | null
          quantity_formula_text: string | null
          sort_order: number
          source_type: string | null
          template_id: string
          total_formula_text: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          article_number?: string | null
          category_code?: string | null
          category_id?: string | null
          created_at?: string
          default_quantity?: number | null
          default_return_quantity?: number | null
          default_total_quantity?: number | null
          default_used_quantity?: number | null
          description?: string | null
          excel_category_id?: number | null
          excel_row_number?: number | null
          formula_references?: Json | null
          id?: string
          is_blank_or_separator?: boolean
          is_formula_quantity?: boolean
          is_section_header?: boolean
          note?: string | null
          quantity_formula_text?: string | null
          sort_order?: number
          source_type?: string | null
          template_id: string
          total_formula_text?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          article_number?: string | null
          category_code?: string | null
          category_id?: string | null
          created_at?: string
          default_quantity?: number | null
          default_return_quantity?: number | null
          default_total_quantity?: number | null
          default_used_quantity?: number | null
          description?: string | null
          excel_category_id?: number | null
          excel_row_number?: number | null
          formula_references?: Json | null
          id?: string
          is_blank_or_separator?: boolean
          is_formula_quantity?: boolean
          is_section_header?: boolean
          note?: string | null
          quantity_formula_text?: string | null
          sort_order?: number
          source_type?: string | null
          template_id?: string
          total_formula_text?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_template_lines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "material_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      material_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          notes: string | null
          source_file_name: string | null
          source_sheet_name: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          source_file_name?: string | null
          source_sheet_name?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          source_file_name?: string | null
          source_sheet_name?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: []
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
      _mark_case_material_dirty: {
        Args: { p_case_id: string }
        Returns: undefined
      }
      apply_material_template_to_case: {
        Args: { p_case_id: string; p_mode?: string; p_template_id: string }
        Returns: Json
      }
      bulk_add_case_material_lines: {
        Args: { p_case_id: string; p_lines: Json }
        Returns: Json
      }
      get_case_material_lines_with_status: {
        Args: { p_case_id: string }
        Returns: {
          article_id: string
          article_number: string
          case_id: string
          category_code: string
          category_id: string
          charge_or_haspel_number: string
          created_at: string
          description: string
          excel_row_number: number
          formula_source_text: string
          formula_status: string
          id: string
          is_auto_generated: boolean
          is_manual: boolean
          liander_description: string
          liander_status: string
          liander_unit: string
          note: string
          quantity: number
          return_quantity: number
          sort_order: number
          source_rule: string
          source_template_id: string
          template_line_id: string
          total_quantity: number
          unit: string
          updated_at: string
          used_quantity: number
        }[]
      }
      lookup_material_articles: {
        Args: { p_article_numbers: string[] }
        Returns: {
          article_id: string
          article_number: string
          category_code: string
          category_id: string
          description: string
          found: boolean
          liander_status: string
          source: string
          unit: string
        }[]
      }
      mark_case_as_material_dirty: {
        Args: { p_case_id: string }
        Returns: undefined
      }
      move_case_material_line_to_category: {
        Args: { p_case_id: string; p_category_id: string; p_line_id: string }
        Returns: Json
      }
      normalize_case_material_sort_order: {
        Args: { p_case_id: string }
        Returns: Json
      }
      process_liander_assortment_import: {
        Args: {
          p_file_name: string
          p_header_row_index: number
          p_imported_by?: string
          p_rows: Json
          p_sheet_name: string
          p_skipped_rows: number
          p_total_rows: number
          p_warnings: Json
        }
        Returns: Json
      }
      rebuild_case_order_lines: { Args: { p_case_id: string }; Returns: Json }
      reorder_case_material_line: {
        Args: { p_case_id: string; p_direction: string; p_line_id: string }
        Returns: Json
      }
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
