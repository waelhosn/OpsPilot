from apps.api.app.routers.inventory import _merge_into_existing_item
from apps.api.app.models import InventoryItem, InventoryStatus


def test_merge_into_existing_item_updates_quantity_and_status():
    item = InventoryItem(
        workspace_id=1,
        name="USB-C Cable",
        normalized_name="usb-c cable",
        category="electronics",
        quantity=2,
        unit="units",
        low_stock_threshold=5,
        status=InventoryStatus.low_stock,
        created_by=1,
    )

    _merge_into_existing_item(
        existing=item,
        quantity_delta=10,
        category="electronics",
        unit="units",
        low_stock_threshold=None,
        payload_status=None,
    )

    assert item.quantity == 12
    assert item.status == InventoryStatus.in_stock
