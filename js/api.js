// ============================================================
// VISIBLEO — Couche API partagée
// Agent 3 — Intégrateur API
// Inclure via <script src="/js/api.js"> sur toutes les pages
// ============================================================

// ============================================================
// CONFIG — à remplacer par vos vraies clés
// ============================================================
const CONFIG = {
  supabase: {
    url:     window.__ENV?.SUPABASE_URL     || 'https://VOTRE_REF.supabase.co',
    anonKey: window.__ENV?.SUPABASE_ANON    || 'VOTRE_ANON_KEY',
    // NE JAMAIS exposer la service_role key côté front
  },
  stripe: {
    publishableKey: window.__ENV?.STRIPE_PK || 'pk_test_VOTRE_CLE',
    // Payment links générés depuis le dashboard Stripe
    links: {
      activation:     'https://buy.stripe.com/ACTIVATION_LINK',
      boost_ville:    'https://buy.stripe.com/BOOST_VILLE_LINK',
      boost_dept:     'https://buy.stripe.com/BOOST_DEPT_LINK',
      boost_region:   'https://buy.stripe.com/BOOST_REGION_LINK',
      boost_multi:    'https://buy.stripe.com/BOOST_MULTI_LINK',
      boost_national: 'https://buy.stripe.com/BOOST_NATIONAL_LINK',
    }
  },
  brevo: {
    // Clé API uniquement côté Make.com, jamais côté front
    // Le front fait des requêtes à Supabase Edge Functions
  },
  bodacc: {
    rssUrl: 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records',
  }
};

// ============================================================
// CLIENT SUPABASE (via CDN)
// ============================================================
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (typeof supabase === 'undefined') {
    console.error('[Visibleo] Supabase SDK non chargé. Ajoutez le script CDN.');
    return null;
  }
  _supabase = supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
  return _supabase;
}

// ============================================================
// API FICHES — lecture publique (annuaire)
// ============================================================
const FichesAPI = {

  // Recherche dans l'annuaire : ville + secteur + texte libre
  async rechercher({ ville = '', secteur = '', q = '', page = 1, perPage = 20, boost_first = true } = {}) {
    const db = getSupabase();
    if (!db) return { data: [], count: 0 };

    let query = db
      .from('fiches')
      .select(`
        id, slug, description_courte, services, telephone_public,
        zone_intervention, photo_principale, nb_vues, nb_contacts,
        note_moyenne, nb_avis, boost_niveau, statut,
        entreprises!inner(nom, ville, departement, naf_libelle, type_entreprise)
      `, { count: 'exact' })
      .eq('statut', 'active')
      .range((page - 1) * perPage, page * perPage - 1);

    if (ville)   query = query.ilike('entreprises.ville', `%${ville}%`);
    if (secteur) query = query.ilike('entreprises.naf_libelle', `%${secteur}%`);
    if (q)       query = query.or(`description_courte.ilike.%${q}%,entreprises.nom.ilike.%${q}%`);

    // Boost en premier
    if (boost_first) {
      query = query.order('boost_niveau', { ascending: false })
                   .order('note_moyenne', { ascending: false });
    }

    const { data, count, error } = await query;
    if (error) { console.error('[FichesAPI.rechercher]', error); return { data: [], count: 0 }; }
    return { data, count };
  },

  // Charger une fiche par son slug
  async getBySlug(slug) {
    const db = getSupabase();
    if (!db) return null;

    const { data, error } = await db
      .from('fiches')
      .select(`
        *,
        entreprises(*),
        avis(id, auteur_nom, note, commentaire, created_at)
      `)
      .eq('slug', slug)
      .eq('statut', 'active')
      .eq('avis.statut', 'approuve')
      .single();

    if (error) { console.error('[FichesAPI.getBySlug]', error); return null; }

    // Incrémenter le compteur de vues (fire & forget)
    db.rpc('increment_vues', { fiche_id: data.id }).then(() => {});

    return data;
  },

  // Fiches similaires (même secteur, même département)
  async getSimilaires(ficheId, naf_code, departement, limit = 4) {
    const db = getSupabase();
    if (!db) return [];

    const { data } = await db
      .from('fiches')
      .select('id, slug, description_courte, note_moyenne, nb_avis, entreprises(nom, ville, naf_libelle)')
      .eq('statut', 'active')
      .eq('entreprises.departement', departement)
      .neq('id', ficheId)
      .limit(limit);

    return data || [];
  },

  // Suggestions autocomplete pour la barre de recherche
  async autocomplete(q) {
    const db = getSupabase();
    if (!db) return [];

    const { data } = await db
      .from('fiches')
      .select('slug, entreprises(nom, ville, naf_libelle)')
      .eq('statut', 'active')
      .or(`entreprises.nom.ilike.%${q}%,entreprises.naf_libelle.ilike.%${q}%`)
      .limit(8);

    return data || [];
  },

  // Compteur stats homepage
  async getStats() {
    const db = getSupabase();
    if (!db) return {};

    const [{ count: nbFiches }, { count: nbVilles }] = await Promise.all([
      db.from('fiches').select('id', { count: 'exact', head: true }).eq('statut', 'active'),
      db.from('entreprises').select('ville', { count: 'exact', head: true }),
    ]);

    return { nbFiches: nbFiches || 0, nbVilles: nbVilles || 0 };
  }
};

