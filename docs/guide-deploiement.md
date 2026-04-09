# VISIBLEO — Guide de déploiement complet
## De zéro à en ligne en moins d'une heure

---

## VUE D'ENSEMBLE

```
Étape 1 : Supabase     (15 min) — base de données
Étape 2 : Stripe       (10 min) — paiements
Étape 3 : GitHub Pages (10 min) — hébergement
Étape 4 : Configuration(5 min)  — injecter les clés
Étape 5 : Brevo        (10 min) — emails
Étape 6 : Make.com     (15 min) — automatisation
Étape 7 : Tests        (5 min)  — validation
```

---

## ÉTAPE 1 — SUPABASE (base de données)

### 1.1 Créer le compte et le projet

1. Aller sur [supabase.com](https://supabase.com)
2. **New Project** → nommer `visibleo`
3. Choisir la région **West EU (Paris)** → important pour la latence
4. Mot de passe DB → noter quelque part en sécurité
5. Attendre 1-2 minutes que le projet démarre

### 1.2 Exécuter le schéma SQL

1. Dans le dashboard Supabase → **SQL Editor** → **New query**
2. Copier-coller l'intégralité du fichier `supabase_schema.sql`
3. Cliquer **Run** (bouton vert)
4. Vérifier dans **Table Editor** → vous devez voir : `entreprises`, `fiches`, `paiements`, `avis`, `contacts`, `emails_log`, `naf_reference`, `baremes_boost`

### 1.3 Récupérer les clés API

1. **Settings** → **API**
2. Copier les deux valeurs :
   - **URL** → `https://xxxxxxxx.supabase.co`
   - **anon public** → `eyJhbGc...` (longue chaîne)
3. Ne jamais exposer la `service_role` key côté front

### 1.4 Configurer la politique RLS (Row Level Security)

Les politiques RLS sont déjà dans le SQL. Vérifier :
1. **Authentication** → **Policies** → vérifier que `fiches_publiques` et `avis_publics` sont actives

---

## ÉTAPE 2 — STRIPE (paiements)

### 2.1 Créer le compte Stripe

1. [stripe.com](https://stripe.com) → créer un compte → activer le compte (KYC)
2. **Attention** : rester en mode Test jusqu'aux premiers vrais tests de bout en bout

### 2.2 Créer les Payment Links

Pour chaque offre, aller dans **Payment Links** → **New**

| Offre | Prix | Paramètres |
|---|---|---|
| Activation | 139,00 € | One-time · Nom produit : "Activation fiche Visibleo" |
| Boost Ville | 19,99 €/mois | Recurring · Mensuel |
| Boost Département | 34,99 €/mois | Recurring · Mensuel |
| Boost Région | 59,99 €/mois | Recurring · Mensuel |
| Boost Multi-régions | 89,99 €/mois | Recurring · Mensuel |
| Boost National | 149,00 €/mois | Recurring · Mensuel |

Pour chaque Payment Link :
- Activer **Collect customer's name and email**
- Activer **Allow promotion codes** (optionnel)
- Dans **After payment** → choisir **Redirect to URL** → `https://VOTRE_DOMAINE/pages/activer.html?payment=success`

### 2.3 Configurer le Webhook Stripe (pour Make.com)

1. **Developers** → **Webhooks** → **Add endpoint**
2. URL : `https://hook.eu1.make.com/VOTRE_WEBHOOK_ID` (Make.com vous donnera cette URL)
3. Events à écouter : `checkout.session.completed`, `customer.subscription.deleted`

---

## ÉTAPE 3 — GITHUB PAGES (hébergement gratuit)

### 3.1 Créer le repository

```bash
# Sur votre machine locale
git init visibleo
cd visibleo
# Copier tous les fichiers du projet dans ce dossier
git add .
git commit -m "Initial commit — Visibleo v1.0"
```

Puis sur [github.com](https://github.com) :
1. **New repository** → nom : `visibleo` → Public
2. Suivre les instructions pour pousser le code existant

```bash
git remote add origin https://github.com/VOTRE_USERNAME/visibleo.git
git branch -M main
git push -u origin main
```

### 3.2 Activer GitHub Pages

1. Repository → **Settings** → **Pages**
2. Source : **Deploy from a branch** → `main` → `/ (root)`
3. Sauvegarder
4. Votre site sera accessible sur : `https://VOTRE_USERNAME.github.io/visibleo`

### 3.3 (Optionnel) Domaine personnalisé visibleo.fr

1. Acheter le domaine sur OVH ou Gandi (env. 10€/an)
2. Dans OVH → Zone DNS → Ajouter un enregistrement CNAME :
   - Nom : `@` (ou `www`)
   - Cible : `VOTRE_USERNAME.github.io`
3. Dans GitHub Pages → **Custom domain** → entrer `visibleo.fr`
4. Cocher **Enforce HTTPS**
5. Délai de propagation DNS : 24-48h

---

## ÉTAPE 4 — INJECTION DES CLÉS

### Option A — Script automatique (recommandé)

```bash
# Dans le dossier du projet
bash configure.sh
```

Le script vous demande vos clés et les injecte dans tous les fichiers automatiquement.

### Option B — Manuelle

Dans chaque fichier HTML, remplacer :
```
https://VOTRE_REF.supabase.co  →  votre URL Supabase
VOTRE_ANON_KEY                 →  votre anon key
https://buy.stripe.com/VOTRE_LIEN_ACTIVATION  →  votre lien Stripe activation
```

Fichiers à modifier : `index.html`, `pages/fiche.html`, `pages/activer.html`, `pages/espace.html`, `pages/annuaire.html`, `pages/admin.html`, `js/api.js`

### Après injection

```bash
git add .
git commit -m "Configure production keys"
git push
```

> ⚠️ **IMPORTANT** : ne jamais commiter la `service_role` key dans le repo. L'`anon key` est safe (elle est soumise aux RLS).

---

## ÉTAPE 5 — BREVO (emails transactionnels)

### 5.1 Créer le compte

1. [brevo.com](https://brevo.com) → compte gratuit (300 emails/jour)
2. Configurer le domaine expéditeur : `contact@visibleo.fr`
3. Valider le DNS SPF/DKIM (OVH vous guidera)

### 5.2 Créer les templates

1. **Email** → **Templates** → **New Template**
2. Créer les 8 templates depuis `emails/templates.html`
3. Copier le HTML de chaque `<html-template id="...">` dans Brevo
4. Noter les Template IDs retournés (ex: 1, 2, 3…)
5. Mettre à jour le mapping dans `docs/make-blueprint.md`

### 5.3 Créer les contacts attributs

Dans **Contacts** → **Settings** → **Contact attributes** :
- `NOM_ENTREPRISE` (text)
- `PRENOM_DIRIGEANT` (text)
- `VILLE` (text)
- `NAF_LIBELLE` (text)
- `SIREN` (text)
- `LIEN_ACTIVATION` (text)

---

## ÉTAPE 6 — MAKE.COM (automatisation)

### 6.1 Créer le compte

1. [make.com](https://make.com) → compte gratuit (1000 ops/mois)
2. Passer à **Core** (9€/mois) dès que vous dépassez 30 nouvelles entreprises/jour

### 6.2 Créer les connexions

Dans **Connections** → créer :
- **Supabase** : URL + service_role key
- **Brevo** : API key
- **Stripe** : Publishable key
- **HTTP** (pour BODACC et Claude API)

### 6.3 Créer les scénarios

Créer les 6 scénarios décrits dans `docs/make-blueprint.md` dans cet ordre :
1. BODACC → Supabase (le plus important)
2. Supabase → Brevo (emails d'activation)
3. Claude API → Description SEO
4. Relance J+7
5. Stripe Webhook → Activation fiche
6. Suivi avis quotidien

### 6.4 Tester chaque scénario

Pour le scénario BODACC :
1. Activer le scénario
2. Cliquer **Run once**
3. Vérifier dans Supabase → Table `entreprises` → nouvelles lignes insérées

---

## ÉTAPE 7 — TESTS DE BOUT EN BOUT

### Checklist avant mise en ligne

```
□ Supabase : toutes les tables créées et accessibles
□ GitHub Pages : site accessible sur l'URL
□ Page d'accueil : fiches démo affichées correctement
□ Recherche : filtre fonctionne (même en démo)
□ Fiche entreprise : tabs, formulaire contact, avis
□ Page activation : aperçu fiche, détail prix, mentions légales
□ Bouton Stripe : redirige vers Stripe (mode test)
□ Paiement test : 4242 4242 4242 4242 → succès → page de succès
□ Espace propriétaire : dashboard, formulaire édition
□ Admin : pipeline, table entreprises (données démo)
□ Make.com : scénario BODACC tourne une fois manuellement
□ Email de test : template reçu correctement
□ Mobile : responsive sur iPhone et Android
```

### Carte de test Stripe

```
Numéro : 4242 4242 4242 4242
Date    : n'importe quelle date future
CVC     : n'importe quels 3 chiffres
```

---

## RÉCAPITULATIF DES COÛTS

| Service | Plan | Coût |
|---|---|---|
| GitHub Pages | Free | 0 €/mois |
| Supabase | Free (500MB, 2 projets) | 0 €/mois |
| Brevo | Free (300 emails/jour) | 0 €/mois |
| Make.com | Free (1000 ops/mois) | 0 €/mois |
| Claude API | Pay-as-you-go | ~0,003€/fiche |
| Domaine (optionnel) | — | ~1€/mois |
| **TOTAL lancement** | | **~0 €/mois** |

Quand ça commence à générer du CA :
| Service | Passage à | Coût |
|---|---|---|
| Make.com | Core | 9 €/mois |
| Supabase | Pro | 25 €/mois |
| Brevo | Starter | 19 €/mois |
| **TOTAL scale** | | **~53 €/mois** |

---

## EN CAS DE PROBLÈME

**Fiche ne s'affiche pas**
→ Vérifier que `statut = 'active'` dans Supabase > Table fiches
→ Vérifier les politiques RLS dans Authentication > Policies

**Stripe ne redirige pas après paiement**
→ Vérifier l'URL de redirection dans le Payment Link Stripe
→ Format : `https://DOMAINE/pages/activer.html?payment=success`

**Make.com : erreur 403 Supabase**
→ Utiliser la `service_role` key dans Make (pas l'anon key)
→ Vérifier que les RLS sont bien configurées

**Emails non reçus**
→ Vérifier les DNS SPF/DKIM dans Brevo > Senders
→ Tester avec un email personnel d'abord

---

*Guide rédigé pour Visibleo v1.0 — avril 2026*
