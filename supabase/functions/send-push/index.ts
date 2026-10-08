/**
 * JChat 3.0 — Send Push Edge Function (Lote 5)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Called only by the database through pg_net. JWT verification is disabled, so
 * every POST must provide x-push-secret matching PUSH_WEBHOOK_SECRET.
 *
 * Deploy:
 *   supabase functions deploy send-push --project-ref klfsgcfoahdtkojyqspd --no-verify-jwt
 *
 * Required secrets:
 *   PUSH_WEBHOOK_SECRET       — shared only with the database trigger
 *   SUPABASE_URL              — auto-injected by Supabase Edge Functions
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase Edge Functions
 *
 * Idempotency: this function intentionally has no deduplication store. Migration
 * 173b invokes it exactly once for each INSERT that needs a push notification.
 */

import { createAdminClient } from "../_shared/supabaseAdmin.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_TIMEOUT_MS = 8_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-push-secret",
};

const PUSH_TYPES = [
  "dm",
  "follower",
  "like",
  "comment",
  "work_alert",
  "match_like",
  "match_super",
  "match_match",
  "match_new_people",
  "order_status",
  "gift_offer",
  "gift_response",
] as const;
type PushType = typeof PUSH_TYPES[number];
type Language = "en" | "es";
/** Lock-screen preview level: full = name + text, name = name only, discreet = neutral text. */
type PreviewLevel = "full" | "name" | "discreet";

const MATCH_TYPES: readonly PushType[] = ["match_like", "match_super", "match_match", "match_new_people"];

function isMatchType(type: PushType): boolean {
  return MATCH_TYPES.includes(type);
}

function isGiftType(type: PushType): boolean {
  return type === "gift_offer" || type === "gift_response";
}

function previewLevel(value: unknown, fallback: PreviewLevel): PreviewLevel {
  return value === "full" || value === "name" || value === "discreet" ? value : fallback;
}

interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  payload?: Record<string, unknown> | null;
  created_at?: string;
}

interface DmRecord {
  id: string;
  conversation_id: string;
  sender_id: string;
  body?: string | null;
}

