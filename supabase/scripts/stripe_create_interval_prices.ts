/**
 * JChat 3.0 — crea en Stripe los 4 precios de 6 meses y 1 año de Business y Pro.
 *
 * Uso (modo prueba; por defecto NO escribe nada, solo muestra qué haría):
 *   STRIPE_SECRET_KEY=sk_test_… STRIPE_PRICE_BUSINESS=price_… STRIPE_PRICE_PRO=price_… \
 *     deno run --allow-env --allow-net supabase/scripts/stripe_create_interval_prices.ts            # simulacro
 *   … mismo comando con --apply                                                                       # crea
 * Modo live (misma clave sk_live_ y los price ids live de STRIPE_PRICE_BUSINESS/PRO):
 *   … --apply --live  y  CONFIRM_LIVE=yes   (sin los dos, una clave sk_live_ se rechaza).
 *
 * Idempotente: cada precio lleva un lookup_key; si ya existe uno activo con ese lookup_key y el mismo importe/intervalo se reutiliza,
 * y si existe pero NO coincide se aborta (nunca se duplica ni se pisa). Además usa idempotencyKey por si se corta a medias.
 * No archiva ni modifica los precios mensuales actuales. Imprime los 4 `supabase secrets set STRIPE_PRICE_*` listos para pegar.
 * Misma versión de librería y de API que la Edge Function subscriptions (stripe@16.2.0, 2024-06-20).
 * Solo la Edge Function lee estas variables (supabase secrets); la web NO usa ninguna STRIPE_PRICE_*, por eso no se imprimen líneas para .env.local.
 * La clave y los price ids se leen del entorno; no se guardan en ningún archivo del repo.
 */
import Stripe from "npm:stripe@16.2.0";

const apply = Deno.args.includes("--apply");
const live = Deno.args.includes("--live");

function need(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    console.error(`Falta la variable ${name}`);
    Deno.exit(1);
  }
  return v;
}

const key = need("STRIPE_SECRET_KEY");
const isLiveKey = key.startsWith("sk_live_");
if (!isLiveKey && !key.startsWith("sk_test_")) {
  console.error("STRIPE_SECRET_KEY debe empezar por sk_test_ o sk_live_");
  Deno.exit(1);
}
if (isLiveKey && !(live && Deno.env.get("CONFIRM_LIVE") === "yes")) {
  console.error("Clave LIVE detectada: exige --live y CONFIRM_LIVE=yes");
  Deno.exit(1);
}
if (!isLiveKey && live) {
  console.error("--live con una clave de prueba: revisa la clave");
  Deno.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

interface Variant {
  plan: "business" | "pro";
  interval: "6m" | "1y";
  envVar: string;
  lookupKey: string;
  cents: number;
  recurring: { interval: "month" | "year"; interval_count: number };
}

// Mensual × meses × (1 − descuento): Business 49 → 264 (6m, −10%) / 468 (1a, −20%); Pro 99 → 534 / 948. En centavos.
const VARIANTS: Variant[] = [
  { plan: "business", interval: "6m", envVar: "STRIPE_PRICE_BUSINESS_6M", lookupKey: "business_6m", cents: 26400, recurring: { interval: "month", interval_count: 6 } },
  { plan: "business", interval: "1y", envVar: "STRIPE_PRICE_BUSINESS_1Y", lookupKey: "business_1y", cents: 46800, recurring: { interval: "year", interval_count: 1 } },
  { plan: "pro", interval: "6m", envVar: "STRIPE_PRICE_PRO_6M", lookupKey: "pro_6m", cents: 53400, recurring: { interval: "month", interval_count: 6 } },
  { plan: "pro", interval: "1y", envVar: "STRIPE_PRICE_PRO_1Y", lookupKey: "pro_1y", cents: 94800, recurring: { interval: "year", interval_count: 1 } },
];
const BASE_CENTS = { business: 4900, pro: 9900 } as const;

// 1) Productos actuales, a partir de los price ids mensuales vigentes.
const productOf: Record<string, string> = {};
for (const [plan, envName] of [["business", "STRIPE_PRICE_BUSINESS"], ["pro", "STRIPE_PRICE_PRO"]] as const) {
  const base = await stripe.prices.retrieve(need(envName));
  const product = typeof base.product === "string" ? base.product : base.product.id;
  if (base.currency !== "usd" || base.unit_amount !== BASE_CENTS[plan] || base.recurring?.interval !== "month" || base.recurring.interval_count !== 1) {
    console.error(`${envName} (${base.id}) no es el mensual esperado de ${plan} (USD ${BASE_CENTS[plan] / 100}/mes). Abortando.`);
    Deno.exit(1);
  }
  productOf[plan] = product;
  console.log(`${plan}: producto ${product} (precio mensual ${base.id})`);
}

// 2) Crear o reutilizar cada precio.
const out: string[] = [];
for (const v of VARIANTS) {
  const found = await stripe.prices.list({ lookup_keys: [v.lookupKey], active: true, limit: 1 });
  const hit = found.data[0];
  if (hit) {
    const same = hit.unit_amount === v.cents && hit.currency === "usd" && hit.recurring?.interval === v.recurring.interval &&
      hit.recurring.interval_count === v.recurring.interval_count &&
      (typeof hit.product === "string" ? hit.product : hit.product.id) === productOf[v.plan];
    if (!same) {
      console.error(`Ya existe un precio activo con lookup_key ${v.lookupKey} (${hit.id}) pero NO coincide con lo esperado. Revísalo a mano; no se toca.`);
      Deno.exit(1);
    }
    console.log(`= ${v.lookupKey}: ya existe ${hit.id}`);
    out.push(`supabase secrets set ${v.envVar}=${hit.id}`);
    continue;
  }
  if (!apply) {
    console.log(`+ (simulacro) crearía ${v.lookupKey}: USD ${v.cents / 100} cada ${v.recurring.interval_count} ${v.recurring.interval}`);
    out.push(`supabase secrets set ${v.envVar}=<se creará con --apply>`);
    continue;
  }
  const created = await stripe.prices.create(
    {
      product: productOf[v.plan],
      currency: "usd",
      unit_amount: v.cents,
      recurring: v.recurring,
      lookup_key: v.lookupKey,
      nickname: `${v.plan} ${v.interval}`,
      metadata: { plan: v.plan, interval: v.interval },
    },
    { idempotencyKey: `jchat-interval-price-${v.lookupKey}-v1` },
  );
  console.log(`+ ${v.lookupKey}: creado ${created.id}`);
  out.push(`supabase secrets set ${v.envVar}=${created.id}`);
}

console.log(`\n── Pega esto (proyecto de JChat; añade --project-ref si hace falta) ──`);
for (const line of out) console.log(line);
