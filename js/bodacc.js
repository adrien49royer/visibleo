// ============================================================
// VISIBLEO — Module BODACC
// Récupère les nouvelles immatriculations depuis l'API BODACC
// Usage : import depuis admin.html ou un script Make.com
// ============================================================

const BODACC = {

  BASE_URL: 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records',

  // ── Récupérer les immatriculations du jour ─────────────────
  async fetchDuJour(limit = 50, offset = 0) {
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);
    const dateStr = hier.toISOString().split('T')[0]; // YYYY-MM-DD

    const params = new URLSearchParams({
      where: `dateparution >= '${dateStr}' AND familleavis_lib = 'Création'`,
      select: 'id,dateparution,publicationavis,nompatronyme,siren,activiteformatee,adresseetablissement,numerodepartement,ville,typeannonce,registre',
      limit: String(limit),
      offset: String(offset),
      order_by: 'dateparution DESC',
      lang: 'fr',
    });

    try {
      const res = await fetch(`${this.BASE_URL}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return {
        ok: true,
        total: json.total_count || 0,
        records: (json.results || []).map(r => this._normaliser(r)),
      };
    } catch (e) {
      console.error('[BODACC] Erreur fetch:', e);
      return { ok: false, error: e.message, records: [] };
    }
  },

  // ── Récupérer par département ──────────────────────────────
  async fetchParDept(dept, limit = 30) {
    const params = new URLSearchParams({
      where: `numerodepartement = '${dept}' AND familleavis_lib = 'Création'`,
      select: 'id,dateparution,nompatronyme,siren,activiteformatee,adresseetablissement,numerodepartement,ville',
      limit: String(limit),
      order_by: 'dateparution DESC',
    });

    try {
      const res = await fetch(`${this.BASE_URL}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return {
        ok: true,
        total: json.total_count || 0,
        records: (json.results || []).map(r => this._normaliser(r)),
      };
    } catch (e) {
      return { ok: false, error: e.message, records: [] };
    }
  },

  // ── Chercher par SIREN ────────────────────────────────────
  async fetchParSiren(siren) {
    const params = new URLSearchParams({
      where: `siren = '${siren.replace(/\s/g, '')}'`,
      limit: '1',
    });

    try {
      const res = await fetch(`${this.BASE_URL}?${params}`);
      const json = await res.json();
      if (!json.results?.length) return null;
      return this._normaliser(json.results[0]);
    } catch (e) {
      return null;
    }
  },

  // ── Normaliser un enregistrement BODACC ───────────────────
  _normaliser(record) {
    const addr = record.adresseetablissement || {};
    return {
      siren:           record.siren || '',
      nom:             record.nompatronyme || '',
      activite:        record.activiteformatee || '',
      adresse:         [addr.numeroVoieEtablissement, addr.typeVoieEtablissement, addr.libelleVoieEtablissement].filter(Boolean).join(' '),
      ville:           record.ville || addr.libelleCommuneEtablissement || '',
      departement:     record.numerodepartement || '',
      code_postal:     addr.codePostalEtablissement || '',
      date_parution:   record.dateparution || '',
      type_annonce:    record.typeannonce || '',
      registre:        record.registre || '',
      // Enrichissement auto
      naf_code:        this._extractNaf(record.activiteformatee),
      type_activite:   this._classifierActivite(record.activiteformatee),
      slug_ville:      this._toSlug(record.ville || ''),
    };
  },

  // ── Extraire un code NAF depuis le libellé ────────────────
  _extractNaf(libelle) {
    if (!libelle) return '';
    // Format BODACC : "Travaux de plomberie (4322A)"
    const match = libelle.match(/\(([0-9]{4}[A-Z])\)/);
    return match ? match[1] : '';
  },

  // ── Classifier le type d'activité ────────────────────────
  _classifierActivite(activite) {
    if (!activite) return 'local';
    const a = activite.toLowerCase();
    if (/(logiciel|informatique|numérique|web|digital|seo|marketing digital|intelligence artificielle)/i.test(a)) return 'digital';
    if (/(conseil|consulting|management|stratégie|audit|formation)/i.test(a)) return 'national';
    if (/(transport|déménagement|logistique|fret)/i.test(a)) return 'regional';
    if (/(immobilier|agence immobilière|promotion immobilière)/i.test(a)) return 'regional';
    return 'local';
  },

  // ── Slug utilitaire ───────────────────────────────────────
  _toSlug(str) {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  },

  // ── Générer un slug fiche depuis un record ────────────────
  genererSlug(record) {
    const nom = this._toSlug(record.nom || '');
    const ville = this._toSlug(record.ville || '');
    const dept = record.departement || '';
    return `${nom}-${ville}-${dept}`.slice(0, 80);
  },

  // ── Préparer l'objet pour INSERT Supabase ────────────────
  toSupabaseEntreprise(record) {
    return {
      siren:           record.siren,
      nom:             record.nom,
      naf_code:        record.naf_code,
      naf_libelle:     record.activite.replace(/\s*\([^)]+\)/, '').trim(),
      adresse:         record.adresse,
      ville:           record.ville,
      code_postal:     record.code_postal,
      departement:     record.departement,
      date_immat:      record.date_parution,
      source:          'BODACC',
      type_entreprise: record.type_activite,
      pipeline_statut: 'nouveau',
    };
  },

  // ── Test de connectivité API ───────────────────────────────
  async ping() {
    try {
      const res = await fetch(`${this.BASE_URL}?limit=1`);
      return res.ok;
    } catch {
      return false;
    }
  },
};

// Export si utilisé en module
if (typeof module !== 'undefined') module.exports = BODACC;
window.BODACC = BODACC;
