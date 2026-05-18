/**
 * Setup global Vitest — chargé une fois par worker.
 *
 * Ajoute les matchers @testing-library/jest-dom (toBeInTheDocument, etc.)
 * pour les tests composants React. Sans effet sur les tests `lib/` qui
 * tournent en environnement `node`.
 */
import '@testing-library/jest-dom/vitest'
