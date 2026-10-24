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
      admin_roles: {
        Row: {
          created_at: string
          id: string
          permissions: string[]
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: string[]
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: string[]
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_commissions: {
        Row: {
          affiliate_id: string
          base_amount_cents: number
          business_id: string | null
          commission_amount_cents: number
          commission_pct: number
          created_at: string
          currency: string
          id: string
          payout_id: string | null
          reversed_reason: string | null
          source_event_id: string | null
          status: string
          stripe_invoice_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_id: string
          base_amount_cents: number
          business_id?: string | null
          commission_amount_cents: number
          commission_pct: number
          created_at?: string
          currency?: string
          id?: string
          payout_id?: string | null
          reversed_reason?: string | null
          source_event_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_id?: string
          base_amount_cents?: number
          business_id?: string | null
          commission_amount_cents?: number
          commission_pct?: number
          created_at?: string
          currency?: string
          id?: string
          payout_id?: string | null
          reversed_reason?: string | null
          source_event_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_payout_fk"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "affiliate_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          affiliate_id: string
          amount_cents: number
          created_at: string
          created_by: string
          currency: string
          id: string
          method: string | null
          note: string | null
          paid_at: string
          reference: string | null
        }
        Insert: {
          affiliate_id: string
          amount_cents: number
          created_at?: string
          created_by: string
          currency?: string
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string
          reference?: string | null
        }
        Update: {
          affiliate_id?: string
          amount_cents?: number
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          method?: string | null
          note?: string | null
          paid_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          affiliate_number: string
          commission_pct: number
          created_at: string
          created_by: string
          email: string | null
          id: string
          name: string
          notes: string | null
          payouts_held: boolean
          phone: string | null
          status: string
          tax_form_on_file: boolean
          tax_form_received_at: string | null
          tax_form_type: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          affiliate_number: string
          commission_pct?: number
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          payouts_held?: boolean
          phone?: string | null
          status?: string
          tax_form_on_file?: boolean
          tax_form_received_at?: string | null
          tax_form_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          affiliate_number?: string
          commission_pct?: number
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          payouts_held?: boolean
          phone?: string | null
          status?: string
          tax_form_on_file?: boolean
          tax_form_received_at?: string | null
          tax_form_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          segment: Json
          sent_at: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          segment?: Json
          sent_at?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          segment?: Json
          sent_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bans: {
        Row: {
          banned_by: string | null
          business_id: string | null
          created_at: string
          id: string
          reason: string | null
          room_id: string | null
          user_id: string
        }
        Insert: {
          banned_by?: string | null
          business_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          room_id?: string | null
          user_id: string
        }
        Update: {
          banned_by?: string | null
          business_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          room_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bans_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bans_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bans_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_games: {
        Row: {
          business_id: string
          enabled: boolean
          game_key: string
          updated_at: string
        }
        Insert: {
          business_id: string
          enabled?: boolean
          game_key: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          enabled?: boolean
          game_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_games_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_games_game_key_fkey"
            columns: ["game_key"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["key"]
          },
        ]
      }
      business_verifications: {
        Row: {
          business_id: string
          code_date: string | null
          created_at: string
          daily_code: string | null
          id: string
          identity_status: string
          selfie_url: string | null
          sms_code: string | null
          sms_expires_at: string | null
          sms_verified: boolean
          updated_at: string
        }
        Insert: {
          business_id: string
          code_date?: string | null
          created_at?: string
          daily_code?: string | null
          id?: string
          identity_status?: string
          selfie_url?: string | null
          sms_code?: string | null
          sms_expires_at?: string | null
          sms_verified?: boolean
          updated_at?: string
        }
        Update: {
          business_id?: string
          code_date?: string | null
          created_at?: string
          daily_code?: string | null
          id?: string
          identity_status?: string
          selfie_url?: string | null
          sms_code?: string | null
          sms_expires_at?: string | null
          sms_verified?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_verifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          affiliate_attributed_at: string | null
          affiliate_attribution_source: string | null
          brand_kit: Json
          category: string | null
          city: string | null
          country: string
          cover_url: string | null
          created_at: string
          dashboard_palette_id: number | null
          dashboard_theme_id: number
          description: string | null
          event_ends_at: string | null
          event_starts_at: string | null
          external_menu_url: string | null
          gallery_urls: string[]
          geofence_polygon: Json | null
          geofence_radius_m: number | null
          hours: Json
          icon_emoji: string | null
          icon_url: string | null
          id: string
          is_active: boolean
          is_temporary: boolean
          is_verified: boolean
          kds_settings: Json
          lat: number | null
          latitude: number | null
          lng: number | null
          logo_url: string | null
          longitude: number | null
          menu_card_effect: string
          menu_enabled: boolean
          menu_language_mode: string
          menu_mode: string
          menu_palette_id: string | null
          menu_primary_language: string
          menu_template_id: string
          name: string
          owner_id: string
          payout_frequency: string
          phone: string | null
          pickup_enabled: boolean
          plan: string
          pos_payment_mode: string
          radius_m: number
          receipt_brand_color: string | null
          receipt_template_id: string
          referred_by_affiliate_id: string | null
          reservation_capacity: number | null
          sales_location_id: string | null
          slug: string
          state: string | null
          status: string
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          subdomain: string | null
          table_subchat_base_name: string | null
          table_subchats_enabled: boolean
          tax_rate: number | null
          timezone: string
          tip_percentages: number[]
          tips_enabled: boolean
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          affiliate_attributed_at?: string | null
          affiliate_attribution_source?: string | null
          brand_kit?: Json
          category?: string | null
          city?: string | null
          country?: string
          cover_url?: string | null
          created_at?: string
          dashboard_palette_id?: number | null
          dashboard_theme_id?: number
          description?: string | null
          event_ends_at?: string | null
          event_starts_at?: string | null
          external_menu_url?: string | null
          gallery_urls?: string[]
          geofence_polygon?: Json | null
          geofence_radius_m?: number | null
          hours?: Json
          icon_emoji?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_temporary?: boolean
          is_verified?: boolean
          kds_settings?: Json
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          logo_url?: string | null
          longitude?: number | null
          menu_card_effect?: string
          menu_enabled?: boolean
          menu_language_mode?: string
          menu_mode?: string
          menu_palette_id?: string | null
          menu_primary_language?: string
          menu_template_id?: string
          name: string
          owner_id: string
          payout_frequency?: string
          phone?: string | null
          pickup_enabled?: boolean
          plan?: string
          pos_payment_mode?: string
          radius_m?: number
          receipt_brand_color?: string | null
          receipt_template_id?: string
          referred_by_affiliate_id?: string | null
          reservation_capacity?: number | null
          sales_location_id?: string | null
          slug: string
          state?: string | null
          status?: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          subdomain?: string | null
          table_subchat_base_name?: string | null
          table_subchats_enabled?: boolean
          tax_rate?: number | null
          timezone?: string
          tip_percentages?: number[]
          tips_enabled?: boolean
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          affiliate_attributed_at?: string | null
          affiliate_attribution_source?: string | null
          brand_kit?: Json
          category?: string | null
          city?: string | null
          country?: string
          cover_url?: string | null
          created_at?: string
          dashboard_palette_id?: number | null
          dashboard_theme_id?: number
          description?: string | null
          event_ends_at?: string | null
          event_starts_at?: string | null
          external_menu_url?: string | null
          gallery_urls?: string[]
          geofence_polygon?: Json | null
          geofence_radius_m?: number | null
          hours?: Json
          icon_emoji?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_temporary?: boolean
          is_verified?: boolean
          kds_settings?: Json
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          logo_url?: string | null
          longitude?: number | null
          menu_card_effect?: string
          menu_enabled?: boolean
          menu_language_mode?: string
          menu_mode?: string
          menu_palette_id?: string | null
          menu_primary_language?: string
          menu_template_id?: string
          name?: string
          owner_id?: string
          payout_frequency?: string
          phone?: string | null
          pickup_enabled?: boolean
          plan?: string
          pos_payment_mode?: string
          radius_m?: number
          receipt_brand_color?: string | null
          receipt_template_id?: string
          referred_by_affiliate_id?: string | null
          reservation_capacity?: number | null
          sales_location_id?: string | null
          slug?: string
          state?: string | null
          status?: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          subdomain?: string | null
          table_subchat_base_name?: string | null
          table_subchats_enabled?: boolean
          tax_rate?: number | null
          timezone?: string
          tip_percentages?: number[]
          tips_enabled?: boolean
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "businesses_referred_by_affiliate_id_fkey"
            columns: ["referred_by_affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "businesses_sales_location_id_fkey"
            columns: ["sales_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          business_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          base_template: string | null
          business_id: string
          created_at: string
          id: string
          name: string
          permissions: Json
        }
        Insert: {
          base_template?: string | null
          business_id: string
          created_at?: string
          id?: string
          name: string
          permissions?: Json
        }
        Update: {
          base_template?: string | null
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          permissions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          amount_cents: number | null
          created_at: string
          description: string | null
          escalated_at: string | null
          id: string
          opened_by: string
          order_id: string
          reason: string
          refund_id: string | null
          resolution: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          description?: string | null
          escalated_at?: string | null
          id?: string
          opened_by: string
          order_id: string
          reason: string
          refund_id?: string | null
          resolution?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          description?: string | null
          escalated_at?: string | null
          id?: string
          opened_by?: string
          order_id?: string
          reason?: string
          refund_id?: string | null
          resolution?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_conversations: {
        Row: {
          awaiting_reply: boolean
          created_at: string
          ephemeral_business_id: string | null
          exit_hidden_at_a: string | null
          exit_hidden_at_b: string | null
          first_sender_id: string | null
          hidden_at_a: string | null
          hidden_at_b: string | null
          id: string
          last_message_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          awaiting_reply?: boolean
          created_at?: string
          ephemeral_business_id?: string | null
          exit_hidden_at_a?: string | null
          exit_hidden_at_b?: string | null
          first_sender_id?: string | null
          hidden_at_a?: string | null
          hidden_at_b?: string | null
          id?: string
          last_message_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          awaiting_reply?: boolean
          created_at?: string
          ephemeral_business_id?: string | null
          exit_hidden_at_a?: string | null
          exit_hidden_at_b?: string | null
          first_sender_id?: string | null
          hidden_at_a?: string | null
          hidden_at_b?: string | null
          id?: string
          last_message_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_conversations_ephemeral_business_id_fkey"
            columns: ["ephemeral_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_first_sender_id_fkey"
            columns: ["first_sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_first_sender_id_fkey"
            columns: ["first_sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_conversations_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          gift_offer_id: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          media_moderated_at: string | null
          media_moderation: string | null
          media_moderation_scores: Json | null
          media_url: string | null
          read_at: string | null
          sender_id: string
          voice_duration_s: number | null
          voice_url: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          gift_offer_id?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          media_moderated_at?: string | null
          media_moderation?: string | null
          media_moderation_scores?: Json | null
          media_url?: string | null
          read_at?: string | null
          sender_id: string
          voice_duration_s?: number | null
          voice_url?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          gift_offer_id?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          media_moderated_at?: string | null
          media_moderation?: string | null
          media_moderation_scores?: Json | null
          media_url?: string | null
          read_at?: string | null
          sender_id?: string
          voice_duration_s?: number | null
          voice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_gift_offer_id_fkey"
            columns: ["gift_offer_id"]
            isOneToOne: false
            referencedRelation: "gift_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          business_id: string
          created_at: string
          custom_role_id: string | null
          id: string
          last_active_at: string | null
          receipt_display_name: string | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          custom_role_id?: string | null
          id?: string
          last_active_at?: string | null
          receipt_display_name?: string | null
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          custom_role_id?: string | null
          id?: string
          last_active_at?: string | null
          receipt_display_name?: string | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_requests: {
        Row: {
          created_at: string
          id: string
          requester_id: string
          status: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      game_optins: {
        Row: {
          business_id: string
          created_at: string
          game_key: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          game_key: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          game_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_optins_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_optins_game_key_fkey"
            columns: ["game_key"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "game_optins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_optins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          is_active: boolean
          key: string
          name_en: string
          name_es: string
          sort: number
        }
        Insert: {
          is_active?: boolean
          key: string
          name_en: string
          name_es: string
          sort?: number
        }
        Update: {
          is_active?: boolean
          key?: string
          name_en?: string
          name_es?: string
          sort?: number
        }
        Relationships: []
      }
      gift_offers: {
        Row: {
          business_id: string
          conversation_id: string | null
          created_at: string
          expires_at: string | null
          from_user_id: string
          held_at: string | null
          id: string
          items: Json
          note: string | null
          order_id: string | null
          responded_at: string | null
          status: string
          stripe_pi_id: string | null
          subtotal_cents: number | null
          table_details: string | null
          table_label: string | null
          tax_cents: number | null
          to_user_id: string
          total_cents: number | null
          updated_at: string
        }
        Insert: {
          business_id: string
          conversation_id?: string | null
          created_at?: string
          expires_at?: string | null
          from_user_id: string
          held_at?: string | null
          id?: string
          items: Json
          note?: string | null
          order_id?: string | null
          responded_at?: string | null
          status?: string
          stripe_pi_id?: string | null
          subtotal_cents?: number | null
          table_details?: string | null
          table_label?: string | null
          tax_cents?: number | null
          to_user_id: string
          total_cents?: number | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          conversation_id?: string | null
          created_at?: string
          expires_at?: string | null
          from_user_id?: string
          held_at?: string | null
          id?: string
          items?: Json
          note?: string | null
          order_id?: string | null
          responded_at?: string | null
          status?: string
          stripe_pi_id?: string | null
          subtotal_cents?: number | null
          table_details?: string | null
          table_label?: string | null
          tax_cents?: number | null
          to_user_id?: string
          total_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_offers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_offers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_offers_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_offers_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_offers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_offers_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_offers_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gifts: {
        Row: {
          amount_cents: number
          created_at: string
          from_user: string
          id: string
          message: string | null
          room_id: string | null
          to_user: string
          type: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          from_user: string
          id?: string
          message?: string | null
          room_id?: string | null
          to_user: string
          type: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          from_user?: string
          id?: string
          message?: string | null
          room_id?: string | null
          to_user?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gifts_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gifts_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gifts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gifts_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gifts_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_code_attempts: {
        Row: {
          business_id: string
          created_at: string
          device_id: string | null
          id: string
          ip_hash: string | null
          success: boolean
          table_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          device_id?: string | null
          id?: string
          ip_hash?: string | null
          success?: boolean
          table_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          device_id?: string | null
          id?: string
          ip_hash?: string | null
          success?: boolean
          table_id?: string
        }
        Relationships: []
      }
      guest_device_blocks: {
        Row: {
          blocked_until: string
          business_id: string
          created_at: string
          created_by: string | null
          device_id: string
          id: string
          reason: string
          unblocked_at: string | null
          unblocked_by: string | null
        }
        Insert: {
          blocked_until: string
          business_id: string
          created_at?: string
          created_by?: string | null
          device_id: string
          id?: string
          reason?: string
          unblocked_at?: string | null
          unblocked_by?: string | null
        }
        Update: {
          blocked_until?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          device_id?: string
          id?: string
          reason?: string
          unblocked_at?: string | null
          unblocked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_device_blocks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_device_strikes: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          device_id: string
          id: string
          order_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          device_id: string
          id?: string
          order_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          device_id?: string
          id?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_device_strikes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_device_strikes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_order_idempotency: {
        Row: {
          business_id: string
          created_at: string
          idempotency_key: string
          order_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          idempotency_key: string
          order_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          idempotency_key?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_order_idempotency_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_service_attempts: {
        Row: {
          business_id: string
          created_at: string
          device_id: string
          id: string
          reason: string
        }
        Insert: {
          business_id: string
          created_at?: string
          device_id: string
          id?: string
          reason: string
        }
        Update: {
          business_id?: string
          created_at?: string
          device_id?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_service_attempts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_tab_sessions: {
        Row: {
          business_id: string
          created_at: string
          device_id: string
          expires_at: string
          fingerprint_hash: string | null
          id: string
          ip_hash: string | null
          last_seen_at: string | null
          revoked_at: string | null
          table_id: string
          table_session_opened_at: string
          token_hash: string
          user_agent: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          device_id: string
          expires_at: string
          fingerprint_hash?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string | null
          revoked_at?: string | null
          table_id: string
          table_session_opened_at: string
          token_hash: string
          user_agent?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          device_id?: string
          expires_at?: string
          fingerprint_hash?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string | null
          revoked_at?: string | null
          table_id?: string
          table_session_opened_at?: string
          token_hash?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_tab_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_tab_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      interests: {
        Row: {
          is_active: boolean
          key: string
          name_en: string
          name_es: string
          sort: number
        }
        Insert: {
          is_active?: boolean
          key: string
          name_en: string
          name_es: string
          sort?: number
        }
        Update: {
          is_active?: boolean
          key?: string
          name_en?: string
          name_es?: string
          sort?: number
        }
        Relationships: []
      }
      inventory_locations: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          is_sales_location: boolean
          name: string
          sort: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_sales_location?: boolean
          name: string
          sort?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_sales_location?: boolean
          name?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_points: {
        Row: {
          business_id: string
          id: string
          points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          id?: string
          points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          id?: string
          points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          business_id: string
          cost_points: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          business_id: string
          cost_points: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          business_id?: string
          cost_points?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rules: {
        Row: {
          business_id: string
          id: string
          is_active: boolean
          points_per_dollar: number
          updated_at: string
        }
        Insert: {
          business_id: string
          id?: string
          is_active?: boolean
          points_per_dollar?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          id?: string
          is_active?: boolean
          points_per_dollar?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_tiers: {
        Row: {
          business_id: string
          created_at: string
          id: string
          min_points: number
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          min_points?: number
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          min_points?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_tiers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      map_reactions: {
        Row: {
          business_id: string | null
          created_at: string
          emoji: string
          id: string
          room_id: string | null
          user_id: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          emoji: string
          id?: string
          room_id?: string | null
          user_id?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string
          emoji?: string
          id?: string
          room_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_reactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_reactions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      match_kicks: {
        Row: {
          business_id: string
          created_at: string
          kicked_by: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          kicked_by?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          kicked_by?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_kicks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_kicks_kicked_by_fkey"
            columns: ["kicked_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_kicks_kicked_by_fkey"
            columns: ["kicked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_kicks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_kicks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      match_photos: {
        Row: {
          created_at: string
          id: string
          moderated_at: string | null
          moderation: Json | null
          needs_review: boolean
          path: string
          rejection_reason: string | null
          reviewed_at: string | null
          sort: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderation?: Json | null
          needs_review?: boolean
          path: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          sort?: number
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderation?: Json | null
          needs_review?: boolean
          path?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          sort?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      match_presence: {
        Row: {
          active_since: string | null
          business_id: string
          entered_at: string
          expires_at: string
          last_seen_at: string
          method: string
          mocked: boolean
          readings: number
          user_id: string
        }
        Insert: {
          active_since?: string | null
          business_id: string
          entered_at?: string
          expires_at: string
          last_seen_at?: string
          method: string
          mocked?: boolean
          readings?: number
          user_id: string
        }
        Update: {
          active_since?: string | null
          business_id?: string
          entered_at?: string
          expires_at?: string
          last_seen_at?: string
          method?: string
          mocked?: boolean
          readings?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_presence_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      match_relikes: {
        Row: {
          business_id: string
          created_at: string
          id: string
          target_id: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          target_id: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          target_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_relikes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_relikes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_relikes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_relikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_relikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      match_super_quota: {
        Row: {
          day: string
          used: number
          user_id: string
        }
        Insert: {
          day: string
          used?: number
          user_id: string
        }
        Update: {
          day?: string
          used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_super_quota_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_super_quota_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      match_swipes: {
        Row: {
          action: string
          business_id: string
          created_at: string
          id: string
          swiper_id: string
          target_id: string
          undone_at: string | null
        }
        Insert: {
          action: string
          business_id: string
          created_at?: string
          id?: string
          swiper_id: string
          target_id: string
          undone_at?: string | null
        }
        Update: {
          action?: string
          business_id?: string
          created_at?: string
          id?: string
          swiper_id?: string
          target_id?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_swipes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_swipes_swiper_id_fkey"
            columns: ["swiper_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_swipes_swiper_id_fkey"
            columns: ["swiper_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_swipes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_swipes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          business_id: string
          conversation_id: string | null
          created_at: string
          id: string
          is_super: boolean
          user_a: string
          user_b: string
        }
        Insert: {
          business_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          is_super?: boolean
          user_a: string
          user_b: string
        }
        Update: {
          business_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          is_super?: boolean
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "dm_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          business_id: string
          created_at: string
          icon: string | null
          icon_url: string | null
          id: string
          is_published: boolean
          name: string
          name_alt: string | null
          sort: number
        }
        Insert: {
          business_id: string
          created_at?: string
          icon?: string | null
          icon_url?: string | null
          id?: string
          is_published?: boolean
          name: string
          name_alt?: string | null
          sort?: number
        }
        Update: {
          business_id?: string
          created_at?: string
          icon?: string | null
          icon_url?: string | null
          id?: string
          is_published?: boolean
          name?: string
          name_alt?: string | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_costs: {
        Row: {
          business_id: string
          cost_cents: number | null
          menu_item_id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cost_cents?: number | null
          menu_item_id: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cost_cents?: number | null
          menu_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_costs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_costs_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: true
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_modifier_groups: {
        Row: {
          id: string
          menu_item_id: string
          modifier_group_id: string
          sort: number
        }
        Insert: {
          id?: string
          menu_item_id: string
          modifier_group_id: string
          sort?: number
        }
        Update: {
          id?: string
          menu_item_id?: string
          modifier_group_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_photos: {
        Row: {
          business_id: string
          created_at: string
          id: string
          menu_item_id: string
          sort: number
          storage_path: string | null
          url: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          menu_item_id: string
          sort?: number
          storage_path?: string | null
          url: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          menu_item_id?: string
          sort?: number
          storage_path?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_photos_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_photos_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          badge: string | null
          barcode: string | null
          business_id: string
          category_id: string
          created_at: string
          description: string | null
          description_alt: string | null
          dietary_tags: string[]
          id: string
          id_required: boolean
          image_url: string | null
          images: Json
          is_available: boolean
          is_published: boolean
          low_stock_threshold: number
          name: string
          name_alt: string | null
          options: Json
          par_level: number | null
          photo_url: string | null
          price_cents: number
          sla: Json | null
          sort: number
          staff_details: string | null
          staff_details_alt: string | null
          station: string
          stock_count: number | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          badge?: string | null
          barcode?: string | null
          business_id: string
          category_id: string
          created_at?: string
          description?: string | null
          description_alt?: string | null
          dietary_tags?: string[]
          id?: string
          id_required?: boolean
          image_url?: string | null
          images?: Json
          is_available?: boolean
          is_published?: boolean
          low_stock_threshold?: number
          name: string
          name_alt?: string | null
          options?: Json
          par_level?: number | null
          photo_url?: string | null
          price_cents?: number
          sla?: Json | null
          sort?: number
          staff_details?: string | null
          staff_details_alt?: string | null
          station?: string
          stock_count?: number | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          badge?: string | null
          barcode?: string | null
          business_id?: string
          category_id?: string
          created_at?: string
          description?: string | null
          description_alt?: string | null
          dietary_tags?: string[]
          id?: string
          id_required?: boolean
          image_url?: string | null
          images?: Json
          is_available?: boolean
          is_published?: boolean
          low_stock_threshold?: number
          name?: string
          name_alt?: string | null
          options?: Json
          par_level?: number | null
          photo_url?: string | null
          price_cents?: number
          sla?: Json | null
          sort?: number
          staff_details?: string | null
          staff_details_alt?: string | null
          station?: string
          stock_count?: number | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          id: string
          is_deleted: boolean
          is_system: boolean
          media_url: string | null
          metadata: Json
          reply_to: string | null
          room_id: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          is_deleted?: boolean
          is_system?: boolean
          media_url?: string | null
          metadata?: Json
          reply_to?: string | null
          room_id: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          is_deleted?: boolean
          is_system?: boolean
          media_url?: string | null
          metadata?: Json
          reply_to?: string | null
          room_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_logs: {
        Row: {
          action: string
          actor_id: string | null
          business_id: string | null
          created_at: string
          detail: string | null
          id: string
          room_id: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          room_id?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          business_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          room_id?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_logs_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_logs_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_logs_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          business_id: string
          choices: Json
          created_at: string
          id: string
          key: string
          label: string
          label_alt: string | null
          max_select: number
          min_select: number
          sort: number
          type: string
        }
        Insert: {
          business_id: string
          choices?: Json
          created_at?: string
          id?: string
          key: string
          label: string
          label_alt?: string | null
          max_select?: number
          min_select?: number
          sort?: number
          type?: string
        }
        Update: {
          business_id?: string
          choices?: Json
          created_at?: string
          id?: string
          key?: string
          label?: string
          label_alt?: string | null
          max_select?: number
          min_select?: number
          sort?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          payload: Json | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          payload?: Json | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          payload?: Json | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          business_id: string
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          discount: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          min_purchase_cents: number | null
          redemption_count: number
          room_id: string | null
          start_at: string | null
          status: string
          taps: number
          targeting: string
          title: string
          type: string | null
          views: number
        }
        Insert: {
          business_id: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          min_purchase_cents?: number | null
          redemption_count?: number
          room_id?: string | null
          start_at?: string | null
          status?: string
          taps?: number
          targeting?: string
          title: string
          type?: string | null
          views?: number
        }
        Update: {
          business_id?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          min_purchase_cents?: number | null
          redemption_count?: number
          room_id?: string | null
          start_at?: string | null
          status?: string
          taps?: number
          targeting?: string
          title?: string
          type?: string | null
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          done_at: string | null
          id: string
          item_status: string
          menu_item_id: string
          notes: string | null
          options: Json
          order_id: string
          paid_at: string | null
          preparing_at: string | null
          price_cents: number
          qty: number
          ready_at: string | null
          seat: number | null
          special_instructions: string | null
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          id?: string
          item_status?: string
          menu_item_id: string
          notes?: string | null
          options?: Json
          order_id: string
          paid_at?: string | null
          preparing_at?: string | null
          price_cents: number
          qty?: number
          ready_at?: string | null
          seat?: number | null
          special_instructions?: string | null
        }
        Update: {
          created_at?: string
          done_at?: string | null
          id?: string
          item_status?: string
          menu_item_id?: string
          notes?: string | null
          options?: Json
          order_id?: string
          paid_at?: string | null
          preparing_at?: string | null
          price_cents?: number
          qty?: number
          ready_at?: string | null
          seat?: number | null
          special_instructions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          business_id: string
          canceled_at: string | null
          comanda_claimed_at: string | null
          comanda_claimed_by: string | null
          comanda_printed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          discount_cents: number
          eta_minutes: number | null
          gift_recipient_id: string | null
          guest_device_id: string | null
          guest_session_id: string | null
          guest_tracking_code: string | null
          id: string
          notes: string | null
          order_number: number
          order_type: string
          paid_at: string | null
          promo_code: string | null
          rejected_reason: string | null
          room_id: string | null
          source: string
          special_instructions: string | null
          status: string
          status_updated_at: string
          stripe_pi_id: string | null
          subtotal_cents: number
          tab_id: string | null
          table_id: string | null
          table_label: string | null
          taken_by: string | null
          tax_cents: number
          tip_cents: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_id: string
          canceled_at?: string | null
          comanda_claimed_at?: string | null
          comanda_claimed_by?: string | null
          comanda_printed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          discount_cents?: number
          eta_minutes?: number | null
          gift_recipient_id?: string | null
          guest_device_id?: string | null
          guest_session_id?: string | null
          guest_tracking_code?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          order_type?: string
          paid_at?: string | null
          promo_code?: string | null
          rejected_reason?: string | null
          room_id?: string | null
          source?: string
          special_instructions?: string | null
          status?: string
          status_updated_at?: string
          stripe_pi_id?: string | null
          subtotal_cents?: number
          tab_id?: string | null
          table_id?: string | null
          table_label?: string | null
          taken_by?: string | null
          tax_cents?: number
          tip_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_id?: string
          canceled_at?: string | null
          comanda_claimed_at?: string | null
          comanda_claimed_by?: string | null
          comanda_printed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          discount_cents?: number
          eta_minutes?: number | null
          gift_recipient_id?: string | null
          guest_device_id?: string | null
          guest_session_id?: string | null
          guest_tracking_code?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          order_type?: string
          paid_at?: string | null
          promo_code?: string | null
          rejected_reason?: string | null
          room_id?: string | null
          source?: string
          special_instructions?: string | null
          status?: string
          status_updated_at?: string
          stripe_pi_id?: string | null
          subtotal_cents?: number
          tab_id?: string | null
          table_id?: string | null
          table_label?: string | null
          taken_by?: string | null
          tax_cents?: number
          tip_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_gift_recipient_id_fkey"
            columns: ["gift_recipient_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_gift_recipient_id_fkey"
            columns: ["gift_recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_guest_session_fk"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_tab_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "table_tabs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orphan_payments: {
        Row: {
          amount_cents: number | null
          business_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          reason: string | null
          stripe_pi_id: string
        }
        Insert: {
          amount_cents?: number | null
          business_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          stripe_pi_id: string
        }
        Update: {
          amount_cents?: number | null
          business_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          stripe_pi_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orphan_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_order_carts: {
        Row: {
          business_id: string
          created_at: string
          items: Json
          payment_intent_id: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          items: Json
          payment_intent_id: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          items?: Json
          payment_intent_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_order_carts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_order_carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_order_carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_messages: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          message_id: string
          notify: boolean
          pinned_by: string
          room_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          message_id: string
          notify?: boolean
          pinned_by: string
          room_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          message_id?: string
          notify?: boolean
          pinned_by?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          affiliate_clawback_days: number
          affiliate_commissionable_plans: string[]
          affiliate_payouts_enabled: boolean
          affiliate_program_enabled: boolean
          business_radius_max_m: number
          business_radius_min_m: number
          id: boolean
        }
        Insert: {
          affiliate_clawback_days?: number
          affiliate_commissionable_plans?: string[]
          affiliate_payouts_enabled?: boolean
          affiliate_program_enabled?: boolean
          business_radius_max_m?: number
          business_radius_min_m?: number
          id?: boolean
        }
        Update: {
          affiliate_clawback_days?: number
          affiliate_commissionable_plans?: string[]
          affiliate_payouts_enabled?: boolean
          affiliate_program_enabled?: boolean
          business_radius_max_m?: number
          business_radius_min_m?: number
          id?: boolean
        }
        Relationships: []
      }
      pos_payments: {
        Row: {
          amount_cents: number
          business_id: string
          card_brand: string | null
          card_last4: string | null
          claimed_at: string | null
          created_at: string
          guest_session_id: string | null
          id: string
          kind: string
          order_item_ids: string[] | null
          paid_by: string | null
          payment_method: string | null
          receipt_code: string | null
          seat: number | null
          session_opened_at: string | null
          source: string
          status: string
          stripe_pi_id: string | null
          table_id: string
          tip_cents: number
          updated_at: string
        }
        Insert: {
          amount_cents: number
          business_id: string
          card_brand?: string | null
          card_last4?: string | null
          claimed_at?: string | null
          created_at?: string
          guest_session_id?: string | null
          id?: string
          kind?: string
          order_item_ids?: string[] | null
          paid_by?: string | null
          payment_method?: string | null
          receipt_code?: string | null
          seat?: number | null
          session_opened_at?: string | null
          source?: string
          status?: string
          stripe_pi_id?: string | null
          table_id: string
          tip_cents?: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          business_id?: string
          card_brand?: string | null
          card_last4?: string | null
          claimed_at?: string | null
          created_at?: string
          guest_session_id?: string | null
          id?: string
          kind?: string
          order_item_ids?: string[] | null
          paid_by?: string | null
          payment_method?: string | null
          receipt_code?: string | null
          seat?: number | null
          session_opened_at?: string | null
          source?: string
          status?: string
          stripe_pi_id?: string | null
          table_id?: string
          tip_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_payments_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_tab_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_payments_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_pins: {
        Row: {
          business_id: string
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_pins_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_printers: {
        Row: {
          business_id: string
          connection: string
          created_at: string
          host: string | null
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          port: number
          role: string
          width_mm: number
        }
        Insert: {
          business_id: string
          connection?: string
          created_at?: string
          host?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label: string
          port?: number
          role?: string
          width_mm?: number
        }
        Update: {
          business_id?: string
          connection?: string
          created_at?: string
          host?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          port?: number
          role?: string
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_printers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          business_id: string | null
          caption: string | null
          created_at: string
          geotag: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          media_urls: string[]
          user_id: string
        }
        Insert: {
          business_id?: string | null
          caption?: string | null
          created_at?: string
          geotag?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          media_urls?: string[]
          user_id: string
        }
        Update: {
          business_id?: string | null
          caption?: string | null
          created_at?: string
          geotag?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          media_urls?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_stripe_events: {
        Row: {
          event_id: string
          processed_at: string
          type: string | null
        }
        Insert: {
          event_id: string
          processed_at?: string
          type?: string | null
        }
        Update: {
          event_id?: string
          processed_at?: string
          type?: string | null
        }
        Relationships: []
      }
      product_catalog: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string
          country: string | null
          created_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          packaging: string | null
          size_unit: string | null
          size_value: number | null
          source: string
          source_id: string | null
          subcategory: string | null
          updated_at: string | null
          verified: boolean | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category: string
          country?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          packaging?: string | null
          size_unit?: string | null
          size_value?: number | null
          source?: string
          source_id?: string | null
          subcategory?: string | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string
          country?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          packaging?: string | null
          size_unit?: string | null
          size_value?: number | null
          source?: string
          source_id?: string | null
          subcategory?: string | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          plan: string
          redeemed_at: string | null
          redeemed_by: string | null
          trial_days: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          plan: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          trial_days: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          plan?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          trial_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      public_locations: {
        Row: {
          active_from: string | null
          active_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
          radius_m: number
          room_id: string | null
          type: string
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          radius_m?: number
          room_id?: string | null
          type?: string
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          radius_m?: number
          room_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_locations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_settings: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          email: string | null
          legal_name: string | null
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          email?: string | null
          legal_name?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          email?: string | null
          legal_name?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      radius_increase_requests: {
        Row: {
          business_id: string | null
          created_at: string
          current_radius_m: number | null
          event_id: string | null
          id: string
          reason: string
          requested_by: string | null
          requested_radius_m: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          current_radius_m?: number | null
          event_id?: string | null
          id?: string
          reason: string
          requested_by?: string | null
          requested_radius_m?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          current_radius_m?: number | null
          event_id?: string | null
          id?: string
          reason?: string
          requested_by?: string | null
          requested_radius_m?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "radius_increase_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radius_increase_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radius_increase_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radius_increase_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radius_increase_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          admin_note: string | null
          business_id: string | null
          content_id: string | null
          content_type: string
          created_at: string
          details: string | null
          id: string
          priority: string
          reason: string
          reported_user_id: string | null
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          snapshot: Json | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          business_id?: string | null
          content_id?: string | null
          content_type?: string
          created_at?: string
          details?: string | null
          id?: string
          priority?: string
          reason: string
          reported_user_id?: string | null
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          snapshot?: Json | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          business_id?: string | null
          content_id?: string | null
          content_type?: string
          created_at?: string
          details?: string | null
          id?: string
          priority?: string
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          snapshot?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_customers: {
        Row: {
          business_id: string
          created_at: string
          first_name: string
          id: string
          last_name: string | null
          phone: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          first_name: string
          id?: string
          last_name?: string | null
          phone?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_tables: {
        Row: {
          reservation_id: string
          table_id: string
        }
        Insert: {
          reservation_id: string
          table_id: string
        }
        Update: {
          reservation_id?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_tables_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_tables_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string | null
          event_type: string | null
          id: string
          is_waitlist: boolean
          party_size: number
          reserved_at: string
          special_requests: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id?: string | null
          event_type?: string | null
          id?: string
          is_waitlist?: boolean
          party_size?: number
          reserved_at: string
          special_requests?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string | null
          event_type?: string | null
          id?: string
          is_waitlist?: boolean
          party_size?: number
          reserved_at?: string
          special_requests?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "reservation_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          business_id: string
          created_at: string
          id: string
          rating: number
          responded_at: string | null
          response: string | null
          status: string
          user_id: string
        }
        Insert: {
          body?: string | null
          business_id: string
          created_at?: string
          id?: string
          rating: number
          responded_at?: string | null
          response?: string | null
          status?: string
          user_id: string
        }
        Update: {
          body?: string | null
          business_id?: string
          created_at?: string
          id?: string
          rating?: number
          responded_at?: string | null
          response?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      room_access_attempts: {
        Row: {
          fail_count: number
          id: string
          locked_until: string | null
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          fail_count?: number
          id?: string
          locked_until?: string | null
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          fail_count?: number
          id?: string
          locked_until?: string | null
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_access_attempts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_access_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_access_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      room_geo_presence: {
        Row: {
          expires_at: string
          last_seen_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          expires_at: string
          last_seen_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          expires_at?: string
          last_seen_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_geo_presence_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_geo_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_geo_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      room_members: {
        Row: {
          created_at: string
          expires_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          room_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      room_mutes: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          muted_by: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          muted_by?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          muted_by?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_mutes_muted_by_fkey"
            columns: ["muted_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_mutes_muted_by_fkey"
            columns: ["muted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_mutes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_mutes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_mutes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          business_id: string
          chat_theme_id: number
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_main: boolean
          is_password_protected: boolean
          max_occupancy: number | null
          name: string
          notify_enabled: boolean
          parent_room_id: string | null
          password_hash: string | null
          qr_token: string | null
          slug: string | null
          sort: number
          ttl_hours: number | null
          updated_at: string
        }
        Insert: {
          business_id: string
          chat_theme_id?: number
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_main?: boolean
          is_password_protected?: boolean
          max_occupancy?: number | null
          name: string
          notify_enabled?: boolean
          parent_room_id?: string | null
          password_hash?: string | null
          qr_token?: string | null
          slug?: string | null
          sort?: number
          ttl_hours?: number | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          chat_theme_id?: number
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_main?: boolean
          is_password_protected?: boolean
          max_occupancy?: number | null
          name?: string
          notify_enabled?: boolean
          parent_room_id?: string | null
          password_hash?: string | null
          qr_token?: string | null
          slug?: string | null
          sort?: number
          ttl_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_parent_room_id_fkey"
            columns: ["parent_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      security_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: string | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_calls: {
        Row: {
          business_id: string
          created_at: string
          guest_device_id: string | null
          id: string
          notes: string | null
          order_id: string | null
          room_id: string
          status: string
          table_label: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          guest_device_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          room_id: string
          status?: string
          table_label?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          guest_device_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          room_id?: string
          status?: string
          table_label?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_calls_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_by_location: {
        Row: {
          business_id: string
          created_at: string
          id: string
          location_id: string
          low_stock_threshold: number | null
          menu_item_id: string
          par_level: number | null
          qty: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          location_id: string
          low_stock_threshold?: number | null
          menu_item_id: string
          par_level?: number | null
          qty?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          location_id?: string
          low_stock_threshold?: number | null
          menu_item_id?: string
          par_level?: number | null
          qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_by_location_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_by_location_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_by_location_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          business_id: string | null
          created_at: string
          created_by: string | null
          delta: number
          id: string
          menu_item_id: string
          reason: string | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          menu_item_id: string
          reason?: string | null
        }
        Update: {
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          menu_item_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          media_url: string
          text_overlay: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          media_url: string
          text_overlay?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          media_url?: string
          text_overlay?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          created_at: string
          id: string
          story_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          story_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          story_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          business_id: string
          created_at: string
          current_period_end: string | null
          grace_day: number
          id: string
          plan: string
          status: string
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          current_period_end?: string | null
          grace_day?: number
          id?: string
          plan?: string
          status?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          current_period_end?: string | null
          grace_day?: number
          id?: string
          plan?: string
          status?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          account_number: string | null
          business_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          business_id: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          business_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_payments: {
        Row: {
          amount_cents: number
          business_id: string
          created_at: string
          id: string
          method: string
          paid_at: string | null
          pay_token: string
          status: string
          stripe_pi_id: string | null
          tab_id: string
          taken_by: string | null
          tip_cents: number
          updated_at: string
        }
        Insert: {
          amount_cents: number
          business_id: string
          created_at?: string
          id?: string
          method: string
          paid_at?: string | null
          pay_token: string
          status?: string
          stripe_pi_id?: string | null
          tab_id: string
          taken_by?: string | null
          tip_cents?: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          business_id?: string
          created_at?: string
          id?: string
          method?: string
          paid_at?: string | null
          pay_token?: string
          status?: string
          stripe_pi_id?: string | null
          tab_id?: string
          taken_by?: string | null
          tip_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_payments_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "table_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      table_reservation_log: {
        Row: {
          action: string
          business_id: string
          changed_by: string | null
          created_at: string
          id: string
          note: string | null
          reserved_until: string | null
          table_id: string | null
          table_label: string
        }
        Insert: {
          action: string
          business_id: string
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reserved_until?: string | null
          table_id?: string | null
          table_label: string
        }
        Update: {
          action?: string
          business_id?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reserved_until?: string | null
          table_id?: string | null
          table_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_reservation_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_reservation_log_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_tabs: {
        Row: {
          business_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          owner_uid: string | null
          paid_at: string | null
          status: string
          table_id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          name: string
          owner_uid?: string | null
          paid_at?: string | null
          status?: string
          table_id: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          owner_uid?: string | null
          paid_at?: string | null
          status?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_tabs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_tabs_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_waiters: {
        Row: {
          business_id: string
          created_at: string
          employee_id: string
          id: string
          table_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          employee_id: string
          id?: string
          table_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_waiters_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_waiters_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_waiters_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          access_code: string | null
          business_id: string
          combined_into: string | null
          created_at: string
          floor: string
          id: string
          is_active: boolean
          is_reserved: boolean
          label: string
          party_size: number | null
          qr_token: string
          reserved_note: string | null
          reserved_until: string | null
          room_id: string | null
          seats: number
          session_opened_at: string | null
          session_opened_by: string | null
          short_code: string | null
          sort: number
          updated_at: string
        }
        Insert: {
          access_code?: string | null
          business_id: string
          combined_into?: string | null
          created_at?: string
          floor?: string
          id?: string
          is_active?: boolean
          is_reserved?: boolean
          label: string
          party_size?: number | null
          qr_token: string
          reserved_note?: string | null
          reserved_until?: string | null
          room_id?: string | null
          seats?: number
          session_opened_at?: string | null
          session_opened_by?: string | null
          short_code?: string | null
          sort?: number
          updated_at?: string
        }
        Update: {
          access_code?: string | null
          business_id?: string
          combined_into?: string | null
          created_at?: string
          floor?: string
          id?: string
          is_active?: boolean
          is_reserved?: boolean
          label?: string
          party_size?: number | null
          qr_token?: string
          reserved_note?: string | null
          reserved_until?: string | null
          room_id?: string | null
          seats?: number
          session_opened_at?: string | null
          session_opened_by?: string | null
          short_code?: string | null
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_combined_into_fkey"
            columns: ["combined_into"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      tod_cards: {
        Row: {
          active: boolean
          body: string
          category: string
          concept_id: string
          id: string
          kind: string
          locale: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          body: string
          category: string
          concept_id: string
          id?: string
          kind: string
          locale: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          body?: string
          category?: string
          concept_id?: string
          id?: string
          kind?: string
          locale?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      tod_draws: {
        Row: {
          applause_count: number
          business_id: string
          concept_id: string
          created_at: string
          decided_at: string | null
          id: string
          is_random: boolean
          kind: string
          message_id: string | null
          room_id: string
          round_id: string
          status: string
          user_id: string
        }
        Insert: {
          applause_count?: number
          business_id: string
          concept_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          is_random?: boolean
          kind: string
          message_id?: string | null
          room_id: string
          round_id: string
          status?: string
          user_id: string
        }
        Update: {
          applause_count?: number
          business_id?: string
          concept_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          is_random?: boolean
          kind?: string
          message_id?: string | null
          room_id?: string
          round_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tod_draws_round_fk"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "tod_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tod_draws_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tod_draws_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tod_kicks: {
        Row: {
          business_id: string
          created_at: string
          kicked_by: string | null
          lifted_at: string | null
          lifted_by: string | null
          reason: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          kicked_by?: string | null
          lifted_at?: string | null
          lifted_by?: string | null
          reason?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          kicked_by?: string | null
          lifted_at?: string | null
          lifted_by?: string | null
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tod_kicks_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tod_kicks_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tod_kicks_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tod_moderation_log: {
        Row: {
          action: string
          actor_id: string | null
          business_id: string
          created_at: string
          detail: string | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          business_id: string
          created_at?: string
          detail?: string | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          business_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tod_modlog_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      tod_rounds: {
        Row: {
          business_id: string
          category: string
          closed_at: string | null
          created_at: string
          creator_id: string
          expires_at: string
          id: string
          is_official: boolean
          message_id: string | null
          plays_count: number
          room_id: string
          status: string
        }
        Insert: {
          business_id: string
          category: string
          closed_at?: string | null
          created_at?: string
          creator_id: string
          expires_at?: string
          id?: string
          is_official?: boolean
          message_id?: string | null
          plays_count?: number
          room_id: string
          status?: string
        }
        Update: {
          business_id?: string
          category?: string
          closed_at?: string | null
          created_at?: string
          creator_id?: string
          expires_at?: string
          id?: string
          is_official?: boolean
          message_id?: string | null
          plays_count?: number
          room_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tod_rounds_business_fk"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tod_rounds_creator_fk"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tod_rounds_creator_fk"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tod_rounds_room_fk"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      tod_settings: {
        Row: {
          business_id: string
          categories: string[]
          updated_at: string
        }
        Insert: {
          business_id: string
          categories?: string[]
          updated_at?: string
        }
        Update: {
          business_id?: string
          categories?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tod_settings_business_fk"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      tod_terms: {
        Row: {
          accepted_at: string
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "tod_terms_user_fk"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tod_terms_user_fk"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tod_votes: {
        Row: {
          created_at: string
          draw_id: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          draw_id: string
          voter_id: string
        }
        Update: {
          created_at?: string
          draw_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tod_votes_draw_fk"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "tod_draws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tod_votes_voter_fk"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tod_votes_voter_fk"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trials: {
        Row: {
          business_id: string
          ends_at: string
          id: string
          started_at: string
        }
        Insert: {
          business_id: string
          ends_at: string
          id?: string
          started_at?: string
        }
        Update: {
          business_id?: string
          ends_at?: string
          id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      us_sales_tax_rates: {
        Row: {
          rate: number
          state: string
          updated_at: string
        }
        Insert: {
          rate: number
          state: string
          updated_at?: string
        }
        Update: {
          rate?: number
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_interests: {
        Row: {
          created_at: string
          interest_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          interest_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          interest_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_interests_interest_key_fkey"
            columns: ["interest_key"]
            isOneToOne: false
            referencedRelation: "interests"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active_business_id: string | null
          affiliate_attributed_at: string | null
          affiliate_attribution_source: string | null
          age_confirmed_at: string | null
          avatar_url: string | null
          bio: string | null
          birth_year: number | null
          city: string | null
          cover_url: string | null
          created_at: string
          default_payment_method: string | null
          display_name: string | null
          id: string
          is_incognito: boolean
          is_private: boolean
          is_test: boolean
          is_verified: boolean
          language: string
          onboarding_completed: boolean
          plan: string
          plan_renews_at: string | null
          plan_status: string
          plan_trial_end: string | null
          privacy_settings: Json
          profile_theme_id: number
          push_token: string | null
          referred_by_affiliate_id: string | null
          role: string | null
          settings: Json
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          suspended_reason: string | null
          suspended_until: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          username: string
        }
        Insert: {
          active_business_id?: string | null
          affiliate_attributed_at?: string | null
          affiliate_attribution_source?: string | null
          age_confirmed_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          birth_year?: number | null
          city?: string | null
          cover_url?: string | null
          created_at?: string
          default_payment_method?: string | null
          display_name?: string | null
          id: string
          is_incognito?: boolean
          is_private?: boolean
          is_test?: boolean
          is_verified?: boolean
          language?: string
          onboarding_completed?: boolean
          plan?: string
          plan_renews_at?: string | null
          plan_status?: string
          plan_trial_end?: string | null
          privacy_settings?: Json
          profile_theme_id?: number
          push_token?: string | null
          referred_by_affiliate_id?: string | null
          role?: string | null
          settings?: Json
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          active_business_id?: string | null
          affiliate_attributed_at?: string | null
          affiliate_attribution_source?: string | null
          age_confirmed_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          birth_year?: number | null
          city?: string | null
          cover_url?: string | null
          created_at?: string
          default_payment_method?: string | null
          display_name?: string | null
          id?: string
          is_incognito?: boolean
          is_private?: boolean
          is_test?: boolean
          is_verified?: boolean
          language?: string
          onboarding_completed?: boolean
          plan?: string
          plan_renews_at?: string | null
          plan_status?: string
          plan_trial_end?: string | null
          privacy_settings?: Json
          profile_theme_id?: number
          push_token?: string | null
          referred_by_affiliate_id?: string | null
          role?: string | null
          settings?: Json
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_active_business_id_fkey"
            columns: ["active_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_referred_by_affiliate_id_fkey"
            columns: ["referred_by_affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_exits: {
        Row: {
          business_id: string
          exited_at: string
          purge_at: string
          reason: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          exited_at?: string
          purge_at?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          exited_at?: string
          purge_at?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_exits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          cover_url: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          is_private: boolean | null
          is_verified: boolean | null
          profile_theme_id: number | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          cover_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_private?: boolean | null
          is_verified?: boolean | null
          profile_theme_id?: number | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          cover_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          is_private?: boolean | null
          is_verified?: boolean | null
          profile_theme_id?: number | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_follow_request: {
        Args: { p_requester: string }
        Returns: undefined
      }
      admin_hide_content: {
        Args: {
          p_content_id: string
          p_content_type: string
          p_report_id?: string
          p_unhide?: boolean
        }
        Returns: undefined
      }
      admin_list_match_photos_for_review: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          id: string
          moderation: Json
          path: string
          user_id: string
        }[]
      }
      admin_report_content_exists: {
        Args: { p_content_id: string; p_content_type: string }
        Returns: boolean
      }
      admin_resolve_report: {
        Args: { p_note?: string; p_report_id: string; p_resolution: string }
        Returns: undefined
      }
      admin_review_match_photo: {
        Args: { p_approve: boolean; p_photo_id: string; p_reason?: string }
        Returns: undefined
      }
      admin_set_business_status: {
        Args: { p_business_id: string; p_status: string }
        Returns: undefined
      }
      admin_suspend_user: {
        Args: {
          p_days?: number
          p_reason?: string
          p_report_id?: string
          p_user_id: string
        }
        Returns: string
      }
      admin_unsuspend_user: { Args: { p_user_id: string }; Returns: undefined }
      affiliate_summary: {
        Args: never
        Returns: {
          affiliate_number: string
          commission_pct: number
          created_at: string
          email: string
          id: string
          last_payout_at: string
          name: string
          paid_cents: number
          payouts_held: boolean
          phone: string
          ready_cents: number
          referred_users: number
          reversed_cents: number
          status: string
          tax_form_on_file: boolean
          tax_form_type: string
          waiting_cents: number
        }[]
      }
      affiliate_yearly_payouts: {
        Args: { p_year: number }
        Returns: {
          affiliate_id: string
          affiliate_number: string
          currency: string
          name: string
          payout_count: number
          tax_form_on_file: boolean
          tax_form_type: string
          total_paid_cents: number
        }[]
      }
      assert_venue_order_allowed: {
        Args: {
          p_business_id: string
          p_lat: number
          p_lng: number
          p_order_type: string
          p_source: string
          p_taken_by: string
          p_user_id: string
        }
        Returns: undefined
      }
      assign_affiliate_to_user: {
        Args: { p_affiliate_id: string; p_user_id: string }
        Returns: undefined
      }
      attach_order_to_tab: {
        Args: { p_order_id: string; p_tab_id: string }
        Returns: undefined
      }
      block_user: { Args: { p_target: string }; Returns: undefined }
      can_access_room: { Args: { _room_id: string }; Returns: boolean }
      can_employee_see_table: { Args: { p_table_id: string }; Returns: boolean }
      can_publish_business_post: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      can_view_profile: {
        Args: { target: string; viewer: string }
        Returns: boolean
      }
      can_view_user_content: {
        Args: { dimension: string; owner: string; viewer: string }
        Returns: boolean
      }
      catalog_lookup: {
        Args: { p_barcode: string }
        Returns: {
          barcode: string
          brand: string
          category: string
          image_url: string
          name: string
          packaging: string
          size_unit: string
          size_value: number
          subcategory: string
        }[]
      }
      check_geofence_and_join_room: {
        Args: { _lat: number; _lng: number; _room_id: string }
        Returns: {
          access_granted: boolean
          distance_m: number
          is_owner: boolean
          reason: string
        }[]
      }
      check_in: {
        Args: { p_business_id: string }
        Returns: {
          check_in_id: string
          ok: boolean
          reason: string
          visit_count: number
        }[]
      }
      claim_embedded_order: {
        Args: {
          p_order_id: string
          p_room_id?: string
          p_tracking_code: string
        }
        Returns: {
          business_id: string
          order_id: string
          order_number: number
          status: string
        }[]
      }
      cleanup_anonymous_users: { Args: never; Returns: number }
      confirm_age: {
        Args: { p_birth_date: string; p_terms_version?: string }
        Returns: Json
      }
      create_paid_order: {
        Args: { p_items: Json; p_order: Json }
        Returns: {
          id: string
          order_number: number
        }[]
      }
      create_promo_code: {
        Args: { p_expires_at?: string; p_plan: string; p_trial_days: number }
        Returns: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          plan: string
          redeemed_at: string | null
          redeemed_by: string | null
          trial_days: number
        }
        SetofOptions: {
          from: "*"
          to: "promo_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_reservation: {
        Args: {
          p_business_id: string
          p_event_type?: string
          p_first_name?: string
          p_last_name?: string
          p_party_size: number
          p_phone?: string
          p_reserved_at: string
          p_special_requests?: string
          p_table_ids: string[]
        }
        Returns: string
      }
      derive_username: {
        Args: { _email: string; _meta: Json }
        Returns: string
      }
      dm_media_is_blocked: { Args: { p_name: string }; Returns: boolean }
      dm_photo_retry_moderation: { Args: never; Returns: number }
      dm_photo_set_verdict: {
        Args: { p_message_id: string; p_scores?: Json; p_status: string }
        Returns: undefined
      }
      effective_tax_rate: {
        Args: { p_business_id: string }
        Returns: {
          rate: number
          source: string
        }[]
      }
      gen_short_code: { Args: { p_len?: number }; Returns: string }
      generate_room_qr_token: {
        Args: { _business_id: string; _is_sub_room: boolean }
        Returns: string
      }
      generate_tab_pay_token: {
        Args: { _business_id: string }
        Returns: string
      }
      generate_table_access_code: {
        Args: { _business_id: string }
        Returns: string
      }
      generate_table_qr_token: {
        Args: { _business_id: string }
        Returns: string
      }
      geo_distance_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      get_public_receipt: { Args: { p_code: string }; Returns: Json }
      get_room_qr_token: { Args: { p_room_id: string }; Returns: string }
      get_table_order_status: { Args: { p_token: string }; Returns: Json }
      gift_available: {
        Args: { p_business_id: string; p_other_user_id: string }
        Returns: boolean
      }
      gift_offer_cancel: { Args: { p_offer_id: string }; Returns: Json }
      gift_offer_create: {
        Args: {
          p_business_id: string
          p_conversation_id?: string
          p_items: Json
          p_note?: string
          p_to_user_id: string
        }
        Returns: Json
      }
      gift_offer_mark_failed: {
        Args: { p_stripe_pi_id: string }
        Returns: undefined
      }
      gift_offer_mark_held: { Args: { p_stripe_pi_id: string }; Returns: Json }
      gift_offer_mark_paid: {
        Args: { p_order_id: string; p_stripe_pi_id: string }
        Returns: undefined
      }
      gift_offer_respond: {
        Args: {
          p_accept: boolean
          p_offer_id: string
          p_table_details?: string
          p_table_label?: string
        }
        Returns: Json
      }
      gift_offer_set_hold: {
        Args: {
          p_offer_id: string
          p_stripe_pi_id: string
          p_subtotal: number
          p_tax: number
          p_total: number
        }
        Returns: undefined
      }
      gift_offer_view: { Args: { p_offer_id: string }; Returns: Json }
      gift_offers_expire: { Args: never; Returns: number }
      gift_offers_reconcile: { Args: never; Returns: number }
      guest_order_notify_staff: {
        Args: { p_code: string; p_kind: string; p_note?: string }
        Returns: Json
      }
      guest_order_view: { Args: { p_code: string }; Returns: Json }
      guest_request_service: {
        Args: {
          p_device_id: string
          p_lat: number
          p_lng: number
          p_notes?: string
          p_table_token: string
        }
        Returns: Json
      }
      guest_tab_session_validate: {
        Args: { p_token_hash: string }
        Returns: {
          business_id: string
          device_id: string
          session_id: string
          session_opened_at: string
          table_id: string
          table_label: string
        }[]
      }
      hide_dm_conversation: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      inv_can_manage: { Args: { p_business_id: string }; Returns: boolean }
      inventory_archive_location: {
        Args: { p_business_id: string; p_location_id: string }
        Returns: undefined
      }
      inventory_create_location: {
        Args: { p_business_id: string; p_is_sales?: boolean; p_name: string }
        Returns: string
      }
      inventory_kpis: {
        Args: { p_business_id: string; p_from: string; p_to: string }
        Returns: {
          cogs_cents: number
          costed_revenue_cents: number
          coverage_pct: number
          days_on_hand: number
          inventory_value_cents: number
          pour_cost_pct: number
          total_revenue_cents: number
          turnover: number
        }[]
      }
      inventory_rename_location: {
        Args: { p_business_id: string; p_location_id: string; p_name: string }
        Returns: undefined
      }
      inventory_report: {
        Args: { p_business_id: string; p_from: string; p_to: string }
        Returns: {
          count_adj: number
          item_name: string
          menu_item_id: string
          received: number
          sold: number
          stock_now: number
          voided: number
          waste: number
        }[]
      }
      inventory_set_location_qty: {
        Args: {
          p_business_id: string
          p_location_id: string
          p_menu_item_id: string
          p_qty: number
          p_reason?: string
        }
        Returns: undefined
      }
      inventory_set_sales_location: {
        Args: { p_business_id: string; p_location_id: string }
        Returns: undefined
      }
      inventory_transfer: {
        Args: {
          p_business_id: string
          p_from_location: string
          p_menu_item_id: string
          p_qty: number
          p_to_location: string
        }
        Returns: undefined
      }
      is_banned_from_room: {
        Args: { p_room: string; p_user: string }
        Returns: boolean
      }
      is_blocked: { Args: { a: string; b: string }; Returns: boolean }
      is_employee_of_business: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      is_muted_in_room: {
        Args: { p_room: string; p_user: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_private_account: { Args: { p_user: string }; Returns: boolean }
      is_venue_staff: {
        Args: { p_business_id: string; p_user_id: string }
        Returns: boolean
      }
      is_waiter_of_table: { Args: { p_table_id: string }; Returns: boolean }
      join_room_via_qr:
        | {
            Args: { token: string }
            Returns: {
              parent_room_id: string
              room_id: string
            }[]
          }
        | {
            Args: { p_lat: number; p_lng: number; token: string }
            Returns: {
              access_granted: boolean
              distance_m: number
              is_owner: boolean
              parent_room_id: string
              reason: string
              room_id: string
            }[]
          }
      match_card: {
        Args: { p_business_id: string; p_user: string; p_viewer: string }
        Returns: Json
      }
      match_check_in: {
        Args: {
          p_business_id: string
          p_lat?: number
          p_lng?: number
          p_mocked?: boolean
          p_qr_token?: string
        }
        Returns: Json
      }
      match_clear_likes: { Args: { p_business_id: string }; Returns: undefined }
      match_common_business: {
        Args: { p_target: string; p_viewer: string }
        Returns: string
      }
      match_delete_like: { Args: { p_swipe_id: string }; Returns: undefined }
      match_delete_match: { Args: { p_match_id: string }; Returns: undefined }
      match_enabled_for_business: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      match_get_activity: { Args: { p_business_id: string }; Returns: Json }
      match_get_deck: {
        Args: { p_business_id: string; p_limit?: number }
        Returns: Json
      }
      match_get_passed: { Args: { p_business_id: string }; Returns: Json }
      match_get_profile: {
        Args: { p_business_id: string; p_user_id: string }
        Returns: Json
      }
      match_kick: {
        Args: { p_business_id: string; p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      match_leave_venue: { Args: { p_business_id: string }; Returns: undefined }
      match_photo_retry_moderation: { Args: never; Returns: number }
      match_relike: {
        Args: { p_business_id: string; p_user_id: string }
        Returns: Json
      }
      match_remove_pair: {
        Args: { p_business_id: string; p_u1: string; p_u2: string }
        Returns: undefined
      }
      match_report: {
        Args: {
          p_business_id: string
          p_details?: string
          p_reason: string
          p_reported_user_id: string
        }
        Returns: string
      }
      match_request_help: {
        Args: {
          p_business_id: string
          p_room_id?: string
          p_table_label?: string
        }
        Returns: string
      }
      match_resolve_report: {
        Args: { p_report_id: string; p_status: string }
        Returns: undefined
      }
      match_swipe: {
        Args: { p_action: string; p_business_id: string; p_target_id: string }
        Returns: Json
      }
      match_today: { Args: never; Returns: string }
      match_undo_last: { Args: { p_business_id: string }; Returns: Json }
      match_unkick: {
        Args: { p_business_id: string; p_user_id: string }
        Returns: undefined
      }
      match_wipe_expired: { Args: never; Returns: number }
      match_wipe_user_venue: {
        Args: { p_business_id: string; p_user_id: string }
        Returns: undefined
      }
      match_wipe_user_venue_keep_dms: {
        Args: { p_business_id: string; p_user_id: string }
        Returns: undefined
      }
      megaphone_feed: {
        Args: {
          p_before?: string
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_radius_miles?: number
        }
        Returns: {
          body: string
          business_id: string
          business_name: string
          business_slug: string
          code: string
          comment_count: number
          created_at: string
          discount: string
          distance_miles: number
          expires_at: string
          icon_emoji: string
          id: string
          kind: string
          like_count: number
          liked_by_me: boolean
          logo_url: string
          media_urls: string[]
          room_id: string
          title: string
        }[]
      }
      message_is_objectionable: { Args: { p_text: string }; Returns: boolean }
      message_under_retention_hold: {
        Args: { p_message_id: string }
        Returns: boolean
      }
      my_active_orders: {
        Args: never
        Returns: {
          business_id: string
          business_name: string
          created_at: string
          id: string
          order_number: number
          order_type: string
          status: string
          status_updated_at: string
          table_label: string
        }[]
      }
      my_block_relations: { Args: never; Returns: string[] }
      open_tab_on_table: {
        Args: { p_name?: string; p_table_id: string }
        Returns: Json
      }
      order_notify_staff: {
        Args: { p_kind: string; p_note?: string; p_order_id: string }
        Returns: Json
      }
      owns_business: { Args: { p_business: string }; Returns: boolean }
      owns_business_of_table: { Args: { p_table_id: string }; Returns: boolean }
      owns_room_business: { Args: { p_room: string }; Returns: boolean }
      pos_apply_external_payment: {
        Args: {
          p_business_id: string
          p_method: string
          p_payment_id?: string
          p_table_id: string
          p_tip_cents?: number
        }
        Returns: Json
      }
      pos_apply_payment: {
        Args: { p_payment_id: string; p_tip_cents: number }
        Returns: boolean
      }
      pos_apply_stock_movement: {
        Args: {
          p_business_id: string
          p_menu_item_id: string
          p_mode: string
          p_note?: string
          p_quantity: number
        }
        Returns: {
          movement_id: string
          new_stock: number
        }[]
      }
      pos_approve_order: {
        Args: { p_business_id: string; p_order_id: string }
        Returns: Json
      }
      pos_awaiting_orders: {
        Args: { p_business_id: string }
        Returns: {
          contact_name: string
          created_at: string
          device_strikes: number
          guest_device_id: string
          items: Json
          notes: string
          order_id: string
          subtotal_cents: number
          table_id: string
          table_label: string
        }[]
      }
      pos_business_settings: { Args: { p_business_id: string }; Returns: Json }
      pos_can_access: { Args: { p_business_id: string }; Returns: boolean }
      pos_claim_comanda_print: {
        Args: { p_business_id: string; p_order_id: string }
        Returns: boolean
      }
      pos_close_table_session: {
        Args: { p_business_id: string; p_table_id: string }
        Returns: Json
      }
      pos_combine_tables: {
        Args: {
          p_business_id: string
          p_primary_table_id: string
          p_secondary_table_id: string
        }
        Returns: undefined
      }
      pos_create_check: {
        Args: {
          p_business_id: string
          p_order_item_ids: string[]
          p_table_id: string
        }
        Returns: {
          amount_cents: number
          payment_id: string
        }[]
      }
      pos_create_order: {
        Args: {
          p_business_id: string
          p_items: Json
          p_notes?: string
          p_table_id: string
        }
        Returns: string
      }
      pos_create_split: {
        Args: {
          p_business_id: string
          p_checks: Json
          p_method: string
          p_table_id: string
          p_ways: number
        }
        Returns: {
          amount_cents: number
          kind: string
          order_item_ids: string[]
          payment_id: string
          seat: number
        }[]
      }
      pos_daily_payment_summary: {
        Args: { p_business_id: string; p_day?: string }
        Returns: Json
      }
      pos_guest_claim_share: {
        Args: { p_guest_session_id: string; p_payment_id: string }
        Returns: boolean
      }
      pos_guest_even_plan: {
        Args: { p_business_id: string; p_table_id: string; p_ways: number }
        Returns: {
          amount_cents: number
          claimable: boolean
          payment_id: string
          status: string
        }[]
      }
      pos_guest_table_summary: {
        Args: { p_business_id: string; p_table_id: string }
        Returns: Json
      }
      pos_kds_metrics: {
        Args: { p_business_id: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      pos_kds_metrics_v2: {
        Args: {
          p_business_id: string
          p_from: string
          p_station?: string
          p_taken_by?: string
          p_to: string
          p_tz?: string
        }
        Returns: Json
      }
      pos_kds_settings: { Args: { p_business_id: string }; Returns: Json }
      pos_link_barcode: {
        Args: {
          p_barcode: string
          p_business_id: string
          p_menu_item_id: string
        }
        Returns: boolean
      }
      pos_list_blocked_devices: {
        Args: { p_business_id: string }
        Returns: {
          block_id: string
          blocked_until: string
          created_at: string
          device_id: string
          reason: string
          strikes: number
          unblocked_at: string
        }[]
      }
      pos_mark_comanda_printed: {
        Args: { p_business_id: string; p_order_id: string }
        Returns: undefined
      }
      pos_my_businesses: {
        Args: never
        Returns: {
          business_id: string
          business_name: string
          employee_id: string
          has_pin: boolean
          plan: string
          role: string
        }[]
      }
      pos_open_table_session: {
        Args: { p_business_id: string; p_table_id: string }
        Returns: Json
      }
      pos_payment_voucher: { Args: { p_payment_id: string }; Returns: Json }
      pos_pending_comandas: {
        Args: { p_business_id: string }
        Returns: {
          created_at: string
          order_id: string
          table_label: string
        }[]
      }
      pos_pickup_board: {
        Args: { p_business_id: string }
        Returns: {
          created_at: string
          item_name: string
          item_status: string
          order_id: string
          order_item_id: string
          preparing_at: string
          qty: number
          ready_at: string
          seat: number
          station: string
          table_id: string
          table_label: string
        }[]
      }
      pos_receipts_today: {
        Args: { p_business_id: string }
        Returns: {
          amount_cents: number
          created_at: string
          id: string
          paid_by: string
          payment_method: string
          receipt_code: string
          source: string
          status: string
          table_label: string
          tip_cents: number
        }[]
      }
      pos_reject_order: {
        Args: {
          p_business_id: string
          p_mode?: string
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      pos_release_comanda_print: {
        Args: { p_business_id: string; p_order_id: string }
        Returns: undefined
      }
      pos_session_split_method: {
        Args: { p_business_id: string; p_table_id: string }
        Returns: string
      }
      pos_set_party_size: {
        Args: {
          p_business_id: string
          p_party_size: number
          p_table_id: string
        }
        Returns: undefined
      }
      pos_set_pin: {
        Args: { p_business_id: string; p_pin: string }
        Returns: undefined
      }
      pos_tab_total: {
        Args: { p_business_id: string; p_table_id: string }
        Returns: number
      }
      pos_table_balance: {
        Args: { p_business_id: string; p_table_id: string }
        Returns: Json
      }
      pos_table_items: {
        Args: { p_business_id: string; p_table_id: string }
        Returns: {
          item_name: string
          item_status: string
          menu_item_id: string
          options: Json
          order_id: string
          order_item_id: string
          order_status: string
          price_cents: number
          qty: number
          seat: number
          special_instructions: string
        }[]
      }
      pos_table_session: {
        Args: { p_business_id: string; p_table_id: string }
        Returns: Json
      }
      pos_tables_overview: {
        Args: { p_business_id: string }
        Returns: {
          assignment: string
          awaiting_count: number
          combinable: boolean
          combined_into: string
          combined_seats: number
          floor: string
          has_access_code: boolean
          label: string
          open_since: string
          open_total_cents: number
          party_size: number
          seats: number
          state: string
          table_id: string
        }[]
      }
      pos_unblock_device: {
        Args: { p_block_id: string; p_business_id: string }
        Returns: Json
      }
      pos_uncombine_table: {
        Args: { p_business_id: string; p_table_id: string }
        Returns: undefined
      }
      pos_verify_pin: {
        Args: { p_business_id: string; p_pin: string }
        Returns: boolean
      }
      pos_void_order: {
        Args: { p_business_id: string; p_order_id: string }
        Returns: undefined
      }
      profile_counts: {
        Args: { p_user: string }
        Returns: {
          followers: number
          following: number
          posts: number
        }[]
      }
      purchase_suggestion: {
        Args: { p_business_id: string }
        Returns: {
          item_name: string
          low_stock_threshold: number
          menu_item_id: string
          par_level: number
          stock_count: number
          suggested_cost_cents: number
          suggested_qty: number
          unit_cost_cents: number
        }[]
      }
      purge_expired_messages: { Args: never; Returns: undefined }
      purge_stale_pending_carts: { Args: never; Returns: number }
      push_dispatch: {
        Args: { p_kind: string; p_record: Json }
        Returns: undefined
      }
      record_affiliate_payout: {
        Args: {
          p_affiliate_id: string
          p_commission_ids?: string[]
          p_method?: string
          p_note?: string
          p_reference?: string
        }
        Returns: {
          affiliate_id: string
          amount_cents: number
          created_at: string
          created_by: string
          currency: string
          id: string
          method: string | null
          note: string | null
          paid_at: string
          reference: string | null
        }
        SetofOptions: {
          from: "*"
          to: "affiliate_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      regenerate_room_qr_token: { Args: { _room_id: string }; Returns: string }
      regenerate_table_code: { Args: { p_table_id: string }; Returns: string }
      reject_follow_request: {
        Args: { p_requester: string }
        Returns: undefined
      }
      remove_follower: { Args: { p_follower: string }; Returns: undefined }
      report_content: {
        Args: {
          p_content_id: string
          p_content_type: string
          p_details?: string
          p_reason: string
        }
        Returns: string
      }
      request_or_follow: { Args: { p_target: string }; Returns: string }
      reservation_slot_load: {
        Args: { p_business_id: string; p_reserved_at: string }
        Returns: {
          capacity: number
          reserved: number
        }[]
      }
      resolve_room_qr: {
        Args: { token: string }
        Returns: {
          business_id: string
          business_name: string
          is_sub_room: boolean
          parent_room_id: string
          room_id: string
          room_name: string
        }[]
      }
      resolve_tab_payment: {
        Args: { p_token: string }
        Returns: {
          amount_cents: number
          business_name: string
          status: string
          tab_name: string
          table_label: string
          tip_cents: number
        }[]
      }
      resolve_table_qr: {
        Args: { p_token: string }
        Returns: {
          business_slug: string
          room_qr_token: string
          table_label: string
        }[]
      }
      resolve_table_short: {
        Args: { p_business: string; p_code: string; p_label: string }
        Returns: {
          business_slug: string
          room_qr_token: string
          table_label: string
          table_qr_token: string
        }[]
      }
      resolve_table_waiter_for_attribution: {
        Args: { p_table_id: string }
        Returns: string
      }
      resolve_venue_entry: {
        Args: {
          p_code?: string
          p_label?: string
          p_token?: string
          p_venue?: string
        }
        Returns: {
          business_id: string
          business_name: string
          business_slug: string
          logo_url: string
          room_id: string
          table_label: string
          table_qr_token: string
        }[]
      }
      search_reservation_customers: {
        Args: { p_business_id: string; p_query: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
          phone: string
        }[]
      }
      set_item_status: {
        Args: { p_order_item_id: string; p_status: string }
        Returns: Json
      }
      set_reservation_status: {
        Args: { p_reservation_id: string; p_status: string }
        Returns: undefined
      }
      set_room_password: {
        Args: { password: string; room_id: string }
        Returns: boolean
      }
      set_table_reserved: {
        Args: {
          p_note?: string
          p_reserved: boolean
          p_table_id: string
          p_until?: string
        }
        Returns: undefined
      }
      set_table_subchat:
        | { Args: { p_enable: boolean; p_table_id: string }; Returns: string }
        | {
            Args: {
              p_base_name?: string
              p_enable: boolean
              p_table_id: string
            }
            Returns: string
          }
      settle_tab_payment: { Args: { p_tab_payment_id: string }; Returns: Json }
      social_actor_name: { Args: { p_user_id: string }; Returns: string }
      staff_set_order_status: {
        Args: { p_order_id: string; p_status: string }
        Returns: undefined
      }
      start_dm: {
        Args: { p_target_id: string }
        Returns: {
          awaiting_reply: boolean
          created_at: string
          ephemeral_business_id: string | null
          exit_hidden_at_a: string | null
          exit_hidden_at_b: string | null
          first_sender_id: string | null
          hidden_at_a: string | null
          hidden_at_b: string | null
          id: string
          last_message_at: string
          user_a: string
          user_b: string
        }
        SetofOptions: {
          from: "*"
          to: "dm_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tab_amount_due: { Args: { p_tab_id: string }; Returns: Json }
      tod_accept_terms: { Args: { p_version?: string }; Returns: undefined }
      tod_applaud: { Args: { p_draw_id: string }; Returns: Json }
      tod_business_stats: {
        Args: { p_business_id: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      tod_category_enabled: {
        Args: { p_business_id: string; p_category: string }
        Returns: boolean
      }
      tod_close_round: { Args: { p_round_id: string }; Returns: Json }
      tod_create_round: {
        Args: { p_category: string; p_official?: boolean; p_room_id: string }
        Returns: Json
      }
      tod_decide: {
        Args: { p_draw_id: string; p_publish: boolean }
        Returns: Json
      }
      tod_draw: {
        Args: { p_choice: string; p_round_id: string }
        Returns: Json
      }
      tod_enabled_for_business: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      tod_expire: { Args: never; Returns: number }
      tod_kick: {
        Args: { p_business_id: string; p_reason?: string; p_user_id: string }
        Returns: Json
      }
      tod_patch_message: {
        Args: { p_message_id: string; p_patch: Json }
        Returns: undefined
      }
      tod_post_message: {
        Args: {
          p_body: string
          p_metadata: Json
          p_room_id: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      tod_purge: { Args: never; Returns: undefined }
      tod_resolve_report: {
        Args: { p_report_id: string; p_status: string }
        Returns: undefined
      }
      tod_staff_hide: {
        Args: { p_message_id: string; p_reason?: string }
        Returns: Json
      }
      tod_unkick: {
        Args: { p_business_id: string; p_user_id: string }
        Returns: Json
      }
      unblock_user: { Args: { p_target: string }; Returns: undefined }
      update_my_settings: { Args: { p_patch: Json }; Returns: Json }
      update_reservation: {
        Args: {
          p_event_type?: string
          p_first_name?: string
          p_last_name?: string
          p_party_size: number
          p_phone?: string
          p_reservation_id: string
          p_reserved_at: string
          p_special_requests?: string
          p_table_ids: string[]
        }
        Returns: undefined
      }
      user_has_tab_at_table: { Args: { p_table_id: string }; Returns: boolean }
      username_available: { Args: { check_username: string }; Returns: boolean }
      validate_promo_code: { Args: { p_code: string }; Returns: Json }
      venue_distance_m: {
        Args: { p_business_id: string; p_lat: number; p_lng: number }
        Returns: number
      }
      venue_exits_purge: { Args: never; Returns: number }
      venue_inside: {
        Args: { p_business_id: string; p_lat: number; p_lng: number }
        Returns: boolean
      }
      venue_order_access: {
        Args: { p_business_id: string; p_lat?: number; p_lng?: number }
        Returns: Json
      }
      venue_people_counts: {
        Args: { p_business_ids: string[] }
        Returns: {
          business_id: string
          people: number
        }[]
      }
      venue_presence_ok: {
        Args: { p_business_id: string; p_user_id: string }
        Returns: boolean
      }
      venue_session_end: {
        Args: { p_business_id: string; p_reason?: string }
        Returns: undefined
      }
      venue_session_expires_at: {
        Args: { p_business_id: string }
        Returns: string
      }
      venue_session_resume: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      verify_room_password: {
        Args: { password: string; room_id: string }
        Returns: boolean
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
    Enums: {},
  },
} as const
