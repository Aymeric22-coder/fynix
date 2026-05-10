-- =============================================================
-- Migration 008 — Policies INSERT/UPDATE sur instruments
-- =============================================================
--
-- La migration 007 a cree une policy SELECT (lecture publique
-- authenticated) sur la table `instruments`, mais pas de policy
-- INSERT. Resultat : le formulaire "Ajouter une position" echoue
-- avec "new row violates row-level security policy".
--
-- Le catalogue `instruments` est partage entre tous les utilisateurs
-- (cf. design Phase 1). N'importe quel user authentifie peut donc
-- enrichir le catalogue en creant un instrument manquant.
--
-- L'UPDATE est aussi autorise pour permettre la reconciliation /
-- mise a jour de metadata (sector, geography, provider_id...).
-- =============================================================

CREATE POLICY "instruments_insert_authenticated"
  ON instruments FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "instruments_update_authenticated"
  ON instruments FOR UPDATE TO authenticated
  USING (TRUE) WITH CHECK (TRUE);
