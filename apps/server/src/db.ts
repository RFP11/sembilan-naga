import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function createDb(url: string | undefined): Sql | undefined {
  return url ? postgres(url, { max: 10 }) : undefined;
}
