-- ============================================================
-- VISIBLEO — Schéma Supabase complet
-- Agent 1 — Architecte Données
-- ============================================================

-- Extension UUID
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE : entreprises
-- Source : BODACC / RNE. Données publiques uniquement.
-- ============================================================
create table entreprises (
  id              uuid primary key default uuid_generate_v4(),
  siren           varchar(9) unique not null,
  siret           varchar(14),
  nom             text not null,
  forme_juridique text,                        -- EI, SARL, SAS, EURL...
  naf_code        varchar(6),                  -- ex: 4322A
  naf_libelle     text,                        -- ex: Travaux de plomberie
  adresse         text,
  ville           text,
  code_postal     varchar(5),
  departement     varchar(3),                  -- ex: 49, 69, 75
  region          text,                        -- ex: Pays de la Loire
  nom_dirigeant   text,
  email_contact   text,                        -- récupéré si disponible
  telephone       text,
  date_immat      date,
  source          text default 'BODACC',
  -- Classification automatique (remplie par Claude API)
  type_entreprise text default 'local',        -- local | regional | national | digital
  -- Statut pipeline
  pipeline_statut text default 'nouveau',      -- nouveau | email_envoye | relance | paye | inactif
  email_envoye_at timestamptz,
  relance_at      timestamptz,
  created_at      timestamptz default now()
);

-- Index performance
create index idx_entreprises_siren       on entreprises(siren);
create index idx_entreprises_ville       on entreprises(ville);
create index idx_entreprises_naf         on entreprises(naf_code);
create index idx_entreprises_dept        on entreprises(departement);
create index idx_entreprises_statut      on entreprises(pipeline_statut);
create index idx_entreprises_type        on entreprises(type_entreprise);
create index idx_entreprises_created     on entreprises(created_at desc);

-- ============================================================
-- TABLE : fiches
-- La fiche publique visible sur visibleo.fr
-- ============================================================
create table fiches (
  id              uuid primary key default uuid_generate_v4(),
  entreprise_id   uuid not null references entreprises(id) on delete cascade,
  slug            text unique not null,        -- ex: martin-plomberie-saumur-49
  -- Contenu généré par Claude
  description_seo text,
  description_courte text,                     -- ~150 chars pour les cards
  services        text[],                      -- ex: ['Plomberie', 'Chauffage', 'Urgences 24h']
  mots_cles       text[],                      -- pour le SEO
  -- Contenu rempli par le client
  site_web        text,
  email_public    text,
  telephone_public text,
  horaires        jsonb,                       -- {lun: '8h-18h', mar: '8h-18h', ...}
  zone_intervention text,                      -- texte libre : "Saumur et 30km alentours"
  photo_principale text,                       -- URL
  photos          text[],                      -- galerie
  logo_url        text,
  -- Statut & boost
  statut          text default 'draft',        -- draft | active | suspendu
  boost_niveau    text default 'aucun',        -- aucun | ville | departement | region | multi_region | national
  boost_zones     text[],                      -- ex: ['49', 'Pays de la Loire']
  boost_actif_at  timestamptz,
  boost_expire_at timestamptz,
  -- Métriques (mises à jour quotidiennement)
  nb_vues         integer default 0,
  nb_contacts     integer default 0,
  nb_avis         integer default 0,
  note_moyenne    numeric(2,1) default 0,
  -- SEO
  meta_title      text,
  meta_desc       text,
  -- Dates
  activated_at    timestamptz,
  updated_at      timestamptz default now(),
  created_at      timestamptz default now()
);

create index idx_fiches_slug        on fiches(slug);
create index idx_fiches_statut      on fiches(statut);
create index idx_fiches_boost       on fiches(boost_niveau);
create index idx_fiches_entreprise  on fiches(entreprise_id);

