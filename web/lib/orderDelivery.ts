/**
 * Marks a whole order as delivered for the customer (migration 201: staff_set_order_status). The
 * database notifies the customer ("Tu pedido #N fue entregado"). Only venue staff are allowed.
 * Returns an error message or null.
 */

import { untypedDb } from "./untypedDb"; // staff_set_order_status is not in the generated types

export async function setOrderDelivered(orderId: string): Promise<string | null> {
  const { error } = await untypedDb.rpc("staff_set_order_status", { p_order_id: orderId, p_status: "delivered" });
  return error ? error.message : null;
}
