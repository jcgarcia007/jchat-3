# Spike: Pagos en República Dominicana

**Estado:** INVESTIGACIÓN PENDIENTE. No es una decisión tomada ni trabajo iniciado.
**Fecha:** 2026-07-14
**Contexto:** RD es un mercado objetivo de JChat. La capa social ya funciona ahí; lo
único pendiente es el cobro. NO bloquea el lanzamiento en USA (que va con Stripe).
El negocio de prueba anterior (Bistró Flambeau, country='DO') queda DESCARTADO como
caso — la investigación es sobre RD como mercado, no sobre ese negocio.

## La pregunta que decide todo
¿Puede la plataforma de JChat (basada en USA), vía Stripe, cobrarle a un cliente
dominicano y pasar el dinero a un negocio dominicano RETENIENDO la comisión de JChat?
- Si SÍ → no se necesita Azul. Posible cambio menor de charge type.
- Si NO → Azul/CardNet, con rediseño del modelo de fondos.

## Lo que ya se sabe (investigado 2026-07-14)
- Stripe Connect LISTA a RD como país soportado para cuentas conectadas.
- PERO: plataforma USA → negocio RD probablemente cae bajo "recipient service agreement"
  con capacidades restringidas, que puede NO soportar destination charges con on_behalf_of
  (el flujo actual de JChat, D-48). Alternativa posible: separate charges and transfers
  (soporta cross-border), pero cambia la integración.
- Cross-border payouts: solo plataformas en US/UK/EEA/CA/CH → USA califica.
- Azul (Banco Popular) y CardNet existen, pero modelo INCOMPATIBLE: cada negocio es su
  propio comercio ante el banco, con su Merchant ID / Private Key / Auth1-Auth2 contra su
  cuenta local. NO hay capa de plataforma que reparta ni retenga comisión. Requiere
  entidad legal en RD + cuenta en banco local POR CADA negocio.
- Apple Pay: NO soportado en RD. Descartado.

## Preguntas concretas para Stripe (contactar sales)
1. ¿Puede una plataforma Connect basada en USA onboardear negocios en RD con
   destination charges + on_behalf_of? ¿O solo recipient agreement / separate charges?
2. Con ese flujo, ¿puede la plataforma retener application_fee?
3. ¿En qué moneda liquida el negocio dominicano? ¿DOP, USD?
4. ¿Qué capacidades pierde una cuenta conectada de RD vs una de USA?

## Preguntas concretas para Azul/CardNet (si la vía Stripe falla)
1. ¿Existe algún modelo de "facilitador de pagos" / agregador donde JChat sea el
   integrador y los negocios sean sub-comercios? ¿O cada negocio es comercio independiente
   obligatoriamente?
2. ¿Cómo retendría JChat su comisión de suscripción si el 100% va a la cuenta del negocio?
3. Requisitos legales para JChat (¿entidad en RD? ¿contrato con Banco Popular?).
4. Documentación de API y entorno de pruebas.

## Coste estimado si se va por Azul (preliminar, NO comprometido)
Rediseño del modelo de fondos + integración + onboarding manual de credenciales por
negocio: ~2-3 meses de desarrollo, más el trabajo legal/bancario. Es un modelo de
negocio distinto para RD, no "un procesador detrás de una interfaz".

## Decisión de timing (Juan, 2026-07-14)
Lanzar en USA con Stripe SIN esperar a resolver RD. RD-pagos se resuelve en paralelo
o después, con datos reales de la investigación de arriba. La capa social de RD no
depende de esto.
