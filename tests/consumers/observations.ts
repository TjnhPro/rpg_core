// Observation utilities only: no numerical calculation or gameplay dispatch.
export function encode(value: unknown): unknown {
  if (value === undefined) return {$number: 'undefined'};
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return {$number: '-0'};
    if (!Number.isFinite(value)) return {$number: String(value)};
  }
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, encode(v)]));
  return value;
}
export function thrown(run: () => unknown, sentinel?: unknown) {
  try { run(); return {name: 'NO_ERROR', message: '', same: false}; }
  catch (error) {return {name: error instanceof Error ? error.name : 'object', message: error instanceof Error ? error.message : '', same: sentinel !== undefined && error === sentinel};}
}
export function frozen(value: unknown): boolean {
  return !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(frozen));
}
export function observation(id: string, inputs: unknown, output: unknown, trace: unknown[], anchors: unknown[]) {
  return {id, inputs: encode(inputs), output: encode(output), trace: encode(trace), anchors: encode(anchors)};
}
