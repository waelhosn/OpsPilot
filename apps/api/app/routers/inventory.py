from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import String, case, func, or_
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, get_workspace_id, require_membership
from ..models import InventoryItem, InventoryStatus, User
from ..schemas import (
    CopilotRequest,
    CopilotResponse,
    DuplicateSuggestionCandidate,
    DuplicateSuggestionForImportItem,
    ImportDuplicateAction,
    InventoryCopilotPlan,
    InventoryPlannerFilterField,
    InventoryPlannerFilterOperator,
    InventoryPlannerGroupBy,
    InventoryPlannerMetric,
    InventoryPlannerSortDirection,
    InventoryDuplicateSuggestionRequest,
    InventoryDuplicateSuggestionResponse,
    InventoryImportCommitRequest,
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
    ReceiptExtraction,
)
from ..services.ai_service import ai_service

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _resolved_status(payload_status: InventoryStatus | None, quantity: float, threshold: float) -> InventoryStatus:
    if payload_status in {InventoryStatus.ordered, InventoryStatus.discontinued}:
        return payload_status
    if quantity <= threshold:
        return InventoryStatus.low_stock
    return payload_status or InventoryStatus.in_stock


def _merge_into_existing_item(
    existing: InventoryItem,
    quantity_delta: float,
    category: str | None,
    unit: str | None,
    low_stock_threshold: float | None,
    payload_status: InventoryStatus | None,
    vendor: str | None = None,
) -> None:
    existing.quantity += quantity_delta
    if vendor:
        existing.vendor = vendor
    if category:
        existing.category = category
    if unit:
        existing.unit = unit
    if low_stock_threshold is not None:
        existing.low_stock_threshold = low_stock_threshold
    existing.status = _resolved_status(payload_status, existing.quantity, existing.low_stock_threshold)


def _normalized_unit(unit: str | None) -> str:
    if not unit:
        return "units"
    normalized = unit.strip().lower()
    aliases = {
        "units": "unit",
        "unit": "unit",
        "pieces": "piece",
        "piece": "piece",
        "packs": "pack",
        "pack": "pack",
    }
    normalized = aliases.get(normalized, normalized)
    return normalized


def _normalize_category_label(category: str | None) -> str | None:
    if category is None:
        return None
    cleaned = category.strip().lower()
    return cleaned or None


def _normalize_vendor_label(vendor: str | None) -> str | None:
    if vendor is None:
        return None
    cleaned = vendor.strip()
    return cleaned or None


def _find_duplicate_candidates(
    db: Session,
    workspace_id: int,
    item_name: str,
    unit: str | None,
    min_similarity: float = 0.82,
) -> list[DuplicateSuggestionCandidate]:
    normalized_name = ai_service.normalize_item_name(item_name)
    unit_norm = _normalized_unit(unit)

    existing_items = db.query(InventoryItem).filter(InventoryItem.workspace_id == workspace_id).all()
    candidates: list[DuplicateSuggestionCandidate] = []
    for existing in existing_items:
        similarity = SequenceMatcher(None, normalized_name, existing.normalized_name).ratio()
        is_exact = normalized_name == existing.normalized_name
        if not is_exact and similarity < min_similarity:
            continue

        existing_unit_norm = _normalized_unit(existing.unit)
        unit_matches = existing_unit_norm == unit_norm
        if is_exact:
            reason = "exact_name"
        else:
            reason = "similar_name" if unit_matches else "similar_name_unit_mismatch"

        candidates.append(
            DuplicateSuggestionCandidate(
                item_id=existing.id,
                name=existing.name,
                unit=existing.unit,
                category=existing.category,
                quantity=existing.quantity,
                similarity_score=round(similarity, 3),
                reason=reason,
            )
        )

    candidates.sort(key=lambda c: ((c.reason != "exact_name"), -c.similarity_score, c.name.lower()))
    return candidates[:3]


