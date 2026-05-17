-- =============================================================
-- Migration 018 — Ajout vacancy_pct sur real_estate_properties
-- =============================================================
--
-- Sprint 1 : permet a l'utilisateur de declarer un taux de vacance
-- locative annuel en pourcentage. La colonne `vacancy_months` (0-12)
-- existante reste en place pour la retro-compat avec le moteur de
-- simulation. `vacancy_pct` est utilisee dans les valeurs par defaut
-- des charges semi-obligatoires (cf. lib/real-estate/defaultCharges.ts)
-- et dans l'estimation du cashflow.
--
-- Defaut conservateur 5 % (≈ 2,5 semaines / an).
-- =============================================================

ALTER TABLE real_estate_properties
  ADD COLUMN IF NOT EXISTS vacancy_pct NUMERIC(5,2)
    NOT NULL DEFAULT 5
    CHECK (vacancy_pct >= 0 AND vacancy_pct <= 100);

COMMENT ON COLUMN real_estate_properties.vacancy_pct IS
  'Taux de vacance locative annuel en %. Defaut 5. Utilise dans le simulateur de cashflow et le calcul de rendement net.';
