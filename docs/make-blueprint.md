# VISIBLEO — Blueprint Make.com
## Documentation complète des scénarios d'automatisation

---

## SCÉNARIO 1 — BODACC → Supabase (quotidien, 8h00)
> Récupère les nouvelles immatriculations du jour, les insère en base

```
[Schedule: Tous les jours à 8h00]
    ↓
[HTTP: GET BODACC API]
  URL: https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records
  Params:
    where: "dateparution >= '{{yesterday}}' AND familleavis_lib = 'Création'"
    limit: 100
    offset: 0
    select: "nompatronyme,siren,activiteformatee,adresseetablissement,numerodepartement,datecreationetablissement"
    ↓
[Iterator: sur results.records]
    ↓
[Supabase: INSERT INTO entreprises]
  siren: {{record.siren}}
  nom: {{record.nompatronyme}}
  naf_libelle: {{record.activiteformatee}}
  adresse: {{record.adresseetablissement}}
  departement: {{record.numerodepartement}}
  date_immat: {{record.datecreationetablissement}}
  pipeline_statut: "nouveau"
  ON CONFLICT (siren) DO NOTHING
    ↓
[Supabase: SELECT FROM naf_reference WHERE code = {{naf_code}}]
    ↓
[Supabase: UPDATE entreprises SET type_entreprise = {{naf.type_activite}} WHERE siren = {{siren}}]
    ↓
[Claude API: Générer description SEO]
  Prompt: voir SCÉNARIO 3
    ↓
[Supabase: INSERT INTO fiches] (statut: 'draft')
```

