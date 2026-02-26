import enum
from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, model_validator

from .models import EventAttendance, InventoryStatus, Role


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class WorkspaceMemberInviteRequest(BaseModel):
    email: EmailStr
    role: Role = Role.member


class WorkspaceMemberRoleUpdateRequest(BaseModel):
    role: Role


class WorkspaceMemberRoleUpdateByEmailRequest(BaseModel):
    email: EmailStr
    role: Role


class WorkspaceOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class MembershipOut(BaseModel):
    workspace_id: int
    workspace_name: str
    role: Role


class WorkspaceMemberOut(BaseModel):
    name: str
    email: EmailStr
    role: Role
    joined_at: datetime


class MeResponse(BaseModel):
    id: int
    email: EmailStr
    name: str
    workspaces: list[MembershipOut]


class InventoryItemBase(BaseModel):
    name: str
    vendor: str | None = None
    category: str | None = None
    quantity: float = 0
    unit: str | None = None
    low_stock_threshold: float = 1
    status: InventoryStatus | None = None


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    name: str | None = None
    vendor: str | None = None
    category: str | None = None
    quantity: float | None = None
    unit: str | None = None
    low_stock_threshold: float | None = None
    status: InventoryStatus | None = None


class InventoryItemOut(BaseModel):
    id: int
    workspace_id: int
    name: str
    normalized_name: str
    vendor: str | None
    category: str
    quantity: float
    unit: str
    low_stock_threshold: float
    status: InventoryStatus

    model_config = {"from_attributes": True}


class ReceiptItem(BaseModel):
    name: str
    quantity: float = 1
    unit: str = "units"
    vendor: str | None = None
    category: str | None = None
    price: float | None = None


class ReceiptExtraction(BaseModel):
    vendor: str | None = None
    date: str | None = None
    items: list[ReceiptItem]


class ImportDuplicateAction(str, enum.Enum):
    auto = "auto"
    merge = "merge"
    create_new = "create_new"
    review = "review"


class InventoryImportItem(ReceiptItem):
    duplicate_action: ImportDuplicateAction = ImportDuplicateAction.auto
    merge_item_id: int | None = None


class InventoryImportCommitRequest(BaseModel):
    items: list[InventoryImportItem]


class DuplicateSuggestionCandidate(BaseModel):
    item_id: int
    name: str
    unit: str
    category: str
    quantity: float
    similarity_score: float
    reason: str


class DuplicateSuggestionForImportItem(BaseModel):
    import_index: int
    import_name: str
    import_unit: str
    candidates: list[DuplicateSuggestionCandidate]
    recommended_action: ImportDuplicateAction
    recommended_merge_item_id: int | None = None


class InventoryDuplicateSuggestionRequest(BaseModel):
    items: list[ReceiptItem]


class InventoryDuplicateSuggestionResponse(BaseModel):
    suggestions: list[DuplicateSuggestionForImportItem]


class CopilotRequest(BaseModel):
    query: str


class InventoryPlannerMetric(str, enum.Enum):
    rows = "rows"
    count_items = "count_items"
    sum_quantity = "sum_quantity"
    count_low_stock = "count_low_stock"
    low_stock_ratio = "low_stock_ratio"


class InventoryPlannerGroupBy(str, enum.Enum):
    none = "none"
    category = "category"
    vendor = "vendor"
    status = "status"
    unit = "unit"
    item = "item"


class InventoryPlannerSortDirection(str, enum.Enum):
    asc = "asc"
    desc = "desc"


class InventoryPlannerFilterField(str, enum.Enum):
    name = "name"
    vendor = "vendor"
    category = "category"
    status = "status"
    unit = "unit"
    quantity = "quantity"
    low_stock = "low_stock"


class InventoryPlannerFilterOperator(str, enum.Enum):
    eq = "eq"
    contains = "contains"
    lt = "lt"
    lte = "lte"
    gt = "gt"
    gte = "gte"


class InventoryPlannerFilter(BaseModel):
    field: InventoryPlannerFilterField
    op: InventoryPlannerFilterOperator
    value: str | float | bool


