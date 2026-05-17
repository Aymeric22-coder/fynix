/**
 * Traduit les messages d'erreur Supabase Auth en francais.
 * Reste tolerant : si le message ne matche aucun pattern, on renvoie
 * le message d'origine plutot que de masquer l'erreur.
 */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase()

  if (m.includes('invalid login credentials') || m.includes('invalid email or password')) {
    return 'Email ou mot de passe incorrect.'
  }
  if (m.includes('email not confirmed')) {
    return 'Adresse non confirmee. Verifie ta boite mail.'
  }
  if (m.includes('user already registered') || m.includes('already registered')) {
    return 'Un compte existe deja avec cette adresse. Connecte-toi.'
  }
  if (m.includes('password should be at least')) {
    return 'Mot de passe trop court (minimum 6 caracteres).'
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Trop de tentatives. Reessaie dans quelques minutes.'
  }
  if (m.includes('email rate limit')) {
    return 'Limite d’envoi d’emails atteinte. Reessaie plus tard.'
  }
  if (m.includes('invalid email') || m.includes('email address is invalid')) {
    return 'Adresse email invalide.'
  }
  if (m.includes('signup is disabled') || m.includes('signups not allowed')) {
    return 'Les inscriptions sont temporairement desactivees.'
  }
  if (m.includes('user not found')) {
    return 'Aucun compte trouve pour cette adresse.'
  }
  if (m.includes('weak password') || m.includes('password is weak')) {
    return 'Mot de passe trop faible.'
  }

  return message
}