-- ============================================================
-- TABLE : paiements
-- Stripe webhooks écrits ici
-- ============================================================
create table paiements (
  id                  uuid primary key default uuid_generate_v4(),
  entreprise_id       uuid not null references entreprises(id),
  stripe_session_id   text unique,
  stripe_customer_id  text,
  stripe_subscription_id text,
  montant             integer not null,        -- en centimes (13900 = 139€)
  devise              text default 'EUR',
  type_paiement       text not null,           -- activation | boost_ville | boost_dept | boost_region | boost_multi | boost_national
  statut              text default 'pending',  -- pending | paid | failed | refunded | cancelled
  periode_debut       date,                    -- pour les abonnements
  periode_fin         date,
  metadata            jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index idx_paiements_entreprise on paiements(entreprise_id);
create index idx_paiements_statut     on paiements(statut);
create index idx_paiements_stripe     on paiements(stripe_session_id);

-- ============================================================
-- TABLE : avis
-- Avis clients déposés sur les fiches
-- ============================================================
create table avis (
  id            uuid primary key default uuid_generate_v4(),
  fiche_id      uuid not null references fiches(id) on delete cascade,
  auteur_nom    text not null,
  note          integer check (note between 1 and 5),
  commentaire   text,
  statut        text default 'en_attente',     -- en_attente | approuve | rejete
  verifie       boolean default false,
  created_at    timestamptz default now()
);

create index idx_avis_fiche  on avis(fiche_id);
create index idx_avis_statut on avis(statut);

-- ============================================================
-- TABLE : contacts
-- Leads générés via les fiches (formulaire de contact)
-- ============================================================
create table contacts (
  id            uuid primary key default uuid_generate_v4(),
  fiche_id      uuid not null references fiches(id),
  entreprise_id uuid not null references entreprises(id),
  nom_demandeur text,
  email_demandeur text,
  tel_demandeur text,
  message       text,
  statut        text default 'nouveau',        -- nouveau | lu | traite
  created_at    timestamptz default now()
);

-- ============================================================
-- TABLE : emails_log
-- Historique de tous les emails envoyés (Brevo)
-- ============================================================
create table emails_log (
  id              uuid primary key default uuid_generate_v4(),
  entreprise_id   uuid references entreprises(id),
  type_email      text,                        -- activation | relance_j7 | relance_j14 | welcome | boost_offer
  brevo_message_id text,
  destinataire    text,
  sujet           text,
  statut          text default 'envoye',       -- envoye | ouvert | clique | bounced | spam
  opened_at       timestamptz,
  clicked_at      timestamptz,
  created_at      timestamptz default now()
);

create index idx_emails_entreprise on emails_log(entreprise_id);
create index idx_emails_type       on emails_log(type_email);

-- ============================================================
-- TABLE : naf_reference
-- Table de référence NAF pour la classification automatique
-- ============================================================
create table naf_reference (
  code          varchar(6) primary key,
  libelle       text not null,
  type_activite text not null,   -- local | regional | national | digital
  secteur_label text,            -- ex: "Plomberie & Chauffage"
  email_template text,           -- template Brevo à utiliser
  boost_recommande text          -- ville | departement | region | national
);

-- ============================================================
-- DONNÉES : naf_reference (codes principaux)
-- ============================================================
insert into naf_reference values
-- Artisans & services locaux → boost ville/département
('4322A', 'Travaux de plomberie', 'local', 'Plomberie & Chauffage', 'artisan_local', 'departement'),
('4322B', 'Travaux installation gaz', 'local', 'Plomberie & Chauffage', 'artisan_local', 'departement'),
('4321A', 'Travaux d''installation électrique', 'local', 'Électricité', 'artisan_local', 'departement'),
('4399C', 'Travaux de maçonnerie', 'local', 'BTP', 'artisan_local', 'departement'),
('4120A', 'Construction maisons individuelles', 'local', 'Construction', 'artisan_local', 'region'),
('4120B', 'Construction bâtiments divers', 'local', 'Construction', 'artisan_local', 'region'),
('4331Z', 'Travaux de plâtrerie', 'local', 'BTP', 'artisan_local', 'departement'),
('4332A', 'Menuiserie bois', 'local', 'BTP', 'artisan_local', 'departement'),
('4334Z', 'Peinture et vitrerie', 'local', 'BTP', 'artisan_local', 'departement'),
('4391A', 'Couverture charpente', 'local', 'BTP', 'artisan_local', 'departement'),
-- Commerces & restauration → boost ville
('5610A', 'Restauration traditionnelle', 'local', 'Restauration', 'commerce_local', 'ville'),
('5610C', 'Restauration rapide', 'local', 'Restauration', 'commerce_local', 'ville'),
('4711B', 'Commerce alimentaire', 'local', 'Commerce', 'commerce_local', 'ville'),
('4719A', 'Commerces divers', 'local', 'Commerce', 'commerce_local', 'ville'),
('4776Z', 'Commerce fleurs', 'local', 'Commerce', 'commerce_local', 'ville'),
-- Beauté & bien-être → boost ville
('9602A', 'Coiffure', 'local', 'Beauté & Bien-être', 'beaute_local', 'ville'),
('9602B', 'Soins de beauté', 'local', 'Beauté & Bien-être', 'beaute_local', 'ville'),
('9604Z', 'Entretien corporel', 'local', 'Beauté & Bien-être', 'beaute_local', 'ville'),
-- Transport & déménagement → boost région
('4941A', 'Transports routiers de fret', 'regional', 'Transport', 'transport_regional', 'region'),
('4941B', 'Transports routiers de fret', 'regional', 'Transport', 'transport_regional', 'region'),
('4942Z', 'Déménagement', 'regional', 'Déménagement', 'transport_regional', 'region'),
-- Auto → boost département/région
('4511Z', 'Commerce automobiles', 'regional', 'Automobile', 'auto_regional', 'region'),
('4520A', 'Entretien réparation automobiles', 'local', 'Automobile', 'auto_local', 'departement'),
-- Immobilier → boost région
('6810Z', 'Marchands de biens', 'regional', 'Immobilier', 'immo_regional', 'region'),
('6820A', 'Location logements', 'regional', 'Immobilier', 'immo_regional', 'region'),
('6831Z', 'Agences immobilières', 'regional', 'Immobilier', 'immo_regional', 'region'),
-- Santé → boost ville/département
('8621Z', 'Médecine générale', 'local', 'Santé', 'sante_local', 'ville'),
('8622A', 'Chirurgie', 'local', 'Santé', 'sante_local', 'departement'),
('8690D', 'Activités paramédicales', 'local', 'Santé', 'sante_local', 'ville'),
-- Conseil & digital → boost national
('7022Z', 'Conseil de gestion', 'national', 'Conseil', 'conseil_national', 'national'),
('6920Z', 'Comptabilité', 'local', 'Comptabilité', 'compta_local', 'departement'),
('6910Z', 'Activités juridiques', 'local', 'Juridique', 'juridique_local', 'departement'),
('6201Z', 'Programmation informatique', 'digital', 'Digital & Tech', 'digital_national', 'national'),
('6202A', 'Conseil en systèmes informatiques', 'digital', 'Digital & Tech', 'digital_national', 'national'),
('7311Z', 'Publicité', 'digital', 'Marketing', 'digital_national', 'national'),
('7312Z', 'Régie publicitaire', 'digital', 'Marketing', 'digital_national', 'national'),
('7320Z', 'Études de marché', 'digital', 'Conseil', 'conseil_national', 'national'),
-- Formation
('8559A', 'Formation continue', 'regional', 'Formation', 'formation_regional', 'region'),
('8559B', 'Autres formations', 'regional', 'Formation', 'formation_regional', 'region');

-- ============================================================
-- TABLE : baremes_boost
-- Grille tarifaire officielle
-- ============================================================
create table baremes_boost (
  id          serial primary key,
  code        text unique not null,
  libelle     text not null,
  description text,
  prix_mois   numeric(8,2) not null,
  prix_annuel numeric(8,2),                   -- avec remise 2 mois
  rayonnement text,                            -- description géographique
  types_cibles text[],                         -- local | regional | national | digital
  stripe_price_id text                         -- à remplir après création dans Stripe
);

insert into baremes_boost values
(1, 'activation',    'Activation fiche',       'Publication de la fiche + espace propriétaire. Paiement unique.', 139.00, null,   'Fiche publiée',                   ARRAY['local','regional','national','digital'], null),
(2, 'boost_ville',   'Boost Ville',            'Apparaître en tête de liste dans votre ville',                    19.99,  199.00, '1 ville / commune',               ARRAY['local'],                                null),
(3, 'boost_dept',    'Boost Département',      'Visibilité prioritaire sur tout votre département',               34.99,  349.00, '1 département (ex: Maine-et-Loire)',ARRAY['local','regional'],                    null),
(4, 'boost_region',  'Boost Région',           'Rayonnement sur toute une région administrative',                 59.99,  599.00, '1 région (ex: Pays de la Loire)', ARRAY['regional'],                             null),
(5, 'boost_multi',   'Boost Multi-régions',    'Couvrez 2 à 3 régions',                                          89.99,  899.00, '2 à 3 régions au choix',          ARRAY['regional','national'],                  null),
(6, 'boost_national','Boost National',         'Visibilité sur l''ensemble du territoire français',               149.00, 1490.00,'France entière',                  ARRAY['national','digital'],                   null);

-- ============================================================
-- VUE : pipeline_dashboard
-- Pour le back-office admin
-- ============================================================
create or replace view pipeline_dashboard as
select
  e.id,
  e.siren,
  e.nom,
  e.ville,
  e.departement,
  e.naf_libelle,
  e.type_entreprise,
  e.pipeline_statut,
  e.email_envoye_at,
  e.created_at,
  f.statut          as fiche_statut,
  f.boost_niveau,
  f.nb_vues,
  f.nb_contacts,
  p.montant         as dernier_paiement,
  p.statut          as paiement_statut
from entreprises e
left join fiches f on f.entreprise_id = e.id
left join paiements p on p.entreprise_id = e.id and p.statut = 'paid'
order by e.created_at desc;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table entreprises   enable row level security;
alter table fiches        enable row level security;
alter table paiements     enable row level security;
alter table avis          enable row level security;
alter table contacts      enable row level security;
alter table emails_log    enable row level security;

-- Fiches actives : lecture publique (pour l'annuaire)
create policy "fiches_publiques" on fiches
  for select using (statut = 'active');

-- Avis approuvés : lecture publique
create policy "avis_publics" on avis
  for select using (statut = 'approuve');

-- Admin (service_role) : accès total
-- (géré via la clé service_role Supabase côté Make.com / back-office)

-- ============================================================
-- FONCTION : update_updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger fiches_updated_at before update on fiches
  for each row execute function update_updated_at();

create trigger paiements_updated_at before update on paiements
  for each row execute function update_updated_at();

-- ============================================================
-- FONCTION : recalc_note_fiche
-- Recalcule la note moyenne après chaque avis approuvé
-- ============================================================
create or replace function recalc_note_fiche()
returns trigger as $$
begin
  update fiches
  set
    note_moyenne = (select avg(note) from avis where fiche_id = new.fiche_id and statut = 'approuve'),
    nb_avis      = (select count(*) from avis where fiche_id = new.fiche_id and statut = 'approuve')
  where id = new.fiche_id;
  return new;
end;
$$ language plpgsql;

create trigger avis_note_update after insert or update on avis
  for each row when (new.statut = 'approuve')
  execute function recalc_note_fiche();