class InventoryCopilotPlan(BaseModel):
    metric: InventoryPlannerMetric = InventoryPlannerMetric.rows
    group_by: InventoryPlannerGroupBy = InventoryPlannerGroupBy.none
    filters: list[InventoryPlannerFilter] = Field(default_factory=list)
    sort_by: str = "metric"
    sort_direction: InventoryPlannerSortDirection = InventoryPlannerSortDirection.desc
    limit: int = 20

    @model_validator(mode="after")
    def validate_plan_shape(self) -> "InventoryCopilotPlan":
        if self.limit < 1 or self.limit > 100:
            raise ValueError("limit must be between 1 and 100")

        if self.metric == InventoryPlannerMetric.rows and self.group_by != InventoryPlannerGroupBy.none:
            raise ValueError("rows metric requires group_by='none'")
        if self.metric != InventoryPlannerMetric.rows and self.group_by == InventoryPlannerGroupBy.none:
            allowed_scalar_metrics = {
                InventoryPlannerMetric.count_items,
                InventoryPlannerMetric.sum_quantity,
                InventoryPlannerMetric.count_low_stock,
                InventoryPlannerMetric.low_stock_ratio,
            }
            if self.metric not in allowed_scalar_metrics:
                raise ValueError("invalid scalar metric for group_by='none'")

        if self.metric == InventoryPlannerMetric.rows:
            allowed_sort = {"name", "quantity", "vendor", "category", "status", "unit"}
            if self.sort_by not in allowed_sort:
                raise ValueError("rows metric supports sort_by in name, quantity, vendor, category, status, unit")
        elif self.group_by == InventoryPlannerGroupBy.none:
            if self.sort_by != "metric":
                raise ValueError("scalar metrics require sort_by='metric'")
        else:
            if self.sort_by not in {"metric", "group"}:
                raise ValueError("grouped metrics require sort_by='metric' or 'group'")

        return self


class CopilotResponse(BaseModel):
    answer: str
    tools_used: list[str]
    data: dict[str, Any] | None = None


class EventBase(BaseModel):
    title: str
    start_at: datetime
    end_at: datetime
    location: str | None = ""
    description: str | None = ""
    status: EventAttendance = EventAttendance.upcoming


class EventCreate(EventBase):
    invitees: list[EmailStr] = []


class EventUpdate(BaseModel):
    title: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    location: str | None = None
    description: str | None = None
    status: EventAttendance | None = None
    invitees: list[EmailStr] | None = None


class EventOut(BaseModel):
    id: int
    workspace_id: int
    title: str
    start_at: datetime
    end_at: datetime
    location: str
    description: str
    status: EventAttendance
    invite_message: str

    model_config = {"from_attributes": True}


class EventInviteCreateRequest(BaseModel):
    email: EmailStr


class EventInviteRespondRequest(BaseModel):
    invite_id: int
    status: EventAttendance


class EventInviteOut(BaseModel):
    id: int
    event_id: int
    invited_user_email: EmailStr
    invited_user_id: int | None
    status: EventAttendance

    model_config = {"from_attributes": True}


class EventDraft(BaseModel):
    title: str
    start_at: datetime
    end_at: datetime
    location: str | None = ""
    description: str | None = ""
    invitees: list[EmailStr] = []


class NLCreateRequest(BaseModel):
    prompt: str


class AlternativeSuggestion(BaseModel):
    start_at: datetime
    end_at: datetime
    reason: str


class SuggestAlternativesRequest(BaseModel):
    start_at: datetime
    end_at: datetime


class EventDescriptionRequest(BaseModel):
    title: str
    start_at: datetime
    end_at: datetime
    location: str | None = ""
    description: str | None = ""


class EventDescriptionResponse(BaseModel):
    description: str


class InviteMessageRequest(BaseModel):
    title: str
    start_at: datetime
    end_at: datetime
    location: str | None = ""
    description: str | None = ""


class InviteMessageResponse(BaseModel):
    message: str
