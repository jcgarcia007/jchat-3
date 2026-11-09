/**
 * JChat 3.0 — M2 (migration 273): the push texts for the staff notices (import-free, so a Deno test can drive it).
 *
 * staff_added   → "{venue} added you as {role}" / "{local} te agregó como {rol}" (without a role: "…added you to the staff" / "…te agregó al personal")
 * staff_removed → "You're no longer on the staff of {venue}" / "Ya no formas parte del personal de {local}"
 * Both are transactional: send-push only silences the social and work types, so these always go out. The payload that travels with the push is only
 * {business_id}: the app opens that venue's chat (if it has one) when the notice is tapped.
 */

export type StaffPushType = "staff_added" | "staff_removed";

export interface StaffPushContent {
  title: string;
  body: string;
  data: { type: StaffPushType; payload: { business_id: unknown } };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function staffPushContent(type: StaffPushType, payload: Record<string, unknown>, english: boolean): StaffPushContent {
  const venue = text(payload.business_name) ?? (english ? "A venue" : "Un local");
  const role = text(payload.role_label);
  const data = { type, payload: { business_id: payload.business_id } };
  if (type === "staff_added") {
    return {
      title: "JChat",
      body: role
        ? (english ? `${venue} added you as ${role}` : `${venue} te agregó como ${role}`)
        : (english ? `${venue} added you to the staff` : `${venue} te agregó al personal`),
      data,
    };
  }
  return {
    title: "JChat",
    body: english ? `You're no longer on the staff of ${venue}` : `Ya no formas parte del personal de ${venue}`,
    data,
  };
}
