// ============================================================
// VISIBLEO — Module Claude API
// Génération automatique des descriptions SEO, services,
// mots-clés pour chaque fiche entreprise
// Usage : admin.html → onglet BODACC → bouton "Générer fiche"
//         Make.com → Scénario 3
// ============================================================

const ClaudeAPI = {

  // Modèle à utiliser
  MODEL: 'claude-sonnet-4-20250514',

  // ── Générer une fiche SEO complète ────────────────────────
  async genererFiche(entreprise) {
    const {
      nom, naf_libelle, naf_code,
      ville, departement, region,
      forme_juridique, nom_dirigeant, date_immat,
      type_entreprise
    } = entreprise;

    const prompt = `Tu es un rédacteur SEO expert en annuaires professionnels français.
Génère le contenu d'une fiche entreprise pour l'annuaire Visibleo.

Entreprise : ${nom}
Secteur d'activité : ${naf_libelle}${naf_code ? ` (${naf_code})` : ''}
Localisation : ${ville}${departement ? `, département ${departement}` : ''}${region ? `, ${region}` : ''}
Forme juridique : ${forme_juridique || 'non précisée'}
${nom_dirigeant ? `Dirigeant : ${nom_dirigeant}` : ''}
${date_immat ? `Date de création : ${new Date(date_immat).toLocaleDateString('fr-FR')}` : ''}
Type d'activité : ${type_entreprise || 'local'}

Génère uniquement un objet JSON valide, sans markdown, sans balises, sans explication :
{
  "description_courte": "...",
  "description_seo": "...",
  "services": ["...", "...", "..."],
  "mots_cles": ["...", "...", "..."],
  "meta_title": "...",
  "meta_desc": "..."
}

Règles :
- description_courte : 120-150 caractères, accrocheur, inclut la ville
- description_seo : 200-280 mots, naturel, orienté client, inclut ville + secteur + avantages
- services : 4-6 services concrets (pas génériques), adaptés au secteur NAF
- mots_cles : 6-8 mots-clés SEO locaux (ex: "plombier saumur", "dépannage plomberie 49")
- meta_title : 55-60 caractères, format "Nom — Service à Ville | Visibleo"
- meta_desc : 150-160 caractères, inclut un appel à l'action`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Note : en production, cette clé doit passer par une Edge Function Supabase
          // Ne JAMAIS exposer sk-ant-... directement dans le front
          // Utiliser l'endpoint /functions/v1/generate-fiche à la place
        },
        body: JSON.stringify({
          model: this.MODEL,
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error(`API Claude : ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || '';

      // Parser le JSON retourné
      const clean = text
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      return { ok: true, data: JSON.parse(clean) };
    } catch (e) {
      console.error('[ClaudeAPI] Erreur:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── Générer via Edge Function Supabase (recommandé en prod) ─
  async genererFicheSecurise(entreprise, supabaseUrl) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-fiche`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entreprise }),
      });

      if (!response.ok) throw new Error(`Edge Function : ${response.status}`);
      const data = await response.json();
      return { ok: true, data };
    } catch (e) {
      console.error('[ClaudeAPI] Edge Function error:', e);
      return { ok: false, error: e.message };
    }
  },

  // ── Générer en masse (batch admin) ────────────────────────
  async genererBatch(entreprises, onProgress) {
    const results = [];
    for (let i = 0; i < entreprises.length; i++) {
      const e = entreprises[i];
      onProgress?.(i + 1, entreprises.length, e.nom);

      const result = await this.genererFiche(e);
      results.push({ siren: e.siren, nom: e.nom, ...result });

      // Respecter le rate limit Claude API : 1 appel/seconde max
      if (i < entreprises.length - 1) {
        await new Promise(r => setTimeout(r, 1100));
      }
    }
    return results;
  },

  // ── Prévisualiser (mode démo sans clé API) ────────────────
  previewDemo(entreprise) {
    const { nom, naf_libelle, ville, departement } = entreprise;
    const secteurSlug = (naf_libelle || '').toLowerCase().slice(0, 20);
    const villeSlug = (ville || '').toLowerCase();

    return {
      description_courte: `${nom} — ${naf_libelle} professionnel à ${ville}. Devis gratuit, intervention rapide.`,
      description_seo: `${nom} est une entreprise spécialisée en ${naf_libelle?.toLowerCase()} basée à ${ville} (${departement}). Créée récemment, l'entreprise propose ses services aux particuliers et professionnels de la région. Contactez-nous pour un devis gratuit et une intervention rapide dans un rayon de 30 km autour de ${ville}.`,
      services: [
        `${naf_libelle} résidentielle`,
        'Devis gratuit sous 24h',
        'Intervention urgente',
        'Conseil et accompagnement',
      ],
      mots_cles: [
        `${secteurSlug} ${villeSlug}`,
        `${secteurSlug} ${departement}`,
        `devis ${secteurSlug}`,
        `${secteurSlug} pas cher`,
      ],
      meta_title: `${nom} — ${naf_libelle} à ${ville} | Visibleo`,
      meta_desc: `${nom}, votre ${naf_libelle?.toLowerCase()} à ${ville}. Devis gratuit, intervention rapide. Contactez-nous maintenant.`,
    };
  },
};

// ── Edge Function Supabase pour la génération sécurisée ────
// À créer dans supabase/functions/generate-fiche/index.ts :
//
// import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.20.0"
//
// const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") })
//
// serve(async (req) => {
//   const { entreprise } = await req.json()
//   const message = await anthropic.messages.create({
//     model: "claude-sonnet-4-20250514",
//     max_tokens: 1000,
//     messages: [{ role: "user", content: buildPrompt(entreprise) }],
//   })
//   const text = message.content[0].text
//   const data = JSON.parse(text.replace(/```json?|```/g, '').trim())
//   return new Response(JSON.stringify(data), {
//     headers: { "Content-Type": "application/json" }
//   })
// })

window.ClaudeAPI = ClaudeAPI;