// ============================================================
// API AVIS
// ============================================================
const AvisAPI = {
  async deposer({ fiche_id, auteur_nom, note, commentaire }) {
    const db = getSupabase();
    if (!db) return null;

    const { data, error } = await db
      .from('avis')
      .insert({ fiche_id, auteur_nom, note, commentaire, statut: 'en_attente' })
      .select()
      .single();

    if (error) { console.error('[AvisAPI.deposer]', error); return null; }
    return data;
  }
};

// ============================================================
// API CONTACTS — lead via fiche
// ============================================================
const ContactsAPI = {
  async envoyer({ fiche_id, entreprise_id, nom_demandeur, email_demandeur, tel_demandeur, message }) {
    const db = getSupabase();
    if (!db) return false;

    const { error } = await db
      .from('contacts')
      .insert({ fiche_id, entreprise_id, nom_demandeur, email_demandeur, tel_demandeur, message });

    if (error) { console.error('[ContactsAPI.envoyer]', error); return false; }
    return true;
  }
};

// ============================================================
// API PAIEMENTS — tunnel Stripe
// ============================================================
const PaiementsAPI = {

  // Construire le lien Stripe avec metadata pré-remplie
  getLienStripe(type, { siren, nom, email }) {
    const base = CONFIG.stripe.links[type];
    if (!base) { console.error(`[PaiementsAPI] Lien Stripe inconnu: ${type}`); return '#'; }

    const params = new URLSearchParams({
      prefilled_email: email || '',
      client_reference_id: siren,
      // Metadata passée via URL pour le webhook
    });

    return `${base}?${params.toString()}`;
  },

  // Vérifier le statut de paiement depuis l'URL de retour Stripe
  getStatutDepuisURL() {
    const params = new URLSearchParams(window.location.search);
    return {
      success: params.get('payment') === 'success',
      cancelled: params.get('payment') === 'cancelled',
      sessionId: params.get('session_id'),
    };
  },

  // Récupérer les infos de paiement d'une entreprise
  async getPaiements(entrepriseId) {
    const db = getSupabase();
    if (!db) return [];

    const { data } = await db
      .from('paiements')
      .select('*')
      .eq('entreprise_id', entrepriseId)
      .eq('statut', 'paid')
      .order('created_at', { ascending: false });

    return data || [];
  }
};

