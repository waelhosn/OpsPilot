import pytest
from apps.api.app.routers.inventory import _normalize_category_label, _normalized_unit
from apps.api.app.schemas import (
    InventoryCopilotPlan,
    InventoryPlannerGroupBy,
    InventoryPlannerMetric,
)
from pydantic import ValidationError


def test_normalized_unit_singularization():
    assert _normalized_unit("Units") == "unit"
    assert _normalized_unit("boxes") == "boxes"


def test_normalize_category_label_lowercase():
    assert _normalize_category_label(" Electronics ") == "electronics"
    assert _normalize_category_label(" ") is None


def test_inventory_plan_rejects_rows_with_group_by():
    with pytest.raises(ValidationError):
        InventoryCopilotPlan(metric=InventoryPlannerMetric.rows, group_by=InventoryPlannerGroupBy.category)


def test_inventory_plan_rejects_invalid_sort_for_rows():
    with pytest.raises(ValidationError):
        InventoryCopilotPlan(metric=InventoryPlannerMetric.rows, group_by=InventoryPlannerGroupBy.none, sort_by="metric")
