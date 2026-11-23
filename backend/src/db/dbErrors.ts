/**
 * Traduit les erreurs de connexion MySQL en messages compréhensibles
 * (utilisés par le script de setup, les logs de démarrage et "db.js check").
 */
export function describeDbError(err: unknown, target?: { host: string; port: number; database: string; user: string }): string {
  const e = err as { code?: string; errno?: number; message?: string };
  const where = target ? `${target.host}:${target.port}` : 'le serveur MySQL';
  switch (e?.code) {
    case 'ECONNREFUSED':
      return `Connexion refusée par ${where}. MySQL est-il démarré ? Écoute-t-il sur le réseau (bind-address = 0.0.0.0) ? Le port est-il le bon ?`;
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Impossible de joindre ${where} (délai dépassé). Vérifie l'adresse IP, le réseau et les règles de pare-feu / NSG (port 3306).`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `Nom d'hôte introuvable : « ${target?.host ?? '?'} ». Utilise plutôt l'adresse IP privée de la VM base de données.`;
    case 'ER_ACCESS_DENIED_ERROR':
      return `Accès refusé pour l'utilisateur « ${target?.user ?? '?'} ». Mot de passe incorrect, ou utilisateur non autorisé depuis cette machine (vérifie le '@...' du CREATE USER).`;
    case 'ER_DBACCESS_DENIED_ERROR':
      return `L'utilisateur « ${target?.user ?? '?'} » n'a pas accès à la base « ${target?.database ?? '?'} ». Il manque : GRANT ALL PRIVILEGES ON ${target?.database ?? 'gaming_quiz'}.* TO ...`;
    case 'ER_BAD_DB_ERROR':
      return `La base « ${target?.database ?? '?'} » n'existe pas. Crée-la d'abord : CREATE DATABASE ${target?.database ?? 'gaming_quiz'};`;
    case 'ER_TABLEACCESS_DENIED_ERROR':
    case 'ER_SPECIFIC_ACCESS_DENIED_ERROR':
      return `L'utilisateur « ${target?.user ?? '?'} » n'a pas le droit de créer des tables. Il faut : GRANT ALL PRIVILEGES ON ${target?.database ?? 'gaming_quiz'}.* TO ...`;
    case 'HANDSHAKE_SSL_ERROR':
    case 'HANDSHAKE_NO_SSL_SUPPORT':
      return 'Problème TLS avec MySQL : vérifie la variable DB_SSL.';
    default:
      return `Erreur MySQL : ${e?.message ?? String(err)}`;
  }
}
