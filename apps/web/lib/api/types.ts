export type Role = "admin" | "member";
export type InventoryStatus = "in_stock" | "low_stock" | "ordered" | "discontinued";
export type EventAttendance = "upcoming" | "attending" | "maybe" | "declined";

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
}

export interface MembershipOut {
  workspace_id: number;
  workspace_name: string;
  role: Role;
}

export interface MeResponse {
  id: number;
  email: string;
  name: string;
  workspaces: MembershipOut[];
}

export interface WorkspaceOut {
  id: number;
  name: string;
}

export interface WorkspaceMemberOut {
  name: string;
  email: string;
  role: Role;
  joined_at: string;
}

export interface InventoryItemOut {
  id: number;
  workspace_id: number;
  name: string;
  normalized_name: string;
  category: string;
  quantity: number;
  unit: string;
  low_stock_threshold: number;
  status: InventoryStatus;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit: string;
  category?: string | null;
  price?: number | null;
}

export interface ReceiptExtraction {
  vendor?: string | null;
  date?: string | null;
  items: ReceiptItem[];
}

export type ImportDuplicateAction = "auto" | "merge" | "create_new" | "review";

export interface DuplicateSuggestionCandidate {
  item_id: number;
  name: string;
  unit: string;
  category: string;
  quantity: number;
  similarity_score: number;
  reason: string;
}

export interface DuplicateSuggestionForImportItem {
  import_index: number;
  import_name: string;
  import_unit: string;
  candidates: DuplicateSuggestionCandidate[];
  recommended_action: ImportDuplicateAction;
  recommended_merge_item_id?: number | null;
}

export interface InventoryDuplicateSuggestionResponse {
  suggestions: DuplicateSuggestionForImportItem[];
}

export interface CopilotResponse {
  answer: string;
  tools_used: string[];
  data?: Record<string, unknown> | null;
}

export interface EventOut {
  id: number;
  workspace_id: number;
  title: string;
  start_at: string;
  end_at: string;
  location: string;
  description: string;
  status: EventAttendance;
  invite_message: string;
}

export interface EventInviteOut {
  id: number;
  event_id: number;
  invited_user_email: string;
  invited_user_id?: number | null;
  status: EventAttendance;
}

export interface EventDraft {
  title: string;
  start_at: string;
  end_at: string;
  location?: string | null;
  description?: string | null;
  invitees: string[];
}

export interface SuggestAlternativesResponse {
  has_conflict: boolean;
  conflicts: EventOut[];
  suggestions: Array<{
    start_at: string;
    end_at: string;
    reason: string;
  }>;
}

export interface EventDescriptionResponse {
  description: string;
}

export interface InviteMessageResponse {
  message: string;
}
