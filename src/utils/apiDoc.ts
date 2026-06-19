/** Serializa registros Prisma al formato que espera el cliente Flutter (compat Mongo). */
export function toApiDoc<T extends Record<string, unknown>>(row: T): T & { _id: string } {
  const id = row.id as string | undefined;
  const out = { ...row, _id: id ?? (row._id as string) } as T & { _id: string };
  return out;
}

export function omitPassword<T extends { password?: string }>(user: T): Omit<T, 'password'> {
  const { password: _p, ...rest } = user;
  return rest;
}