### Variables Make.com à créer :
- `yesterday` = `{{formatDate(addDays(now, -1), "YYYY-MM-DD")}}`
- `supabase_url` = votre URL Supabase
- `supabase_service_key` = votre service_role key (JAMAIS l'anon key)

---

## SCÉNARIO 2 — Supabase → Brevo (email d'activation, 30 min après import)

```
[Schedule: Toutes les 30 minutes]
    ↓
[Supabase: SELECT FROM entreprises]
  WHERE pipeline_statut = 'nouveau'
  AND created_at > NOW() - INTERVAL '1 hour'
  AND email_contact IS NOT NULL
  LIMIT 20
    ↓
[Iterator]
    ↓
[Router: selon naf_code → template_id]
  4322A, 4321A → Template 1 (artisan_local)
  4399C, 4120A → Template 2 (artisan_btp)
  5610A, 5610C → Template 3 (commerce_restauration)
  9602A, 9602B → Template 4 (beaute_local)
  4941A, 4942Z → Template 5 (transport_regional)
  6831Z, 6810Z → Template 6 (immo_agence)
  7022Z, 6920Z, 6910Z → Template 7 (conseil_national)
  6201Z, 7311Z → Template 8 (digital_tech)
  Défaut → Template 1
    ↓
[Brevo: Send Transactional Email]
  templateId: {{template_id}}
  to: [{ email: {{email_contact}}, name: {{nom_dirigeant}} }]
  params:
    NOM_ENTREPRISE: {{nom}}
    PRENOM_DIRIGEANT: {{nom_dirigeant}}
    VILLE: {{ville}}
    NAF_LIBELLE: {{naf_libelle}}
    SIREN: {{siren}}
    LIEN_ACTIVATION: https://visibleo.fr/pages/activer.html?siren={{siren}}
    LIEN_OPTOUT: https://visibleo.fr/optout?siren={{siren}}
    ↓
[Supabase: UPDATE entreprises]
  SET pipeline_statut = 'email_envoye',
      email_envoye_at = NOW()
  WHERE siren = {{siren}}
    ↓
[Supabase: INSERT INTO emails_log]
  entreprise_id: {{id}}
  type_email: 'activation'
  destinataire: {{email_contact}}
  statut: 'envoye'
```

---

## SCÉNARIO 3 — Claude API → Génération fiche SEO

```
[Déclenché par Scénario 1 après INSERT entreprise]
    ↓
[Claude API: POST /v1/messages]
  model: "claude-sonnet-4-20250514"
  max_tokens: 500
  system: "Tu es un rédacteur SEO expert en annuaires professionnels français.
           Génère une description courte (150 chars) et une description longue (300 mots)
           pour une fiche d'entreprise. Réponds UNIQUEMENT en JSON :
           { 'description_courte': '...', 'description_seo': '...', 'services': ['...'], 'mots_cles': ['...'] }"
  user: "Entreprise : {{nom}}
         Secteur : {{naf_libelle}} ({{naf_code}})
         Ville : {{ville}}, {{departement}} ({{region}})
         Forme juridique : {{forme_juridique}}
         Dirigeant : {{nom_dirigeant}}
         Date de création : {{date_immat}}"
    ↓
[JSON Parse: response.content[0].text]
    ↓
[Supabase: UPDATE fiches]
  SET description_courte = {{json.description_courte}},
      description_seo = {{json.description_seo}},
      services = {{json.services}},
      mots_cles = {{json.mots_cles}},
      slug = {{toSlug(nom + '-' + ville + '-' + departement)}}
  WHERE entreprise_id = {{id}}
```

---

## SCÉNARIO 4 — Relance J+7

```
[Schedule: Tous les jours à 9h00]
    ↓
[Supabase: SELECT FROM entreprises]
  WHERE pipeline_statut = 'email_envoye'
  AND email_envoye_at < NOW() - INTERVAL '7 days'
  AND email_contact IS NOT NULL
  LIMIT 30
    ↓
[Iterator]
    ↓
[Brevo: Send Transactional Email]
  Même template que scénario 2
  Ajout paramètre: IS_RELANCE = true (pour afficher "Dernière chance")
    ↓
[Supabase: UPDATE entreprises]
  SET pipeline_statut = 'relance',
      relance_at = NOW()
```

---

## SCÉNARIO 5 — Stripe Webhook → Activation fiche

```
[Webhook: POST /stripe-webhook]
  Écoute les events: checkout.session.completed
    ↓
[Stripe: Valider la signature webhook]
  Clé secrète: whsec_VOTRE_CLE
    ↓
[Router: selon event.type]
  checkout.session.completed:
    client_reference_id → siren
    metadata.boost → boost_niveau
    amount_total → montant
    ↓
    [Supabase: UPDATE entreprises]
      SET pipeline_statut = 'paye'
      WHERE siren = {{siren}}
        ↓
    [Supabase: INSERT INTO paiements]
      entreprise_id: {{entreprise.id}}
      stripe_session_id: {{session.id}}
      montant: {{amount_total}}
      type_paiement: 'activation'
      statut: 'paid'
        ↓
    [Supabase: UPDATE fiches]
      SET statut = 'active',
          activated_at = NOW(),
          boost_niveau = {{metadata.boost || 'aucun'}}
      WHERE entreprise_id = {{entreprise.id}}
        ↓
    [Brevo: Send Email de bienvenue]
      Template: 'welcome' (à créer)
      Params: NOM_ENTREPRISE, LIEN_ESPACE
        ↓
    [Si boost != 'aucun']
      [Brevo: Send Email upsell boost]
        Paramètre BOOST_RECOMMANDE selon type_entreprise
```

---

## SCÉNARIO 6 — Suivi des avis (quotidien 7h)

```
[Schedule: Tous les jours à 7h00]
    ↓
[Supabase: SELECT FROM avis WHERE statut = 'en_attente']
    ↓
[Si count > 0]
    ↓
[Brevo: Notification admin]
  Sujet: "{{count}} avis en attente de modération — Visibleo"
  Destinataire: admin@visibleo.fr
```

---

## VARIABLES GLOBALES Make.com

```javascript
// À définir dans Data Stores ou Variables Make
SUPABASE_URL = "https://VOTRE_REF.supabase.co"
SUPABASE_SERVICE_KEY = "eyJ..." // service_role key (jamais l'anon)
BREVO_API_KEY = "xkeysib-..."
STRIPE_WEBHOOK_SECRET = "whsec_..."
ANTHROPIC_API_KEY = "sk-ant-..."
VISIBLEO_DOMAIN = "https://visibleo.fr"
ADMIN_EMAIL = "adrien@avanti.fr"
```

---

## QUOTA & COÛTS ESTIMÉS (Free tiers)

| Service | Opérations/mois | Limite free |
|---|---|---|
| Make.com | ~3000 ops | 1000 ops/mois (⚠️ à surveiller) |
| Supabase | ~500 requêtes/j | 500MB DB, illimité API |
| Brevo | 300 emails/j | 9000/mois |
| Claude API | ~200 fiches/j | Payant à l'usage (~0.003$/fiche) |

> ⚠️ Make.com free: 1000 ops/mois. Pour 50 nouvelles entreprises/jour = ~3000 ops/mois.
> Recommandation : passer à Make.com Core (9$/mois) dès le lancement.

---

## FONCTION SLUG (à ajouter dans Make.com Custom Function)

```javascript
function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
// Usage: toSlug("Martin Plomberie" + " " + "Saumur" + " " + "49")
// → "martin-plomberie-saumur-49"
```
