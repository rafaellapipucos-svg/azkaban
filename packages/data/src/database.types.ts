
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "key": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"areas": {
                  Row: {
                    "color_token": string,"i18n_key": string,"icon": string,"id": string,"key": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "color_token": string,"i18n_key": string,"icon": string,"id"?: string,"key": string,"sort_order"?: number
                  }
                  Update: {
                    "color_token"?: string,"i18n_key"?: string,"icon"?: string,"id"?: string,"key"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"contexts": {
                  Row: {
                    "archived_at": string | null,"area_id": string,"color_token": string,"created_at": string,"created_by": string | null,"group_id": string | null,"icon": string,"id": string,"name": string,"owner_user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"area_id": string,"color_token": string,"created_at"?: string,"created_by"?: string | null,"group_id"?: string | null,"icon": string,"id"?: string,"name": string,"owner_user_id"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"area_id"?: string,"color_token"?: string,"created_at"?: string,"created_by"?: string | null,"group_id"?: string | null,"icon"?: string,"id"?: string,"name"?: string,"owner_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contexts_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contexts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contexts_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contexts_owner_user_id_fkey"
      columns: ["owner_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_invites": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string | null,"expires_at": string,"group_id": string,"id": string,"max_uses": number | null,"revoked_at": string | null,"role": Database["public"]['Enums']["group_role"],"use_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at": string,"group_id": string,"id"?: string,"max_uses"?: number | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["group_role"],"use_count"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"group_id"?: string,"id"?: string,"max_uses"?: number | null,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["group_role"],"use_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_invites_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_invites_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"group_members": {
                  Row: {
                    "group_id": string,"invited_by": string | null,"joined_at": string,"role": Database["public"]['Enums']["group_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"invited_by"?: string | null,"joined_at"?: string,"role": Database["public"]['Enums']["group_role"],"user_id": string
                  }
                  Update: {
                    "group_id"?: string,"invited_by"?: string | null,"joined_at"?: string,"role"?: Database["public"]['Enums']["group_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_types": {
                  Row: {
                    "key": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"sort_order"?: number
                  }
                  Update: {
                    "key"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"groups": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"owner_id": string,"settings": NonNullable<Json>,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"owner_id"?: string,"settings"?: NonNullable<Json>,"type": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"settings"?: NonNullable<Json>,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_type_fkey"
      columns: ["type"]
isOneToOne: false
      referencedRelation: "group_types"
      referencedColumns: ["key"]
    }
                  ]
                },"occurrence_transitions": {
                  Row: {
                    "actor": Database["public"]['Enums']["occurrence_actor"],"from_status": Database["public"]['Enums']["occurrence_status"],"to_status": Database["public"]['Enums']["occurrence_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor": Database["public"]['Enums']["occurrence_actor"],"from_status": Database["public"]['Enums']["occurrence_status"],"to_status": Database["public"]['Enums']["occurrence_status"]
                  }
                  Update: {
                    "actor"?: Database["public"]['Enums']["occurrence_actor"],"from_status"?: Database["public"]['Enums']["occurrence_status"],"to_status"?: Database["public"]['Enums']["occurrence_status"]
                  }
                  Relationships: [
                    
                  ]
                },"permissions": {
                  Row: {
                    "key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string
                  }
                  Update: {
                    "key"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"locale": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string,"locale"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"locale"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"role_permissions": {
                  Row: {
                    "permission_key": string,"role": Database["public"]['Enums']["group_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "permission_key": string,"role": Database["public"]['Enums']["group_role"]
                  }
                  Update: {
                    "permission_key"?: string,"role"?: Database["public"]['Enums']["group_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    }
                  ]
                },"task_occurrences": {
                  Row: {
                    "assignee_id": string,"id": string,"late": boolean,"overdue_at": string,"scheduled_due": string,"scheduled_start": string,"status": Database["public"]['Enums']["occurrence_status"],"status_changed_at": string | null,"status_changed_by": string | null,"status_reason": string | null,"task_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_id": string,"id"?: string,"late"?: boolean,"overdue_at": string,"scheduled_due": string,"scheduled_start": string,"status"?: Database["public"]['Enums']["occurrence_status"],"status_changed_at"?: string | null,"status_changed_by"?: string | null,"status_reason"?: string | null,"task_id": string
                  }
                  Update: {
                    "assignee_id"?: string,"id"?: string,"late"?: boolean,"overdue_at"?: string,"scheduled_due"?: string,"scheduled_start"?: string,"status"?: Database["public"]['Enums']["occurrence_status"],"status_changed_at"?: string | null,"status_changed_by"?: string | null,"status_reason"?: string | null,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_occurrences_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_occurrences_status_changed_by_fkey"
      columns: ["status_changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_occurrences_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"task_status_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"from_status": Database["public"]['Enums']["occurrence_status"],"id": string,"occurrence_id": string,"reason": string | null,"to_status": Database["public"]['Enums']["occurrence_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_status": Database["public"]['Enums']["occurrence_status"],"id"?: string,"occurrence_id": string,"reason"?: string | null,"to_status": Database["public"]['Enums']["occurrence_status"]
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_status"?: Database["public"]['Enums']["occurrence_status"],"id"?: string,"occurrence_id"?: string,"reason"?: string | null,"to_status"?: Database["public"]['Enums']["occurrence_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_status_history_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_status_history_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "task_occurrences"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "archived_at": string | null,"assignee_id": string,"context_id": string,"created_at": string,"created_by": string | null,"difficulty": Database["public"]['Enums']["task_difficulty"],"due_at": string | null,"duration_min": number | null,"exdates": (string)[],"group_id": string | null,"id": string,"materialized_until": string | null,"notes": string | null,"parent_task_id": string | null,"priority": Database["public"]['Enums']["task_priority"],"reminders": NonNullable<Json>,"requires_admin_approval": boolean,"requires_partial_reason": boolean,"requires_photo_proof": boolean,"rrule": string | null,"schedule_type": Database["public"]['Enums']["schedule_type"],"start_at": string | null,"timezone": string,"title": string,"visibility": Database["public"]['Enums']["task_visibility"],"can_view_task": boolean | null
                  }
                  ComputedFields: "can_view_task"
                  Insert: {
                    "archived_at"?: string | null,"assignee_id": string,"context_id": string,"created_at"?: string,"created_by"?: string | null,"difficulty": Database["public"]['Enums']["task_difficulty"],"due_at"?: string | null,"duration_min"?: number | null,"exdates"?: (string)[],"group_id"?: string | null,"id"?: string,"materialized_until"?: string | null,"notes"?: string | null,"parent_task_id"?: string | null,"priority": Database["public"]['Enums']["task_priority"],"reminders": NonNullable<Json>,"requires_admin_approval": boolean,"requires_partial_reason": boolean,"requires_photo_proof": boolean,"rrule"?: string | null,"schedule_type": Database["public"]['Enums']["schedule_type"],"start_at"?: string | null,"timezone": string,"title": string,"visibility": Database["public"]['Enums']["task_visibility"]
                  }
                  Update: {
                    "archived_at"?: string | null,"assignee_id"?: string,"context_id"?: string,"created_at"?: string,"created_by"?: string | null,"difficulty"?: Database["public"]['Enums']["task_difficulty"],"due_at"?: string | null,"duration_min"?: number | null,"exdates"?: (string)[],"group_id"?: string | null,"id"?: string,"materialized_until"?: string | null,"notes"?: string | null,"parent_task_id"?: string | null,"priority"?: Database["public"]['Enums']["task_priority"],"reminders"?: NonNullable<Json>,"requires_admin_approval"?: boolean,"requires_partial_reason"?: boolean,"requires_photo_proof"?: boolean,"rrule"?: string | null,"schedule_type"?: Database["public"]['Enums']["schedule_type"],"start_at"?: string | null,"timezone"?: string,"title"?: string,"visibility"?: Database["public"]['Enums']["task_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_context_id_fkey"
      columns: ["context_id"]
isOneToOne: false
      referencedRelation: "contexts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_parent_task_id_fkey"
      columns: ["parent_task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"xp_events": {
                  Row: {
                    "amount": number,"created_at": string,"group_id": string | null,"id": string,"occurrence_id": string | null,"reason": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"group_id"?: string | null,"id"?: string,"occurrence_id"?: string | null,"reason": string,"user_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"group_id"?: string | null,"id"?: string,"occurrence_id"?: string | null,"reason"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "xp_events_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "xp_events_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "task_occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "xp_events_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "invite_code": string }; Returns: string
                           },
"call_materialize_occurrences":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"can_delete_task":
{ Args: { "p_task_id": string }; Returns: boolean
                           },
"can_edit_task":
{ Args: { "p_task_id": string }; Returns: boolean
                           },
"can_view_task":
{ Args: { "p_task": Omit<Database["public"]['Tables']["tasks"]['Row'], Database["public"]['Tables']["tasks"]['ComputedFields']> }; Returns: boolean
                           } |
{ Args: { "p_task_id": string }; Returns: boolean
                           },
"delete_task":
{ Args: { "p_head_rrule": string,"p_occurrence_id": string,"p_scope": Database["public"]['Enums']["task_edit_scope"] }; Returns: undefined
                           },
"edit_task":
{ Args: { "p_head_rrule": string,"p_occurrence_id": string,"p_rrule": string,"p_scope": Database["public"]['Enums']["task_edit_scope"],"p_task": Json }; Returns: (string)[]
                           },
"exclude_kept_days":
{ Args: { "p_task_id": string }; Returns: undefined
                           },
"generate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_invite_preview":
{ Args: { "invite_code": string }; Returns: {
              "group_name": string,"group_type": string,"role": Database["public"]['Enums']["group_role"]
            }[]
                           },
"group_member_profiles":
{ Args: { "target_group_id": string }; Returns: {
              "display_name": string,"joined_at": string,"role": Database["public"]['Enums']["group_role"],"user_id": string
            }[]
                           },
"has_permission":
{ Args: { "permission": string,"target_group_id": string }; Returns: boolean
                           },
"is_group_member":
{ Args: { "target_group_id": string }; Returns: boolean
                           },
"is_valid_rrule":
{ Args: { "p_rrule": string }; Returns: boolean
                           },
"occurrence_window":
{ Args: { "p_due_at": string,"p_duration_min": number,"p_schedule_type": Database["public"]['Enums']["schedule_type"],"p_start_at": string,"p_timezone": string }; Returns: {
              "scheduled_due": string,"scheduled_start": string
            }[]
                           },
"set_member_role":
{ Args: { "new_role": Database["public"]['Enums']["group_role"],"target_group_id": string,"target_user_id": string }; Returns: undefined
                           },
"set_occurrence_status":
{ Args: { "p_expected_status": Database["public"]['Enums']["occurrence_status"],"p_occurrence_id": string,"p_reason": string,"p_to_status": Database["public"]['Enums']["occurrence_status"] }; Returns: {
              "assignee_id": string,
"id": string,
"late": boolean,
"overdue_at": string,
"scheduled_due": string,
"scheduled_start": string,
"status": Database["public"]['Enums']["occurrence_status"],
"status_changed_at": string | null,
"status_changed_by": string | null,
"status_reason": string | null,
"task_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "task_occurrences"
        isOneToOne: true
        isSetofReturn: false
      } },
"task_rules":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"team_overview":
{ Args: { "p_from": string,"p_group_id": string,"p_timezone": string,"p_to": string }; Returns: {
              "date": string,"display_name": string,"done": number,"late": number,"missed": number,"partial": number,"pending": number,"user_id": string
            }[]
                           },
"transfer_group_ownership":
{ Args: { "new_owner_id": string,"target_group_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "group_role": "owner"|"admin"|"member","occurrence_actor": "assignee"|"editor"|"deleter"|"system","occurrence_status": "pending"|"done"|"partial"|"missed"|"cancelled","schedule_type": "timed"|"all_day"|"deadline","task_difficulty": "easy"|"medium"|"hard","task_edit_scope": "this"|"this_and_following"|"all","task_priority": "low"|"normal"|"high","task_visibility": "group"|"private"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "group_role": ["owner", "admin", "member"],"occurrence_actor": ["assignee", "editor", "deleter", "system"],"occurrence_status": ["pending", "done", "partial", "missed", "cancelled"],"schedule_type": ["timed", "all_day", "deadline"],"task_difficulty": ["easy", "medium", "hard"],"task_edit_scope": ["this", "this_and_following", "all"],"task_priority": ["low", "normal", "high"],"task_visibility": ["group", "private"]
          }
        }
} as const
