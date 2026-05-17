-- =============================================================
-- Migration 017 — Acquisitions immobilieres futures simulees
-- =============================================================
--
-- Persiste les acquisitions futures simulees dans la projection FIRE
-- (auparavant en state React local, perdues a chaque navigation).
--
-- Les noms de colonnes alignent strictement le type TS `AcquisitionFuture`
-- (fynix/types/analyse.ts) pour eviter une couche de mapping. Tout ce
-- qui n'est pas en DB est genere cote application (mensualite PMT,
-- cashflow, rendement, etc.).
--
-- Le `type` accepte 'locatif' (cashflow + amortissement) ou 'RP'
-- (residence principale : pas de loyer, le credit est un cout pur).
--
-- RLS : un user ne voit/edite que ses propres lignes.
-- =============================================================

CREATE TABLE IF NOT EXISTS future_acquisitions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  nom                        TEXT          NOT NULL DEFAULT 'Nouvelle acquisition',
  dans_combien_annees        INTEGER       NOT NULL DEFAULT 3   CHECK (dans_combien_annees >= 0 AND dans_combien_annees <= 50),

  prix_achat                 NUMERIC(14,2) NOT NULL DEFAULT 0   CHECK (prix_achat >= 0),
  frais_notaire_pct          NUMERIC(5,2)  NOT NULL DEFAULT 8   CHECK (frais_notaire_pct >= 0 AND frais_notaire_pct <= 30),
  apport                     NUMERIC(14,2) NOT NULL DEFAULT 0   CHECK (apport >= 0),

  taux_interet               NUMERIC(5,2)  NOT NULL DEFAULT 3.5 CHECK (taux_interet >= 0 AND taux_interet <= 25),
  duree_credit_ans           INTEGER       NOT NULL DEFAULT 20  CHECK (duree_credit_ans > 0 AND duree_credit_ans <= 40),

  type                       TEXT          NOT NULL DEFAULT 'locatif' CHECK (type IN ('locatif','RP')),
  loyer_brut_mensuel         NUMERIC(12,2) NOT NULL DEFAULT 0   CHECK (loyer_brut_mensuel >= 0),
  taux_vacance_pct           NUMERIC(5,2)  NOT NULL DEFAULT 5   CHECK (taux_vacance_pct >= 0 AND taux_vacance_pct <= 100),
  charges_mensuelles         NUMERIC(12,2) NOT NULL DEFAULT 0   CHECK (charges_mensuelles >= 0),

  appreciation_annuelle_pct  NUMERIC(5,2)  NOT NULL DEFAULT 2   CHECK (appreciation_annuelle_pct >= -10 AND appreciation_annuelle_pct <= 15),

  created_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_future_acquisitions_user
  ON future_acquisitions (user_id, dans_combien_annees);

-- Trigger : updated_at = NOW() a chaque UPDATE
CREATE OR REPLACE FUNCTION set_future_acquisitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_future_acquisitions_updated_at ON future_acquisitions;
CREATE TRIGGER trg_future_acquisitions_updated_at
  BEFORE UPDATE ON future_acquisitions
  FOR EACH ROW EXECUTE FUNCTION set_future_acquisitions_updated_at();

-- RLS
ALTER TABLE future_acquisitions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "future_acquisitions_select" ON future_acquisitions
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "future_acquisitions_insert" ON future_acquisitions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "future_acquisitions_update" ON future_acquisitions
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "future_acquisitions_delete" ON future_acquisitions
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Realtime : activer la replication pour cette table
ALTER PUBLICATION supabase_realtime ADD TABLE future_acquisitions;
