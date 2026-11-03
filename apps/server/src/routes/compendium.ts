import type { MonsterSummary } from "@dnd/contracts";
import { spells } from "@dnd/data";
import { monsters } from "@dnd/data/monsters";
import type { FastifyPluginAsync } from "fastify";

export const compendiumRoutes: FastifyPluginAsync = async (app) => {
  const monsterList: MonsterSummary[] = monsters.map((m) => ({
    id: m.id,
    name: m.name,
    size: m.size,
    type: m.type,
    ac: m.ac,
    hp: m.hp.average,
  }));

  app.get("/spells", async () => spells);
  app.get("/monsters", async () => monsterList);
  app.get<{ Params: { id: string } }>("/monsters/:id", async (req, reply) => {
    const monster = monsters.find((m) => m.id === req.params.id);
    if (!monster) return reply.code(404).send({ error: "not found" });
    return monster;
  });
};
