-- =============================================================================
-- FIRECORE — Migration 030 : Persistance des recommandations marquées "Fait"
-- =============================================================================
-- Le bouton « ✓ Fait » sur les cartes Recommandations (onglet Optimiser
-- d'/analyse) était en state session local — perdu au rechargement.
-- Cette table stocke pour chaque utilisateur les `reco_key` qu'il a
-- marquées comme faites, avec horodatage et possibilité d'annulation
-- (`undone_at`). UNIQUE (user_id, reco_key) garantit qu'une reco n'est
-- présente qu'une fois par user — re-marquer "Fait" met juste à jour
-- `undone_at = NULL`.
-- =============================================================================

CREATE TABLE recos_done (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- clé stable identifiant la reco (ex: 'rebalance:Actions:ETF / Fonds',
  -- 'fiscal:opp-pea-ouverture', 'invest_cash:livret_a'). Générée côté
  -- lib/analyse/recoMensuelles.ts pour rester déterministe entre rechargements.
  reco_key    text NOT NULL,
  done_at     timestamptz NOT NULL DEFAULT now(),
  undone_at   timestamptz,   -- null = toujours considéré "fait"

  UNIQUE (user_id, reco_key)
);

CREATE INDEX idx_recos_done_user_active
  ON recos_done (user_id)
  WHERE undone_at IS NULL;

ALTER TABLE recos_done ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_select" ON recos_done
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_insert" ON recos_done
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_update" ON recos_done
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_delete" ON recos_done
  FOR DELETE USING (auth.uid() = user_id);