interface PushContent {
  title: string;
  body: string;
  data: {
    type: PushType;
    payload: Record<string, unknown>;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPushType(value: unknown): value is PushType {
  return typeof value === "string" && (PUSH_TYPES as readonly string[]).includes(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tokenSuffix(token: string): string {
  return token.slice(-6);
}

function getAdminClient() {
  return createAdminClient();
}

/** display_name or @username of a user — never the email. Throws on query errors. */
async function resolveDisplayName(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("users")
    .select("display_name, username")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const display = nonEmptyString(data?.display_name);
  if (display) return display;
  const username = nonEmptyString(data?.username);
  return username ? `@${username.replace(/^@/, "")}` : null;
}

function localizedContent(
  type: PushType,
  payload: Record<string, unknown>,
  language: Language,
  dmBody?: string | null,
  dmSenderName?: string | null,
): PushContent {
  const english = language === "en";
  const fallbackName = english ? "Someone" : "Alguien";
  const actorName = nonEmptyString(payload.actor_name) ?? dmSenderName ?? fallbackName;

  switch (type) {
    case "follower":
      return {
        title: "JChat",
        body: payload.request === true
          ? (english ? `${actorName} wants to follow you` : `${actorName} quiere seguirte`)
          : (english ? `${actorName} started following you` : `${actorName} empezó a seguirte`),
        data: { type, payload },
      };
    case "like":
      return {
        title: "JChat",
        body: english
          ? `${actorName} liked your post`
          : `A ${actorName} le gustó tu publicación`,
        data: { type, payload },
      };
    case "comment": {
      const preview = nonEmptyString(payload.preview) ?? "";
      return {
        title: "JChat",
        body: english
          ? `${actorName} commented: ${preview}`
          : `${actorName} comentó: ${preview}`,
        data: { type, payload },
      };
    }
    case "dm": {
      const senderName = dmSenderName ?? actorName;
      const messageBody = nonEmptyString(dmBody)?.slice(0, 120)
        ?? (english ? "Sent you a message" : "Te envió un mensaje");
      return {
        title: senderName,
        body: messageBody,
        data: { type, payload },
      };
    }
    case "work_alert": {
      const kind = payload.kind;
      let body = nonEmptyString(payload.message) ?? "";
      if (kind === "help") {
        const base = english ? "A customer is asking for help" : "Un cliente pide ayuda";
        const tableLabel = nonEmptyString(payload.table_label);
        body = tableLabel ? `${base} · ${tableLabel}` : base;
      } else if (kind === "match_report") {
        body = english ? "New report on Match" : "Nuevo reporte en Match";
      } else if (kind === "service_abuse") {
        // Golden rule (migration 198): many waiter calls refused from outside the venue.
        body = english
          ? "Several waiter calls were blocked from outside your venue"
          : "Se bloquearon varias llamadas al mesero hechas desde fuera de tu local";
      }
      return {
        title: english ? "Work alert" : "Alerta de trabajo",
        body,
        data: { type, payload },
      };
    }
    case "order_status": {
      // Transactional: always shown, never preview-gated. The payload keeps the ids a tap needs.
      const n = payload.order_number ?? "";
      const status = nonEmptyString(payload.status) ?? "";
      const toTable = payload.order_type === "table";
      let body: string;
      if (status === "preparing") {
        body = english ? `They're preparing your order #${n}` : `Están preparando tu pedido #${n}`;
      } else if (status === "ready") {
        body = toTable
          ? (english ? `Your order #${n} is on its way to your table` : `Tu pedido #${n} va en camino a tu mesa`)
          : (english ? `Your order #${n} is ready. Pick it up at the counter` : `Tu pedido #${n} está listo. Recógelo en el mostrador`);
      } else if (status === "delivered") {
        body = english ? `Your order #${n} was delivered` : `Tu pedido #${n} fue entregado`;
      } else if (status === "cancelled") {
        body = english ? `Your order #${n} was cancelled` : `Tu pedido #${n} fue cancelado`;
      } else {
        body = english ? `Update on your order #${n}` : `Novedad en tu pedido #${n}`;
      }
      return {
        title: nonEmptyString(payload.business_name) ?? "JChat",
        body,
        data: {
          type,
          payload: {
            order_id: payload.order_id,
            order_number: payload.order_number,
            business_id: payload.business_id,
            status: payload.status,
          },
        },
      };
    }
    default:
      // match_* and gift_* types are built by matchContent()/giftContent(); keeps the switch exhaustive.
      return discreetContent(type, payload, english);
  }
}

const DISCREET_BODY = { es: "Tienes una novedad en JChat", en: "You have something new on JChat" };

/** Neutral lock-screen content. data.payload carries no person ids or names. */
function discreetContent(
  type: PushType,
  payload: Record<string, unknown>,
  english: boolean,
  notificationId?: string | null,
): PushContent {
  const minimal: Record<string, unknown> = { type };
  if (notificationId) minimal.notification_id = notificationId;
  const businessId = nonEmptyString(payload.business_id);
  if (businessId) minimal.business_id = businessId;
  return {
    title: "JChat",
    body: english ? DISCREET_BODY.en : DISCREET_BODY.es,
    data: { type, payload: minimal },
  };
}

/**
 * Gift push content (migration 202). Same preview rules as Match: at level 'discreet' (or without a
 * resolvable name) the text is neutral. Either way data.payload keeps the ids a tap needs
 * (conversation_id → the 1:1 chat that holds the gift card). "Paid" names nobody, so it is the same
 * at every level.
 */
function giftContent(
  type: PushType,
  payload: Record<string, unknown>,
  language: Language,
  level: PreviewLevel,
  name: string | null,
  businessName: string | null,
  notificationId: string | null,
): PushContent {
  const english = language === "en";
  const data = {
    type,
    payload: {
      ...(notificationId ? { notification_id: notificationId } : {}),
      gift_offer_id: payload.gift_offer_id,
      conversation_id: payload.conversation_id,
      business_id: payload.business_id,
    },
  };
  const neutral: PushContent = {
    title: "JChat",
    body: english ? DISCREET_BODY.en : DISCREET_BODY.es,
    data,
  };

  if (type === "gift_response" && payload.result === "paid") {
    return {
      title: "JChat",
      body: english ? "Your gift is paid and on its way" : "Tu regalo ya está pagado y va en camino",
      data,
    };
  }
  if (level === "discreet" || !name) return neutral;

  let body: string;
  if (type === "gift_offer") {
    body = businessName
      ? (english ? `${name} sent you a gift at ${businessName}` : `${name} te envió un regalo en ${businessName}`)
      : (english ? `${name} sent you a gift` : `${name} te envió un regalo`);
  } else if (payload.result === "accepted") {
    body = english ? `${name} accepted your gift` : `${name} aceptó tu regalo`;
  } else if (payload.result === "declined") {
    body = english ? `${name} didn't accept your gift` : `${name} no aceptó tu regalo`;
  } else if (payload.result === "expired") {
    body = english ? `Your gift for ${name} expired` : `Tu regalo para ${name} venció`;
  } else {
    return neutral;
  }
  return { title: "JChat", body, data };
}

/**
 * Match push content. `name` is the other person's display_name / @username (never email) or null
 * when it could not be resolved — in that case, or at level 'discreet', the neutral text is used.
 */
function matchContent(
  type: PushType,
  payload: Record<string, unknown>,
  language: Language,
  level: PreviewLevel,
  name: string | null,
  notificationId: string | null,
): PushContent {
  const english = language === "en";

  if (type === "match_new_people") {
    // Generic by design: same text at every level, nothing about any person.
    const minimal = discreetContent(type, payload, english, notificationId);
    return {
      title: "JChat",
      body: english ? "New people joined Match" : "Llegó gente nueva a Match",
      data: minimal.data,
    };
  }

  if (level === "discreet" || !name) return discreetContent(type, payload, english, notificationId);

  let body: string;
  if (type === "match_like") {
    body = english ? `${name} liked you on Match` : `${name} te dio like en Match`;
  } else if (type === "match_super") {
    body = english ? `${name} sent you a Super Like` : `${name} te dio un Super Like`;
  } else {
    body = english ? `It's a match with ${name}!` : `¡Hiciste match con ${name}!`;
  }
  return { title: "JChat", body, data: { type, payload: { ...payload, type, notification_id: notificationId } } };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("[send-push] PUSH_WEBHOOK_SECRET is not configured");
    return jsonResponse({ error: "Internal server error" }, 500);
  }
  if (req.headers.get("x-push-secret") !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (!isObject(requestBody) || (requestBody.kind !== "notification" && requestBody.kind !== "dm")) {
    return jsonResponse({ error: "Invalid push request" }, 400);
  }
  if (!isObject(requestBody.record)) {
    return jsonResponse({ error: "Missing record" }, 400);
  }

  try {
    const admin = getAdminClient();
    let recipientId: string;
    let type: PushType;
    let payload: Record<string, unknown>;
    let dmBody: string | null | undefined;
    let dmSenderName: string | null | undefined;
    let notificationId: string | null = null;

    if (requestBody.kind === "notification") {
      const record = requestBody.record as unknown as NotificationRecord;
      if (!nonEmptyString(record.id) || !nonEmptyString(record.user_id) || !isPushType(record.type)) {
        if (typeof record.type === "string" && !isPushType(record.type)) return noContent();
        return jsonResponse({ error: "Invalid notification record" }, 400);
      }
      recipientId = record.user_id;
      notificationId = record.id;
      type = record.type;
      payload = isObject(record.payload) ? record.payload : {};
    } else {
      const record = requestBody.record as unknown as DmRecord;
      if (
        !nonEmptyString(record.id)
        || !nonEmptyString(record.conversation_id)
        || !nonEmptyString(record.sender_id)
      ) {
        return jsonResponse({ error: "Invalid DM record" }, 400);
      }

      const { data: conversation, error: conversationError } = await admin
        .from("dm_conversations")
        .select("user_a, user_b")
        .eq("id", record.conversation_id)
        .maybeSingle();
      if (conversationError) throw conversationError;
      if (!conversation) return noContent();

      const userA = nonEmptyString(conversation.user_a);
      const userB = nonEmptyString(conversation.user_b);
      if (record.sender_id === userA) recipientId = userB ?? "";
      else if (record.sender_id === userB) recipientId = userA ?? "";
      else return noContent();
      if (!recipientId) return noContent();

      const { data: sender, error: senderError } = await admin
        .from("users")
        .select("display_name, username")
        .eq("id", record.sender_id)
        .maybeSingle();
      if (senderError) throw senderError;

      dmSenderName = nonEmptyString(sender?.display_name) ?? nonEmptyString(sender?.username);
      dmBody = typeof record.body === "string" ? record.body : null;
      type = "dm";
      notificationId = record.id; // DMs have no notifications row: the message id identifies the push
      payload = { conversation_id: record.conversation_id };
    }

    const { data: recipient, error: recipientError } = await admin
      .from("users")
      .select("push_token, settings, language")
      .eq("id", recipientId)
      .maybeSingle();
    if (recipientError) throw recipientError;

    const token = nonEmptyString(recipient?.push_token);
    if (!token) return noContent();

    const settings = isObject(recipient?.settings) ? recipient.settings : {};
    const isSocial = type === "dm" || type === "follower" || type === "like" || type === "comment" ||
      isMatchType(type) || isGiftType(type);
    if (isSocial && settings.notifSocial === false) return noContent();
    if (type === "work_alert" && settings.notifWork === false) return noContent();

    const language: Language = recipient?.language === "en" ? "en" : "es";
    let content: PushContent;
    if (isMatchType(type)) {
      const level = previewLevel(settings.pushPreviewMatch, "discreet");
      // Name only when the level asks for it; any failure falls back to the neutral text.
      const otherUserId = nonEmptyString(type === "match_match" ? payload.other_user_id : payload.from_user_id);
      let name: string | null = null;
      if (level !== "discreet" && type !== "match_new_people" && otherUserId) {
        try {
          name = await resolveDisplayName(admin, otherUserId);
        } catch {
          name = null;
        }
      }
      content = matchContent(type, payload, language, level, name, notificationId);
    } else if (isGiftType(type)) {
      const level = previewLevel(settings.pushPreviewMatch, "discreet");
      // Offer: the sender's name; response: the person who answered (accepted/declined/expired).
      const otherUserId = nonEmptyString(type === "gift_offer" ? payload.from_user_id : payload.to_user_id);
      let name: string | null = null;
      let businessName: string | null = null;
      if (level !== "discreet" && otherUserId) {
        try {
          name = await resolveDisplayName(admin, otherUserId);
          const businessId = nonEmptyString(payload.business_id);
          if (type === "gift_offer" && businessId) {
            const { data: business } = await admin.from("businesses").select("name").eq("id", businessId).maybeSingle();
            businessName = nonEmptyString(business?.name);
          }
        } catch {
          name = null;
        }
      }
      content = giftContent(type, payload, language, level, name, businessName, notificationId);
    } else if (type === "dm") {
      const level = previewLevel(settings.pushPreviewDm, "full");
      // Neutral text, but the payload keeps conversation_id so tapping the push opens the chat.
      const dmDiscreet = (): PushContent => {
        const base = discreetContent(type, {}, language === "en", notificationId);
        return {
          ...base,
          data: { type, payload: { ...base.data.payload, conversation_id: payload.conversation_id } },
        };
      };
      if (level === "discreet") {
        content = dmDiscreet();
      } else if (level === "name") {
        const name = nonEmptyString(dmSenderName);
        content = name
          ? {
            title: "JChat",
            body: language === "en" ? `${name} sent you a message` : `${name} te escribió`,
            data: { type, payload },
          }
          : dmDiscreet();
      } else {
        content = localizedContent(type, payload, language, dmBody, dmSenderName);
      }
    } else {
      content = localizedContent(type, payload, language, dmBody, dmSenderName);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXPO_TIMEOUT_MS);

    let expoResponse: Response;
    try {
      expoResponse = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: token,
          title: content.title,
          body: content.body,
          sound: "default",
          data: content.data,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    let expoResult: unknown = null;
    try {
      expoResult = await expoResponse.json();
    } catch {
      // A non-JSON response is handled by the HTTP status branch below.
    }
    if (!expoResponse.ok) {
      console.error(
        `[send-push] Expo HTTP ${expoResponse.status}; token suffix ${tokenSuffix(token)}`,
      );
      return jsonResponse({ error: "Push provider error" }, 502);
    }

    const resultObject = isObject(expoResult) ? expoResult : {};
    const requestError = Array.isArray(resultObject.errors) && isObject(resultObject.errors[0])
      ? resultObject.errors[0]
      : null;
    if (requestError) {
      const requestDetails = isObject(requestError.details) ? requestError.details : null;
      const requestErrorCode = nonEmptyString(requestDetails?.error) ?? "request_error";
      console.error(
        `[send-push] Expo request error ${requestErrorCode}; token suffix ${tokenSuffix(token)}`,
      );
      return jsonResponse({ sent: false, reason: "provider_rejected" });
    }
    const rawTicket = Array.isArray(resultObject.data) ? resultObject.data[0] : resultObject.data;
    const ticket = isObject(rawTicket) ? rawTicket : null;
    const details = ticket && isObject(ticket.details) ? ticket.details : null;
    const ticketError = nonEmptyString(details?.error);

    if (ticketError === "DeviceNotRegistered") {
      const { error: clearError } = await admin
        .from("users")
        .update({ push_token: null })
        .eq("id", recipientId)
        .eq("push_token", token);
      if (clearError) {
        console.error(
          `[send-push] Failed to clear unregistered token suffix ${tokenSuffix(token)}`,
        );
      }
      return jsonResponse({ sent: false, reason: "device_not_registered" });
    }
    if (ticketError) {
      console.error(
        `[send-push] Expo ticket error ${ticketError}; token suffix ${tokenSuffix(token)}`,
      );
      return jsonResponse({ sent: false, reason: "provider_rejected" });
    }

    return jsonResponse({ sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[send-push] Request failed: ${message}`);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