// ============================================================
// API ENTREPRISES — espace propriétaire
// ============================================================
const EntreprisesAPI = {

  // Récupérer une entreprise par SIREN (pour la page d'activation)
  async getBySiren(siren) {
    const db = getSupabase();
    if (!db) return null;

    const { data, error } = await db
      .from('entreprises')
      .select('*, fiches(*)')
      .eq('siren', siren)
      .single();

    if (error) return null;
    return data;
  },

  // Mettre à jour la fiche (par le propriétaire)
  async updateFiche(ficheId, updates) {
    const db = getSupabase();
    if (!db) return false;

    const { error } = await db
      .from('fiches')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', ficheId);

    if (error) { console.error('[EntreprisesAPI.updateFiche]', error); return false; }
    return true;
  }
};

// ============================================================
// UTILS — Génération de slug
// ============================================================
const Utils = {
  toSlug(str) {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  },

  // Générer le slug d'une fiche : nom-ville-dept
  ficheSlug(nom, ville, dept) {
    return `${this.toSlug(nom)}-${this.toSlug(ville)}-${dept}`;
  },

  // Formater une note en étoiles HTML
  etoiles(note, max = 5) {
    let html = '';
    for (let i = 1; i <= max; i++) {
      if (i <= Math.floor(note))      html += '<span class="star full">★</span>';
      else if (i - 0.5 <= note)       html += '<span class="star half">★</span>';
      else                            html += '<span class="star empty">☆</span>';
    }
    return html;
  },

  // Formater un numéro de téléphone français
  formatTel(tel) {
    if (!tel) return '';
    return tel.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  },

  // Formater un prix
  formatPrix(centimes) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
      .format(centimes / 100);
  },

  // Badge boost
  boostLabel(niveau) {
    const labels = {
      aucun: null,
      ville: '⭐ Mis en avant',
      departement: '⭐⭐ Prioritaire département',
      region: '⭐⭐⭐ Prioritaire région',
      multi_region: '🏆 Multi-régions',
      national: '🏆 Référence nationale',
    };
    return labels[niveau] || null;
  },

  // Temps relatif
  timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr);
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Aujourd\'hui';
    if (days === 1) return 'Hier';
    if (days < 30)  return `Il y a ${days} jours`;
    if (days < 365) return `Il y a ${Math.floor(days / 30)} mois`;
    return `Il y a ${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? 's' : ''}`;
  }
};

// ============================================================
// ADMIN API — back-office (utilise service_role via Make)
// ============================================================
const AdminAPI = {

  // Récupérer les données du pipeline dashboard
  async getPipelineData({ statut = 'tous', limit = 50, offset = 0 } = {}) {
    const db = getSupabase();
    if (!db) return [];

    let query = db
      .from('pipeline_dashboard')
      .select('*')
      .range(offset, offset + limit - 1);

    if (statut !== 'tous') query = query.eq('pipeline_statut', statut);

    const { data } = await query;
    return data || [];
  },

  // Stats globales pour le dashboard
  async getStats() {
    const db = getSupabase();
    if (!db) return {};

    const [
      { count: total },
      { count: actives },
      { count: enAttente },
      { data: revenue }
    ] = await Promise.all([
      db.from('entreprises').select('id', { count: 'exact', head: true }),
      db.from('fiches').select('id', { count: 'exact', head: true }).eq('statut', 'active'),
      db.from('entreprises').select('id', { count: 'exact', head: true }).eq('pipeline_statut', 'email_envoye'),
      db.from('paiements').select('montant').eq('statut', 'paid'),
    ]);

    const totalRevenue = (revenue || []).reduce((s, p) => s + p.montant, 0);

    return {
      total: total || 0,
      actives: actives || 0,
      enAttente: enAttente || 0,
      revenue: totalRevenue,
    };
  }
};

// Export global
window.Visibleo = { FichesAPI, AvisAPI, ContactsAPI, PaiementsAPI, EntreprisesAPI, AdminAPI, Utils, CONFIG };
