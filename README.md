# Visibleo

**L'annuaire des entreprises françaises nouvellement créées.**

Service commercial privé de mise en visibilité pour les entreprises immatriculées en France.
Acquisition automatisée via BODACC, fiche SEO générée par IA, tunnel de paiement Stripe.

## Stack

- **Front** : HTML/CSS/JS vanilla — GitHub Pages
- **Base de données** : Supabase (PostgreSQL)
- **Paiements** : Stripe Payment Links
- **Emails** : Brevo (300/jour gratuit)
- **Automatisation** : Make.com
- **Génération IA** : Claude API (Anthropic)

## Déploiement

Voir `docs/guide-deploiement.md` pour les instructions complètes.

```bash
bash configure.sh  # Injecte vos clés API dans tous les fichiers
git push           # Déploie sur GitHub Pages
```

## Structure

```
visibleo/
├── index.html              # Homepage annuaire
├── 404.html                # Page erreur
├── pages/
│   ├── fiche.html          # Fiche entreprise publique
│   ├── activer.html        # Tunnel de paiement
│   ├── espace.html         # Espace propriétaire client
│   ├── annuaire.html       # Annuaire avec filtres
│   ├── admin.html          # Back-office CRM
│   └── mentions-legales.html
├── js/
│   └── api.js              # Couche API partagée
├── emails/
│   └── templates.html      # 8 templates Brevo
├── docs/
│   ├── guide-deploiement.md
│   └── make-blueprint.md
└── supabase_schema.sql     # Schéma complet PostgreSQL
```

## Modèle économique

| Offre | Prix | Type |
|---|---|---|
| Activation fiche | 139 € | One-shot |
| Boost Ville | 19,99 €/mois | Récurrent |
| Boost Département | 34,99 €/mois | Récurrent |
| Boost Région | 59,99 €/mois | Récurrent |
| Boost National | 149 €/mois | Récurrent |

---

*Service commercial privé, non affilié à un organisme public. Données sources : BODACC / RNE (open data INSEE).*
