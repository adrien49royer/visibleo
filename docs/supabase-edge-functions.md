# VISIBLEO — Supabase Edge Functions
## Deux fonctions serverless pour gérer les webhooks Stripe et les opt-outs

---

## Pourquoi des Edge Functions ?

Les Edge Functions Supabase sont des fonctions serverless (Deno) qui tournent en bord de réseau.
Elles permettent de :
- Recevoir les webhooks Stripe de façon sécurisée (vérification de signature)
- Exécuter des opérations avec la `service_role` key sans l'exposer au front
- Répondre aux demandes opt-out RGPD côté serveur

**Coût : gratuit jusqu'à 500k invocations/mois.**

---

## FONCTION 1 — Webhook Stripe (`stripe-webhook`)

### Déploiement

```bash
# Installer Supabase CLI
npm install -g supabase

# Se connecter
supabase login

# Créer la fonction
supabase functions new stripe-webhook

# Coller le code ci-dessous dans supabase/functions/stripe-webhook/index.ts
# Puis déployer
supabase functions deploy stripe-webhook --project-ref VOTRE_REF
```

### Code : `supabase/functions/stripe-webhook/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

serve(async (req) => {
  const signature = req.headers.get("stripe-signature")
  const body = await req.text()

  // ── Vérifier la signature Stripe ──────────────────────────
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? ""
    )
  } catch (err) {
    console.error("Signature invalide:", err.message)
    return new Response(JSON.stringify({ error: "Signature invalide" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  console.log(`Event reçu: ${event.type}`)

  // ── Traiter les events ─────────────────────────────────────
  switch (event.type) {

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      const siren = session.client_reference_id || session.metadata?.siren
      const boostNiveau = session.metadata?.boost || "aucun"
      const montant = session.amount_total || 0

      if (!siren) {
        console.error("SIREN manquant dans la session Stripe:", session.id)
        break
      }

      // 1. Récupérer l'entreprise par SIREN
      const { data: entreprise, error: errEnt } = await supabase
        .from("entreprises")
        .select("id")
        .eq("siren", siren)
        .single()

      if (errEnt || !entreprise) {
        console.error("Entreprise introuvable pour SIREN:", siren)
        break
      }

      // 2. Enregistrer le paiement
      await supabase.from("paiements").insert({
        entreprise_id: entreprise.id,
        stripe_session_id: session.id,
        stripe_customer_id: session.customer as string,
        montant,
        type_paiement: boostNiveau !== "aucun" ? `activation+${boostNiveau}` : "activation",
        statut: "paid",
        metadata: { boost: boostNiveau, siren, session_id: session.id },
      })

      // 3. Mettre à jour l'entreprise
      await supabase.from("entreprises").update({
        pipeline_statut: "paye",
        email_contact: session.customer_details?.email || undefined,
      }).eq("id", entreprise.id)

      // 4. Activer la fiche
      const { data: fiche } = await supabase
        .from("fiches")
        .select("id")
        .eq("entreprise_id", entreprise.id)
        .single()

      if (fiche) {
        await supabase.from("fiches").update({
          statut: "active",
          activated_at: new Date().toISOString(),
          boost_niveau: boostNiveau,
          boost_actif_at: boostNiveau !== "aucun" ? new Date().toISOString() : null,
        }).eq("id", fiche.id)
      }

      console.log(`✓ Fiche activée pour SIREN ${siren}, boost: ${boostNiveau}`)
      break
    }

    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription
      // Gérer les abonnements boost standalone (hors activation)
      console.log("Abonnement créé:", sub.id)
      break
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string

      // Retrouver l'entreprise via le customer Stripe
      const { data: paiement } = await supabase
        .from("paiements")
        .select("entreprise_id")
        .eq("stripe_customer_id", customerId)
        .single()

      if (paiement) {
        // Rétrograder le boost à "aucun"
        await supabase.from("fiches").update({
          boost_niveau: "aucun",
          boost_expire_at: new Date().toISOString(),
        }).eq("entreprise_id", paiement.entreprise_id)

        console.log(`Boost annulé pour entreprise ${paiement.entreprise_id}`)
      }
      break
    }

    case "invoice.payment_failed": {
      // Notifier l'admin par email (via Brevo) - TODO
      console.log("Paiement échoué:", event.data.object)
      break
    }

    default:
      console.log(`Event non géré: ${event.type}`)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  })
})
```

### Variables d'environnement à configurer

Dans **Supabase Dashboard** → **Edge Functions** → **Secrets** :

```
STRIPE_SECRET_KEY       = sk_live_... (ou sk_test_... pour les tests)
STRIPE_WEBHOOK_SECRET   = whsec_...  (depuis Stripe > Developers > Webhooks)
SUPABASE_SERVICE_ROLE_KEY = eyJ...   (depuis Supabase > Settings > API)
```

### URL du webhook à entrer dans Stripe

```
https://VOTRE_REF.supabase.co/functions/v1/stripe-webhook
```

---

## FONCTION 2 — Opt-out RGPD (`optout-handler`)

### Code : `supabase/functions/optout-handler/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://visibleo.fr",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), {
      status: 405, headers: CORS_HEADERS,
    })
  }

  let body: { siren: string; action: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Body JSON invalide" }), {
      status: 400, headers: CORS_HEADERS,
    })
  }

  const { siren, action } = body

  if (!siren || !["emails_only", "all", "fiche"].includes(action)) {
    return new Response(JSON.stringify({ error: "Paramètres invalides" }), {
      status: 400, headers: CORS_HEADERS,
    })
  }

  // Retrouver l'entreprise
  const { data: entreprise, error } = await supabase
    .from("entreprises")
    .select("id, nom")
    .eq("siren", siren.replace(/\s/g, ""))
    .single()

  if (error || !entreprise) {
    return new Response(JSON.stringify({ error: "Entreprise introuvable" }), {
      status: 404, headers: CORS_HEADERS,
    })
  }

  // Exécuter l'action
  switch (action) {
    case "emails_only":
      await supabase.from("entreprises").update({
        pipeline_statut: "inactif",
      }).eq("id", entreprise.id)
      break

    case "all":
      // Anonymiser les données personnelles (pas les données publiques BODACC)
      await supabase.from("entreprises").update({
        email_contact: null,
        telephone: null,
        nom_dirigeant: null,
        pipeline_statut: "inactif",
      }).eq("id", entreprise.id)
      break

    case "fiche":
      // Suspendre la fiche publique
      await supabase.from("fiches").update({
        statut: "suspendu",
      }).eq("entreprise_id", entreprise.id)
      await supabase.from("entreprises").update({
        pipeline_statut: "inactif",
      }).eq("id", entreprise.id)
      break
  }

  // Logger la demande
  await supabase.from("emails_log").insert({
    entreprise_id: entreprise.id,
    type_email: `optout_${action}`,
    statut: "traite",
  })

  console.log(`Opt-out traité: SIREN ${siren}, action: ${action}`)

  return new Response(JSON.stringify({ success: true, action }), {
    headers: CORS_HEADERS,
  })
})
```

### Déploiement

```bash
supabase functions new optout-handler
# Coller le code ci-dessus
supabase functions deploy optout-handler --project-ref VOTRE_REF
```

---

## TEST DES FONCTIONS

### Tester le webhook Stripe en local

```bash
# Installer Stripe CLI
brew install stripe/stripe-cli/stripe

# Forwarder les webhooks vers votre edge function locale
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook

# Simuler un paiement réussi
stripe trigger checkout.session.completed
```

### Vérifier les logs

```bash
supabase functions logs stripe-webhook --project-ref VOTRE_REF
supabase functions logs optout-handler --project-ref VOTRE_REF
```

---

## CHECKLIST MISE EN PRODUCTION

```
□ stripe-webhook déployée sur Supabase
□ URL webhook enregistrée dans Stripe Dashboard
□ Variables d'environnement STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET configurées
□ optout-handler déployée
□ Lien optout dans tous les templates email : https://visibleo.fr/pages/optout.html?siren={SIREN}
□ Test bout-en-bout : paiement test Stripe → fiche active dans Supabase
□ Test opt-out : clic lien email → données supprimées dans Supabase
```
