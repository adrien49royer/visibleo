// ============================================================
// VISIBLEO — Module BODACC v2
// Schéma API mis à jour avril 2026 — champs réels vérifiés
// ============================================================
// Champs réels BODACC :
//   commercant         → nom de l'entreprise / dirigeant
//   ville, cp          → localisation
//   numerodepartement  → département (ex: "49")
//   region_nom_officiel → région
//   familleavis        → "creation" | "immatriculation" | "modification" ...
//   familleavis_lib    → "Créations" | "Immatriculations" ...
//   dateparution       → "YYYY-MM-DD"
//   listepersonnes     → JSON avec SIREN, nom dirigeant, activité
//   listeetablissements → JSON avec adresse, activité NAF
//   registre           → "RCS" | "RM" ...
// ============================================================

const BODACC = {

  BASE_URL: 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records',

  // ── Récupérer les créations/immatriculations du jour ───────
  async fetchDuJour(limit = 50, offset = 0) {
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);
    const dateStr = hier.toISOString().split('T')[0];

    const params = new URLSearchParams({
      where: `(familleavis = 'creation' OR familleavis = 'immatriculation') AND dateparution >= '${dateStr}'`,
      select: 'id,dateparution,commercant,ville,cp,numerodepartement,region_nom_officiel,familleavis,familleavis_lib,listepersonnes,listeetablissements,registre',
      limit: String(limit),
      offset: String(offset),
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
      console.error('[BODACC] Erreur:', e);
      return { ok: false, error: e.message, records: [] };
    }
  },

  // ── Récupérer par département ──────────────────────────────
  async fetchParDept(dept, limit = 30) {
    const params = new URLSearchParams({
      where: `(familleavis = 'creation' OR familleavis = 'immatriculation') AND numerodepartement = '${dept}'`,
      select: 'id,dateparution,commercant,ville,cp,numerodepartement,region_nom_officiel,familleavis_lib,listepersonnes,listeetablissements',
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

  // ── Chercher par SIREN (dans listepersonnes JSON) ──────────
  async fetchParSiren(siren) {
    const params = new URLSearchParams({
      where: `listepersonnes like '%${siren.replace(/\s/g,'')}%'`,
      limit: '3',
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
  _normaliser(r) {
    // Extraire SIREN et activité depuis listepersonnes (JSON imbriqué)
    let siren = '', activite = '', naf_code = '', nom_dirigeant = '';
    try {
      const lp = r.listepersonnes;
      const personnes = typeof lp === 'string' ? JSON.parse(lp) : lp;
      if (Array.isArray(personnes) && personnes.length > 0) {
        const p = personnes[0];
        siren = p.siren || p.sirenSiret?.slice(0, 9) || '';
        nom_dirigeant = p.nom && p.prenom ? `${p.prenom} ${p.nom}` : (p.denomination || '');
        activite = p.activite || p.libelleCodeAPE || '';
        naf_code = p.codeAPE || p.codeNaf || '';
      }
    } catch(e) {}

    // Extraire activité depuis listeetablissements si vide
    if (!activite) {
      try {
        const le = r.listeetablissements;
        const etabs = typeof le === 'string' ? JSON.parse(le) : le;
        if (Array.isArray(etabs) && etabs.length > 0) {
          activite = etabs[0].activite || etabs[0].libelleActivitePrincipale || '';
          naf_code = etabs[0].codeAPE || etabs[0].codeNaf || naf_code;
        }
      } catch(e) {}
    }

    return {
      siren,
      nom: r.commercant || nom_dirigeant || '',
      nom_dirigeant,
      activite: activite || r.familleavis_lib || '',
      naf_code,
      adresse: '',
      ville: r.ville || '',
      code_postal: r.cp || '',
      departement: r.numerodepartement || '',
      region: r.region_nom_officiel || '',
      date_parution: r.dateparution || '',
      registre: r.registre || '',
      type_famille: r.familleavis || '',
      // Enrichissement auto
      type_activite: this._classifierActivite(activite),
      slug_ville: this._toSlug(r.ville || ''),
      _raw: r,
    };
  },

  // ── Classification automatique ────────────────────────────
  _classifierActivite(activite) {
    if (!activite) return 'local';
    const a = activite.toLowerCase();
    if (/(logiciel|informatique|numérique|web|digital|seo|marketing digital|ia |intelligence artificielle)/i.test(a)) return 'digital';
    if (/(conseil|consulting|management|stratégie|audit|formation professionnelle)/i.test(a)) return 'national';
    if (/(transport|déménagement|logistique|fret|messagerie)/i.test(a)) return 'regional';
    if (/(immobilier|agence immobilière|promotion immobilière|marchand de biens)/i.test(a)) return 'regional';
    return 'local';
  },

  _toSlug(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  },

  genererSlug(record) {
    return `${this._toSlug(record.nom)}-${this._toSlug(record.ville)}-${record.departement}`.slice(0, 80);
  },

  toSupabaseEntreprise(record) {
    return {
      siren:           record.siren,
      nom:             record.nom,
      naf_code:        record.naf_code,
      naf_libelle:     record.activite,
      ville:           record.ville,
      code_postal:     record.code_postal,
      departement:     record.departement,
      region:          record.region,
      date_immat:      record.date_parution,
      source:          'BODACC',
      type_entreprise: record.type_activite,
      pipeline_statut: 'nouveau',
    };
  },

  async ping() {
    try {
      const res = await fetch(`${this.BASE_URL}?limit=1`);
      return res.ok;
    } catch { return false; }
  },
};

window.BODACC = BODACC;
