import type { ApprovalStatus, OrderStatus } from '../../services/orders';

/** i18n keys (namespace `pos`) for every status an order can show, including approval states. */
export type OrderStatusLabelKey =
  | 'tracking.status.pending'
  | 'tracking.status.confirmed'
  | 'tracking.status.preparing'
  | 'tracking.status.ready'
  | 'tracking.status.delivered'
  | 'tracking.status.cancelled'
  | 'tracking.status.disputed'
  | 'tracking.status.awaitingApproval'
  | 'tracking.status.rejected';

/**
 * The label to show for an order. An order that still needs (or was denied) the business's
 * approval says so, whatever its `status` column holds; unknown values fall back to "pending"
 * instead of an empty tracker.
 */
export function orderStatusLabelKey(
  status: OrderStatus | string,
  approval?: ApprovalStatus | null,
): OrderStatusLabelKey {
  if (approval === 'awaiting') return 'tracking.status.awaitingApproval';
  if (approval === 'rejected') return 'tracking.status.rejected';
  switch (status) {
    case 'confirmed': return 'tracking.status.confirmed';
    case 'preparing': return 'tracking.status.preparing';
    case 'ready': return 'tracking.status.ready';
    case 'delivered': return 'tracking.status.delivered';
    case 'cancelled': return 'tracking.status.cancelled';
    case 'disputed': return 'tracking.status.disputed';
    default: return 'tracking.status.pending';
  }
}
