/** Retourne l'erreur levée par une fonction (échoue si aucune erreur n'est levée). */
export function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Une erreur était attendue mais aucune n’a été levée.');
}

/** Retourne l'erreur de rejet d'une promesse (échoue si la promesse est résolue). */
export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Un rejet était attendu mais la promesse a été résolue.');
}
