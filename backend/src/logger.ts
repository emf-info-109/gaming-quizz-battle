/**
 * Logger minimaliste : une ligne par événement sur stdout/stderr.
 * Sous systemd, ces lignes sont collectées par journald :
 *   journalctl -u gaming-quiz -f
 */
type Level = 'error' | 'warn' | 'info' | 'debug';
const LEVELS: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface Logger {
  error(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(instanceName: string, level: Level = 'info'): Logger {
  const max = LEVELS[level];
  const write = (lvl: Level, msg: string, meta?: Record<string, unknown>) => {
    if (LEVELS[lvl] > max) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level: lvl,
      instance: instanceName,
      msg,
      ...meta,
    });
    if (lvl === 'error' || lvl === 'warn') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  };
  return {
    error: (m, meta) => write('error', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    info: (m, meta) => write('info', m, meta),
    debug: (m, meta) => write('debug', m, meta),
  };
}

/** Logger silencieux (tests). */
export const silentLogger: Logger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};
