import type { Queryable, RowDataPacket } from '../db/pool.js';
import { notFound } from '../http/errors.js';

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  questionCount: number;
}

/** Slugs acceptés pour "toutes les catégories". */
export const ALL_CATEGORIES_SLUGS = new Set(['all', 'mixed']);

export async function listCategories(db: Queryable): Promise<Category[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT c.id, c.slug, c.name, c.description, c.icon, c.color, COUNT(q.id) AS question_count
       FROM categories c
       LEFT JOIN questions q ON q.category_id = c.id AND q.is_active = TRUE
      GROUP BY c.id
      ORDER BY c.sort_order, c.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    icon: r.icon,
    color: r.color,
    questionCount: Number(r.question_count),
  }));
}

/** Retourne l'id de la catégorie, ou null pour "toutes les catégories". */
export async function resolveCategory(
  db: Queryable,
  slug: string,
): Promise<{ id: number; name: string } | null> {
  if (ALL_CATEGORIES_SLUGS.has(slug)) return null;
  const [rows] = await db.execute<RowDataPacket[]>('SELECT id, name FROM categories WHERE slug = ?', [slug]);
  const row = rows[0];
  if (!row) throw notFound('CATEGORY_NOT_FOUND', 'Catégorie inconnue.');
  return { id: row.id, name: row.name };
}

/** Tire `count` questions actives au hasard (dans une catégorie ou dans toutes). */
export async function pickRandomQuestionIds(
  db: Queryable,
  categoryId: number | null,
  count: number,
): Promise<number[]> {
  // LIMIT ne peut pas être un paramètre lié avec execute() : valeur entière contrôlée.
  const limit = Math.max(1, Math.min(50, Math.trunc(count)));
  const [rows] =
    categoryId === null
      ? await db.query<RowDataPacket[]>(
          `SELECT id FROM questions WHERE is_active = TRUE ORDER BY RAND() LIMIT ${limit}`,
        )
      : await db.query<RowDataPacket[]>(
          `SELECT id FROM questions WHERE is_active = TRUE AND category_id = ? ORDER BY RAND() LIMIT ${limit}`,
          [categoryId],
        );
  return rows.map((r) => Number(r.id));
}
