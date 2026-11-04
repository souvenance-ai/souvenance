/**
 * The skills doors (#82): `GET /skills` — the index, every skill's name
 * and description, the start skill first; `GET /skills/{name}` — one
 * skill's body, the SKILL.md served verbatim: an installation is a copy,
 * never a transform. Public doors — the /healthz and /doc family: a skill
 * teaches the product's grammar to whoever asks; it reaches no
 * individual's data. The data surface is nameless and top-level
 * (ADR 0007) — these doors extend the doors family, they never re-open a
 * name-in-path grammar.
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import type { ServerEnv } from '../auth/auth.ts';
import type { Skills } from '../skills/skills.ts';
import { SkillsIndexSchema, refusal } from '../wire/wire.ts';

export function registerSkillRoutes(
  app: OpenAPIHono<ServerEnv>,
  skills: Skills,
  version: string,
): void {
  const index = createRoute({
    method: 'get',
    path: '/skills',
    summary: 'the skills index',
    description:
      "Every skill's name and description, the start skill first — the orientation " +
      "surface, served publicly: a skill teaches the product's grammar to whoever asks; " +
      "it reaches no individual's data.",
    tags: ['skills'],
    responses: {
      200: {
        description: 'the index — every skill’s name and description, the start skill first',
        content: { 'application/json': { schema: SkillsIndexSchema } },
      },
    },
  });
  app.openapi(index, (c) => c.json({ version, skills: skills.index() }, 200));

  const item = createRoute({
    method: 'get',
    path: '/skills/{name}',
    summary: 'read a skill',
    description:
      "One skill's body — served verbatim: an installation is a copy, never a transform. " +
      '404 teaches the way back: the index serves at /skills.',
    tags: ['skills'],
    request: {
      params: z.object({ name: z.string().describe("the skill's name — the index serves it") }),
    },
    responses: {
      200: {
        description: 'the skill’s body — the SKILL.md served verbatim, an installation is a copy',
        content: { 'text/markdown': { schema: z.string() } },
      },
      404: refusal('no such skill — the index serves at /skills'),
    },
  });
  app.openapi(item, (c) => {
    const { name } = c.req.valid('param');
    const body = skills.item(name);
    if (body === undefined) {
      throw new HTTPException(404, { message: 'no such skill — the index serves at /skills' });
    }
    return c.body(body, 200, { 'Content-Type': 'text/markdown; charset=utf-8' });
  });
}