@router.get("/items", response_model=list[InventoryItemOut])
def list_items(
    query: str | None = Query(default=None),
    category: str | None = Query(default=None),
    status_filter: InventoryStatus | None = Query(default=None, alias="status"),
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InventoryItemOut]:
    require_membership(db, current_user.id, workspace_id)

    q = db.query(InventoryItem).filter(InventoryItem.workspace_id == workspace_id)
    if query:
        like = f"%{query.lower()}%"
        q = q.filter(
            or_(
                func.lower(InventoryItem.name).like(like),
                func.lower(func.coalesce(InventoryItem.vendor, "")).like(like),
                func.lower(func.coalesce(InventoryItem.category, "")).like(like),
                func.lower(func.coalesce(InventoryItem.unit, "")).like(like),
            )
        )
    if category:
        q = q.filter(InventoryItem.category == category)
    if status_filter:
        q = q.filter(InventoryItem.status == status_filter)
    return q.order_by(InventoryItem.name.asc()).all()


@router.post("/items", response_model=InventoryItemOut)
def create_item(
    payload: InventoryItemCreate,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InventoryItemOut:
    require_membership(db, current_user.id, workspace_id)

    normalized_name = ai_service.normalize_item_name(payload.name)
    vendor = _normalize_vendor_label(payload.vendor)
    category = _normalize_category_label(payload.category) or ai_service.suggest_category(payload.name)
    unit = payload.unit or "units"

    existing = (
        db.query(InventoryItem)
        .filter(InventoryItem.workspace_id == workspace_id, InventoryItem.normalized_name == normalized_name)
        .first()
    )
    if existing:
        _merge_into_existing_item(
            existing=existing,
            quantity_delta=payload.quantity,
            vendor=vendor,
            category=category,
            unit=unit,
            low_stock_threshold=payload.low_stock_threshold,
            payload_status=payload.status,
        )
        db.commit()
        db.refresh(existing)
        return existing

    status_value = _resolved_status(payload.status, payload.quantity, payload.low_stock_threshold)

    item = InventoryItem(
        workspace_id=workspace_id,
        name=payload.name,
        normalized_name=normalized_name,
        vendor=vendor,
        category=category,
        quantity=payload.quantity,
        unit=unit,
        low_stock_threshold=payload.low_stock_threshold,
        status=status_value,
        created_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=InventoryItemOut)
def update_item(
    item_id: int,
    payload: InventoryItemUpdate,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InventoryItemOut:
    require_membership(db, current_user.id, workspace_id)

    item = db.query(InventoryItem).filter(InventoryItem.id == item_id, InventoryItem.workspace_id == workspace_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(item, key, value)

    if payload.name is not None:
        item.normalized_name = ai_service.normalize_item_name(payload.name)
        if payload.category is None:
            item.category = ai_service.suggest_category(payload.name)
    if payload.category is not None:
        item.category = _normalize_category_label(payload.category) or item.category
    if payload.vendor is not None:
        item.vendor = _normalize_vendor_label(payload.vendor)

    if payload.quantity is not None or payload.low_stock_threshold is not None or payload.status is not None:
        item.status = _resolved_status(item.status, item.quantity, item.low_stock_threshold)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_membership(db, current_user.id, workspace_id)

    item = db.query(InventoryItem).filter(InventoryItem.id == item_id, InventoryItem.workspace_id == workspace_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    db.delete(item)
    db.commit()
    return {"message": "Item deleted", "id": item_id}


@router.post("/import/parse", response_model=ReceiptExtraction)
async def parse_import(
    text: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReceiptExtraction:
    require_membership(db, current_user.id, workspace_id)

    raw_text = text or ""
    if file:
        data = await file.read()
        decoded = data.decode("utf-8", errors="ignore")
        raw_text = f"{raw_text}\n{decoded}".strip()

    if not raw_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide text or file content")

    extraction = ai_service.parse_receipt(db, current_user.id, workspace_id, raw_text)
    return extraction


@router.post("/import/suggest-duplicates", response_model=InventoryDuplicateSuggestionResponse)
def suggest_duplicates(
    payload: InventoryDuplicateSuggestionRequest,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InventoryDuplicateSuggestionResponse:
    require_membership(db, current_user.id, workspace_id)

    suggestions: list[DuplicateSuggestionForImportItem] = []
    for idx, entry in enumerate(payload.items):
        candidates = _find_duplicate_candidates(db, workspace_id, entry.name, entry.unit)
        if candidates and candidates[0].reason == "exact_name":
            recommended_action = ImportDuplicateAction.merge
            recommended_merge_item_id = candidates[0].item_id
        elif candidates:
            recommended_action = ImportDuplicateAction.review
            recommended_merge_item_id = None
        else:
            recommended_action = ImportDuplicateAction.create_new
            recommended_merge_item_id = None

        suggestions.append(
            DuplicateSuggestionForImportItem(
                import_index=idx,
                import_name=entry.name,
                import_unit=entry.unit,
                candidates=candidates,
                recommended_action=recommended_action,
                recommended_merge_item_id=recommended_merge_item_id,
            )
        )

    return InventoryDuplicateSuggestionResponse(suggestions=suggestions)


@router.post("/import/upload")
async def upload_import(
    text: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_membership(db, current_user.id, workspace_id)
    raw_text = text or ""
    if file:
        data = await file.read()
        raw_text = f"{raw_text}\n{data.decode('utf-8', errors='ignore')}".strip()
    if not raw_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide text or file content")
    return {"raw_text": raw_text}


@router.post("/import/commit", response_model=list[InventoryItemOut])
def commit_import(
    payload: InventoryImportCommitRequest,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[InventoryItemOut]:
    require_membership(db, current_user.id, workspace_id)

    upserted_items: dict[int, InventoryItem] = {}
    for entry in payload.items:
        action = entry.duplicate_action
        if action == ImportDuplicateAction.review:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate review not resolved for item '{entry.name}'. Choose merge or create_new.",
            )

        normalized_name = ai_service.normalize_item_name(entry.name)
        vendor = _normalize_vendor_label(entry.vendor)
        category = _normalize_category_label(entry.category) or ai_service.suggest_category(entry.name)
        unit = entry.unit or "units"

        exact_existing = (
            db.query(InventoryItem)
            .filter(InventoryItem.workspace_id == workspace_id, InventoryItem.normalized_name == normalized_name)
            .first()
        )

        if action == ImportDuplicateAction.merge:
            merge_target: InventoryItem | None = None
            if entry.merge_item_id:
                merge_target = (
                    db.query(InventoryItem)
                    .filter(InventoryItem.workspace_id == workspace_id, InventoryItem.id == entry.merge_item_id)
                    .first()
                )
            if not merge_target:
                merge_target = exact_existing
            if not merge_target:
                candidates = _find_duplicate_candidates(db, workspace_id, entry.name, entry.unit)
                if candidates:
                    merge_target = (
                        db.query(InventoryItem)
                        .filter(InventoryItem.workspace_id == workspace_id, InventoryItem.id == candidates[0].item_id)
                        .first()
                    )

            if not merge_target:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"No merge target found for item '{entry.name}'.",
                )

            _merge_into_existing_item(
                existing=merge_target,
                quantity_delta=entry.quantity,
                vendor=vendor,
                category=category,
                unit=unit,
                low_stock_threshold=None,
                payload_status=None,
            )
            upserted_items[merge_target.id] = merge_target
            continue

        if action in {ImportDuplicateAction.auto, ImportDuplicateAction.create_new}:
            if action == ImportDuplicateAction.auto and exact_existing:
                _merge_into_existing_item(
                    existing=exact_existing,
                    quantity_delta=entry.quantity,
                    vendor=vendor,
                    category=category,
                    unit=unit,
                    low_stock_threshold=None,
                    payload_status=None,
                )
                upserted_items[exact_existing.id] = exact_existing
                continue

        threshold = 1
        status_value = _resolved_status(None, entry.quantity, threshold)
        item = InventoryItem(
            workspace_id=workspace_id,
            name=entry.name,
            normalized_name=normalized_name,
            vendor=vendor,
            category=category,
            quantity=entry.quantity,
            unit=unit,
            low_stock_threshold=threshold,
            status=status_value,
            created_by=current_user.id,
        )
        db.add(item)
        db.flush()
        upserted_items[item.id] = item

    db.commit()
    for item in upserted_items.values():
        db.refresh(item)
    return list(upserted_items.values())


@router.post("/copilot", response_model=CopilotResponse)
def copilot(
    payload: CopilotRequest,
    workspace_id: int = Depends(get_workspace_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CopilotResponse:
    require_membership(db, current_user.id, workspace_id)

    def execute_query_plan_tool(plan_dict: dict) -> dict:
        try:
            plan = InventoryCopilotPlan.model_validate(plan_dict)
        except ValidationError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid copilot plan: {exc}") from exc

        limit = max(1, min(plan.limit, 100))
        low_stock_condition = (InventoryItem.quantity <= InventoryItem.low_stock_threshold) | (
            InventoryItem.status == InventoryStatus.low_stock
        )
        query_builder = db.query(InventoryItem).filter(InventoryItem.workspace_id == workspace_id)

        for plan_filter in plan.filters:
            op = plan_filter.op
            value = plan_filter.value
            field = plan_filter.field

            if field in {
                InventoryPlannerFilterField.name,
                InventoryPlannerFilterField.vendor,
                InventoryPlannerFilterField.category,
                InventoryPlannerFilterField.unit,
            }:
                column = {
                    InventoryPlannerFilterField.name: InventoryItem.name,
                    InventoryPlannerFilterField.vendor: InventoryItem.vendor,
                    InventoryPlannerFilterField.category: InventoryItem.category,
                    InventoryPlannerFilterField.unit: InventoryItem.unit,
                }[field]
                value_str = str(value).strip().lower()
                if op == InventoryPlannerFilterOperator.eq:
                    query_builder = query_builder.filter(func.lower(func.coalesce(column, "")) == value_str)
                elif op == InventoryPlannerFilterOperator.contains:
                    query_builder = query_builder.filter(func.lower(func.coalesce(column, "")).like(f"%{value_str}%"))
                else:
                    raise HTTPException(status_code=400, detail=f"Unsupported operator '{op}' for field '{field}'")
                continue

            if field == InventoryPlannerFilterField.status:
                if op != InventoryPlannerFilterOperator.eq:
                    raise HTTPException(status_code=400, detail="Status filter only supports eq operator")
                status_value = str(value).strip().lower()
                try:
                    enum_status = InventoryStatus(status_value)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=f"Invalid status value '{status_value}'") from exc
                query_builder = query_builder.filter(InventoryItem.status == enum_status)
                continue

            if field == InventoryPlannerFilterField.quantity:
                try:
                    quantity_value = float(value)
                except (TypeError, ValueError) as exc:
                    raise HTTPException(status_code=400, detail=f"Invalid quantity value '{value}'") from exc
                if op == InventoryPlannerFilterOperator.eq:
                    query_builder = query_builder.filter(InventoryItem.quantity == quantity_value)
                elif op == InventoryPlannerFilterOperator.lt:
                    query_builder = query_builder.filter(InventoryItem.quantity < quantity_value)
                elif op == InventoryPlannerFilterOperator.lte:
                    query_builder = query_builder.filter(InventoryItem.quantity <= quantity_value)
                elif op == InventoryPlannerFilterOperator.gt:
                    query_builder = query_builder.filter(InventoryItem.quantity > quantity_value)
                elif op == InventoryPlannerFilterOperator.gte:
                    query_builder = query_builder.filter(InventoryItem.quantity >= quantity_value)
                else:
                    raise HTTPException(status_code=400, detail=f"Unsupported operator '{op}' for quantity")
                continue

            if field == InventoryPlannerFilterField.low_stock:
                if op != InventoryPlannerFilterOperator.eq:
                    raise HTTPException(status_code=400, detail="low_stock filter only supports eq operator")
                low_stock_value = value
                if isinstance(low_stock_value, str):
                    low_stock_value = low_stock_value.strip().lower() in {"true", "1", "yes"}
                if bool(low_stock_value):
                    query_builder = query_builder.filter(low_stock_condition)
                else:
                    query_builder = query_builder.filter(~low_stock_condition)
                continue

        if plan.group_by == InventoryPlannerGroupBy.none:
            if plan.metric == InventoryPlannerMetric.rows:
                sort_columns = {
                    "name": InventoryItem.name,
                    "quantity": InventoryItem.quantity,
                    "vendor": InventoryItem.vendor,
                    "category": InventoryItem.category,
                    "status": InventoryItem.status,
                    "unit": InventoryItem.unit,
                }
                sort_column = sort_columns.get(plan.sort_by, InventoryItem.name)
                order_by_clause = (
                    sort_column.desc()
                    if plan.sort_direction == InventoryPlannerSortDirection.desc
                    else sort_column.asc()
                )
                rows = query_builder.order_by(order_by_clause).limit(limit).all()
                return {
                    "kind": "rows",
                    "metric": plan.metric.value,
                    "group_by": plan.group_by.value,
                    "rows": [
                        {
                            "id": row.id,
                            "name": row.name,
                            "vendor": row.vendor,
                            "category": row.category,
                            "quantity": row.quantity,
                            "unit": row.unit,
                            "status": row.status.value if isinstance(row.status, InventoryStatus) else str(row.status),
                        }
                        for row in rows
                    ],
                }

            if plan.metric == InventoryPlannerMetric.count_items:
                metric_value = query_builder.count()
            elif plan.metric == InventoryPlannerMetric.sum_quantity:
                metric_value = query_builder.with_entities(func.coalesce(func.sum(InventoryItem.quantity), 0)).scalar() or 0
            elif plan.metric == InventoryPlannerMetric.count_low_stock:
                metric_value = query_builder.filter(low_stock_condition).count()
            elif plan.metric == InventoryPlannerMetric.low_stock_ratio:
                total_count = query_builder.count()
                low_count = query_builder.filter(low_stock_condition).count()
                metric_value = 0 if total_count == 0 else round(low_count / total_count, 4)
            else:
                metric_value = query_builder.count()

            return {
                "kind": "scalar",
                "metric": plan.metric.value,
                "group_by": plan.group_by.value,
                "metric_value": metric_value,
            }

        group_column = {
            InventoryPlannerGroupBy.category: func.lower(func.trim(InventoryItem.category)),
            InventoryPlannerGroupBy.vendor: func.lower(func.trim(func.coalesce(InventoryItem.vendor, ""))),
            InventoryPlannerGroupBy.status: func.lower(func.trim(func.cast(InventoryItem.status, String))),
            InventoryPlannerGroupBy.unit: func.lower(func.trim(InventoryItem.unit)),
            InventoryPlannerGroupBy.item: func.lower(func.trim(InventoryItem.name)),
        }[plan.group_by]

        grouped_rows = (
            query_builder.with_entities(
                group_column.label("group"),
                func.count(InventoryItem.id).label("item_count"),
                func.coalesce(func.sum(InventoryItem.quantity), 0.0).label("quantity_sum"),
                func.sum(case((low_stock_condition, 1), else_=0)).label("low_stock_count"),
            )
            .group_by(group_column)
            .all()
        )

        computed_rows: list[dict] = []
        for row in grouped_rows:
            item_count = int(row.item_count or 0)
            quantity_sum = float(row.quantity_sum or 0)
            low_stock_count = int(row.low_stock_count or 0)

            if plan.metric == InventoryPlannerMetric.count_items:
                metric_value = item_count
            elif plan.metric == InventoryPlannerMetric.sum_quantity:
                metric_value = quantity_sum
            elif plan.metric == InventoryPlannerMetric.count_low_stock:
                metric_value = low_stock_count
            elif plan.metric == InventoryPlannerMetric.low_stock_ratio:
                metric_value = 0 if item_count == 0 else round(low_stock_count / item_count, 4)
            else:
                metric_value = item_count

            computed_rows.append(
                {
                    plan.group_by.value: row.group or "unknown",
                    "metric": metric_value,
                    "item_count": item_count,
                    "quantity_sum": quantity_sum,
                    "low_stock_count": low_stock_count,
                }
            )

        reverse = plan.sort_direction == InventoryPlannerSortDirection.desc
        if plan.sort_by == "group":
            computed_rows.sort(key=lambda r: str(r.get(plan.group_by.value, "")), reverse=reverse)
        else:
            computed_rows.sort(key=lambda r: float(r.get("metric", 0)), reverse=reverse)

        return {
            "kind": "grouped",
            "metric": plan.metric.value,
            "group_by": plan.group_by.value,
            "rows": computed_rows[:limit],
        }

    return ai_service.inventory_copilot(
        db=db,
        user_id=current_user.id,
        workspace_id=workspace_id,
        query=payload.query,
        execute_query_plan_tool=execute_query_plan_tool,
    )
