
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
                    "archived_at": string | null,"area_id": string,"color_token": string,"created_at": string,"created_by": string | null,"group_id": string | null,"icon": string,"id": string,"location_address": string | null,"location_lat": number | null,"location_lng": number | null,"location_radius_m": number | null,"name": string,"owner_user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"area_id": string,"color_token": string,"created_at"?: string,"created_by"?: string | null,"group_id"?: string | null,"icon": string,"id"?: string,"location_address"?: string | null,"location_lat"?: number | null,"location_lng"?: number | null,"location_radius_m"?: number | null,"name": string,"owner_user_id"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"area_id"?: string,"color_token"?: string,"created_at"?: string,"created_by"?: string | null,"group_id"?: string | null,"icon"?: string,"id"?: string,"location_address"?: string | null,"location_lat"?: number | null,"location_lng"?: number | null,"location_radius_m"?: number | null,"name"?: string,"owner_user_id"?: string | null
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
                    "created_at": string,"display_name": string,"id": string,"locale": string,"proof_consent_at": string | null,"proof_consent_version": number | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string,"locale"?: string,"proof_consent_at"?: string | null,"proof_consent_version"?: number | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"locale"?: string,"proof_consent_at"?: string | null,"proof_consent_version"?: number | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"proof_challenges": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"occurrence_id": string,"used_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at": string,"id"?: string,"occurrence_id": string,"used_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"occurrence_id"?: string,"used_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "proof_challenges_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "task_occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proof_challenges_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
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
                    "assignee_id": string,"auto_miss_at": string,"current_proof_id": string | null,"id": string,"late": boolean,"overdue_at": string,"proof_review_status": Database["public"]['Enums']["proof_review_status"] | null,"scheduled_due": string,"scheduled_start": string,"status": Database["public"]['Enums']["occurrence_status"],"status_changed_at": string | null,"status_changed_by": string | null,"status_reason": string | null,"task_id": string,"occurrence_award_xp": undefined | null
                  }
                  ComputedFields: "occurrence_award_xp"
                  Insert: {
                    "assignee_id": string,"auto_miss_at": string,"current_proof_id"?: string | null,"id"?: string,"late"?: boolean,"overdue_at": string,"proof_review_status"?: Database["public"]['Enums']["proof_review_status"] | null,"scheduled_due": string,"scheduled_start": string,"status"?: Database["public"]['Enums']["occurrence_status"],"status_changed_at"?: string | null,"status_changed_by"?: string | null,"status_reason"?: string | null,"task_id": string
                  }
                  Update: {
                    "assignee_id"?: string,"auto_miss_at"?: string,"current_proof_id"?: string | null,"id"?: string,"late"?: boolean,"overdue_at"?: string,"proof_review_status"?: Database["public"]['Enums']["proof_review_status"] | null,"scheduled_due"?: string,"scheduled_start"?: string,"status"?: Database["public"]['Enums']["occurrence_status"],"status_changed_at"?: string | null,"status_changed_by"?: string | null,"status_reason"?: string | null,"task_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_occurrences_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_occurrences_current_proof_fkey"
      columns: ["current_proof_id","id"]
isOneToOne: false
      referencedRelation: "task_proofs"
      referencedColumns: ["id","occurrence_id"]
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
                },"task_proofs": {
                  Row: {
                    "accuracy_m": number | null,"app_version": string | null,"captured_at_device": string,"challenge_id": string,"clock_delta_seconds": number,"distance_m": number | null,"flags": (string)[],"height_px": number,"id": string,"occurrence_id": string,"photo_deleted_at": string | null,"platform": string | null,"received_at": string,"review_note": string | null,"review_status": Database["public"]['Enums']["proof_review_status"],"reviewed_at": string | null,"reviewed_by": string | null,"sha256": string,"size_bytes": number,"storage_path": string | null,"superseded_at": string | null,"user_agent": string | null,"user_id": string | null,"width_px": number,"can_view_proof": boolean | null
                  }
                  ComputedFields: "can_view_proof"
                  Insert: {
                    "accuracy_m"?: number | null,"app_version"?: string | null,"captured_at_device": string,"challenge_id": string,"clock_delta_seconds": number,"distance_m"?: number | null,"flags"?: (string)[],"height_px": number,"id"?: string,"occurrence_id": string,"photo_deleted_at"?: string | null,"platform"?: string | null,"received_at": string,"review_note"?: string | null,"review_status"?: Database["public"]['Enums']["proof_review_status"],"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sha256": string,"size_bytes": number,"storage_path"?: string | null,"superseded_at"?: string | null,"user_agent"?: string | null,"user_id"?: string | null,"width_px": number
                  }
                  Update: {
                    "accuracy_m"?: number | null,"app_version"?: string | null,"captured_at_device"?: string,"challenge_id"?: string,"clock_delta_seconds"?: number,"distance_m"?: number | null,"flags"?: (string)[],"height_px"?: number,"id"?: string,"occurrence_id"?: string,"photo_deleted_at"?: string | null,"platform"?: string | null,"received_at"?: string,"review_note"?: string | null,"review_status"?: Database["public"]['Enums']["proof_review_status"],"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sha256"?: string,"size_bytes"?: number,"storage_path"?: string | null,"superseded_at"?: string | null,"user_agent"?: string | null,"user_id"?: string | null,"width_px"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_proofs_challenge_fkey"
      columns: ["challenge_id","occurrence_id","user_id"]
isOneToOne: false
      referencedRelation: "proof_challenges"
      referencedColumns: ["id","occurrence_id","user_id"]
    },{
      foreignKeyName: "task_proofs_occurrence_id_fkey"
      columns: ["occurrence_id"]
isOneToOne: false
      referencedRelation: "task_occurrences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_proofs_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_proofs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"task_status_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"from_status": Database["public"]['Enums']["occurrence_status"],"id": string,"occurrence_id": string,"proof_review_status": Database["public"]['Enums']["proof_review_status"] | null,"reason": string | null,"to_status": Database["public"]['Enums']["occurrence_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_status": Database["public"]['Enums']["occurrence_status"],"id"?: string,"occurrence_id": string,"proof_review_status"?: Database["public"]['Enums']["proof_review_status"] | null,"reason"?: string | null,"to_status": Database["public"]['Enums']["occurrence_status"]
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_status"?: Database["public"]['Enums']["occurrence_status"],"id"?: string,"occurrence_id"?: string,"proof_review_status"?: Database["public"]['Enums']["proof_review_status"] | null,"reason"?: string | null,"to_status"?: Database["public"]['Enums']["occurrence_status"]
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
"call_proof_retention":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"can_delete_task":
{ Args: { "p_task_id": string }; Returns: boolean
                           },
"can_edit_task":
{ Args: { "p_task_id": string }; Returns: boolean
                           },
"can_review_proof":
{ Args: { "p_author_id": string,"p_occurrence_id": string }; Returns: boolean
                           },
"can_view_proof":
{ Args: { "p_proof": Omit<Database["public"]['Tables']["task_proofs"]['Row'], Database["public"]['Tables']["task_proofs"]['ComputedFields']> }; Returns: boolean
                           },
"can_view_task":
{ Args: { "p_task": Omit<Database["public"]['Tables']["tasks"]['Row'], Database["public"]['Tables']["tasks"]['ComputedFields']> }; Returns: boolean
                           } |
{ Args: { "p_task_id": string }; Returns: boolean
                           },
"claim_proof_challenge":
{ Args: { "p_nonce": string,"p_user_id": string }; Returns: Json
                           },
"commit_proof":
{ Args: { "p_accuracy_m": number,"p_app_version": string,"p_captured_at_device": string,"p_distance_m": number,"p_flags": (string)[],"p_height_px": number,"p_nonce": string,"p_platform": string,"p_sha256": string,"p_size_bytes": number,"p_storage_path": string,"p_user_agent": string,"p_user_id": string,"p_width_px": number }; Returns: Json
                           },
"delete_stale_proof_challenges":
{ Args: Record<PropertyKey, never>; Returns: number
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
"is_valid_timezone":
{ Args: { "p_timezone": string }; Returns: boolean
                           },
"issue_proof_challenge":
{ Args: { "p_occurrence_id": string }; Returns: Json
                           },
"mark_proof_photo_deleted":
{ Args: { "p_proof_id": string }; Returns: undefined
                           },
"occurrence_award_xp":
{ Args: { "p_occ": Omit<Database["public"]['Tables']["task_occurrences"]['Row'], Database["public"]['Tables']["task_occurrences"]['ComputedFields']> }; Returns: undefined
                           },
"occurrence_forgives_overdue":
{ Args: { "p_group_id": string,"p_new_assignee": string,"p_old_assignee": string,"p_visibility": Database["public"]['Enums']["task_visibility"] }; Returns: boolean
                           },
"occurrence_window":
{ Args: { "p_due_at": string,"p_duration_min": number,"p_schedule_type": Database["public"]['Enums']["schedule_type"],"p_start_at": string,"p_timezone": string }; Returns: {
              "scheduled_due": string,"scheduled_start": string
            }[]
                           },
"orphan_proof_objects":
{ Args: { "p_limit": number }; Returns: {
              "name": string
            }[]
                           },
"proof_assert_open":
{ Args: { "p_at": string,"p_issued_at": string,"p_occ": Omit<Database["public"]['Tables']["task_occurrences"]['Row'], Database["public"]['Tables']["task_occurrences"]['ComputedFields']>,"p_user": string }; Returns: undefined
                           },
"proof_rules":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"proof_user_can":
{ Args: { "p_group": string,"p_key": string,"p_user": string }; Returns: boolean
                           },
"proofs_due_for_retention":
{ Args: { "p_limit": number }; Returns: {
              "proof_id": string,"storage_path": string
            }[]
                           },
"record_proof_consent":
{ Args: { "p_version": number }; Returns: undefined
                           },
"review_proof":
{ Args: { "p_decision": string,"p_note": string,"p_proof_id": string,"p_to_status": Database["public"]['Enums']["occurrence_status"] }; Returns: {
              "assignee_id": string,
"auto_miss_at": string,
"current_proof_id": string | null,
"id": string,
"late": boolean,
"overdue_at": string,
"proof_review_status": Database["public"]['Enums']["proof_review_status"] | null,
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
"set_member_role":
{ Args: { "new_role": Database["public"]['Enums']["group_role"],"target_group_id": string,"target_user_id": string }; Returns: undefined
                           },
"set_occurrence_status":
{ Args: { "p_expected_status": Database["public"]['Enums']["occurrence_status"],"p_occurrence_id": string,"p_reason": string,"p_to_status": Database["public"]['Enums']["occurrence_status"] }; Returns: {
              "assignee_id": string,
"auto_miss_at": string,
"current_proof_id": string | null,
"id": string,
"late": boolean,
"overdue_at": string,
"proof_review_status": Database["public"]['Enums']["proof_review_status"] | null,
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
            "group_role": "owner"|"admin"|"member","occurrence_actor": "assignee"|"editor"|"deleter"|"system"|"reviewer","occurrence_status": "pending"|"done"|"partial"|"missed"|"cancelled","proof_review_status": "unreviewed"|"in_review"|"approved"|"disputed","schedule_type": "timed"|"all_day"|"deadline","task_difficulty": "easy"|"medium"|"hard","task_edit_scope": "this"|"this_and_following"|"all","task_priority": "low"|"normal"|"high","task_visibility": "group"|"private"
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
            "group_role": ["owner", "admin", "member"],"occurrence_actor": ["assignee", "editor", "deleter", "system", "reviewer"],"occurrence_status": ["pending", "done", "partial", "missed", "cancelled"],"proof_review_status": ["unreviewed", "in_review", "approved", "disputed"],"schedule_type": ["timed", "all_day", "deadline"],"task_difficulty": ["easy", "medium", "hard"],"task_edit_scope": ["this", "this_and_following", "all"],"task_priority": ["low", "normal", "high"],"task_visibility": ["group", "private"]
          }
        }
} as const
