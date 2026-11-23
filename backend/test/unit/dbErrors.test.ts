import { describe, expect, it } from 'vitest';
import { describeDbError } from '../../src/db/dbErrors.js';

const target = { host: '10.0.2.4', port: 3306, database: 'gaming_quiz', user: 'quiz_app' };

describe('describeDbError', () => {
  it.each([
    ['ECONNREFUSED', /bind-address/],
    ['ETIMEDOUT', /pare-feu/],
    ['ER_ACCESS_DENIED_ERROR', /Mot de passe incorrect/],
    ['ER_BAD_DB_ERROR', /CREATE DATABASE gaming_quiz/],
    ['ER_TABLEACCESS_DENIED_ERROR', /GRANT ALL PRIVILEGES/],
  ])('explique %s', (code, pattern) => {
    expect(describeDbError({ code }, target)).toMatch(pattern);
  });
  it('affiche le message brut pour une erreur inconnue', () => {
    expect(describeDbError(new Error('boom'), target)).toBe('Erreur MySQL : boom');
  });
});
