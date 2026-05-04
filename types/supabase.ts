export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      admin_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      credits: {
        Row: {
          created_at: string
          credits: number
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      headshots: {
        Row: {
          created_at: string
          id: number
          metadata: Json | null
          model_id: number
          uri: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          metadata?: Json | null
          model_id: number
          uri: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          metadata?: Json | null
          model_id?: number
          uri?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "headshots_model_id_fkey"
            columns: ["model_id"]
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "headshots_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      images: {
        Row: {
          created_at: string
          id: number
          modelId: number
          model_id: number | null
          uri: string
        }
        Insert: {
          created_at?: string
          id?: number
          modelId?: number
          model_id?: number
          uri: string
        }
        Update: {
          created_at?: string
          id?: number
          modelId?: number
          model_id?: number
          uri?: string
        }
        Relationships: [
          {
            foreignKeyName: "images_modelId_fkey"
            columns: ["modelId"]
            referencedRelation: "models"
            referencedColumns: ["id"]
          }
        ]
      }
      models: {
        Row: {
          created_at: string
          id: number
          latest_request_id: string | null
          lora_url: string | null
          modelId: string | null
          name: string | null
          processing_status?: string | null
          prompt_options: Json | null
          result_image_url: string | null
          status: string
          type: string | null
          updated_at: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          latest_request_id?: string | null
          lora_url?: string | null
          modelId?: string | null
          name?: string | null
          processing_status?: string | null
          prompt_options?: Json | null
          result_image_url?: string | null
          status?: string
          type?: string | null
          updated_at?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          latest_request_id?: string | null
          lora_url?: string | null
          modelId?: string | null
          name?: string | null
          processing_status?: string | null
          prompt_options?: Json | null
          result_image_url?: string | null
          status?: string
          type?: string | null
          updated_at?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "models_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      pipeline_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          message: string | null
          model_id: number | null
          payload: Json | null
          request_id: string | null
          stage: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          message?: string | null
          model_id?: number | null
          payload?: Json | null
          request_id?: string | null
          stage: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          message?: string | null
          model_id?: number | null
          payload?: Json | null
          request_id?: string | null
          stage?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_events_model_id_fkey"
            columns: ["model_id"]
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_events_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      samples: {
        Row: {
          created_at: string
          id: number
          modelId: number
          uri: string
        }
        Insert: {
          created_at?: string
          id?: number
          modelId: number
          uri: string
        }
        Update: {
          created_at?: string
          id?: number
          modelId?: number
          uri?: string
        }
        Relationships: [
          {
            foreignKeyName: "samples_modelId_fkey"
            columns: ["modelId"]
            referencedRelation: "models"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      merge_pipeline_indexed_result: {
        Args: {
          p_model_id: number
          p_user_id: string
          p_results_key: string
          p_slot: number
          p_url: string
          p_expected?: number
        }
        Returns: {
          filled_count: number
          results: Json
          became_complete: boolean
        }[]
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
