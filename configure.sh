#!/bin/bash
# ============================================================
# VISIBLEO — Script de configuration automatique
# Usage : bash configure.sh
# ============================================================
# Ce script remplace les placeholders dans tous les fichiers HTML
# par vos vraies clés Supabase et liens Stripe.
# ============================================================

set -e

echo ""
echo "══════════════════════════════════════════"
echo "  VISIBLEO — Configuration automatique"
echo "══════════════════════════════════════════"
echo ""

# ── SUPABASE ─────────────────────────────────────────────
echo "1/3 — Configuration Supabase"
echo "    → Récupérez ces valeurs sur : supabase.com > Settings > API"
echo ""
read -p "    Votre Supabase URL (ex: https://xxxxx.supabase.co) : " SB_URL
read -p "    Votre Supabase anon key (commence par eyJ...) : " SB_KEY
echo ""

# ── STRIPE ───────────────────────────────────────────────
echo "2/3 — Configuration Stripe Payment Links"
echo "    → Créez vos liens sur : dashboard.stripe.com > Payment Links"
echo ""
read -p "    Activation (139€)     : https://buy.stripe.com/" STRIPE_ACTIVATION
read -p "    Boost Ville (19.99€)   : https://buy.stripe.com/" STRIPE_VILLE
read -p "    Boost Dept (34.99€)   : https://buy.stripe.com/" STRIPE_DEPT
read -p "    Boost Région (59.99€)  : https://buy.stripe.com/" STRIPE_REGION
read -p "    Boost National (149€)  : https://buy.stripe.com/" STRIPE_NATIONAL
echo ""

# ── DOMAINE ──────────────────────────────────────────────
echo "3/3 — Domaine"
read -p "    Votre domaine (ex: visibleo.fr ou username.github.io/visibleo) : " DOMAIN
echo ""

# ── REMPLACEMENT DANS LES FICHIERS ───────────────────────
echo "→ Application des paramètres..."

FILES=$(find . -name "*.html" -o -name "*.js" | grep -v node_modules)

for FILE in $FILES; do
  sed -i "s|https://VOTRE_REF.supabase.co|${SB_URL}|g" "$FILE"
  sed -i "s|VOTRE_ANON_KEY|${SB_KEY}|g" "$FILE"
  sed -i "s|https://buy.stripe.com/VOTRE_LIEN_ACTIVATION|https://buy.stripe.com/${STRIPE_ACTIVATION}|g" "$FILE"
  sed -i "s|https://buy.stripe.com/VOTRE_LIEN_BOOST_VILLE|https://buy.stripe.com/${STRIPE_VILLE}|g" "$FILE"
  sed -i "s|https://buy.stripe.com/VOTRE_LIEN_BOOST_DEPT|https://buy.stripe.com/${STRIPE_DEPT}|g" "$FILE"
  sed -i "s|https://buy.stripe.com/VOTRE_LIEN_BOOST_REGION|https://buy.stripe.com/${STRIPE_REGION}|g" "$FILE"
  sed -i "s|https://buy.stripe.com/VOTRE_LIEN_BOOST_NATIONAL|https://buy.stripe.com/${STRIPE_NATIONAL}|g" "$FILE"
  sed -i "s|https://visibleo.fr|https://${DOMAIN}|g" "$FILE"
done

echo ""
echo "══════════════════════════════════════════"
echo "  ✓ Configuration appliquée à tous les fichiers"
echo ""
echo "  Prochaine étape :"
echo "  git add . && git commit -m 'Configure production keys' && git push"
echo "══════════════════════════════════════════"
echo ""
