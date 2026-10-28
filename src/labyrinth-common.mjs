export const clone = (value) => structuredClone(value);
export const sorted = (values) => [...new Set(values)].sort();
export const isText = (value) => typeof value === 'string' && value.trim().length > 0;
export function requireText(value, label) {
  if (!isText(value)) throw new Error(`${label} must be non-empty`);
}
export function strings(value, label, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && !value.length) || !value.every(isText)) {
    throw new Error(`${label} must be ${nonempty ? 'a nonempty' : 'an'} array of strings`);
  }
  return sorted(value);
}
export function validateBoundary(boundary = {}) {
  const allow = strings(boundary.allow ?? [], 'boundary.allow');
  const deny = strings(boundary.deny ?? [], 'boundary.deny');
  if (allow.some(x => deny.includes(x))) throw new Error('boundary allow/deny conflict');
  return { allow, deny };
}
export function validateGoal({ id, outcome, acceptance, boundary = {} }) {
  requireText(id, 'goal id'); requireText(outcome, 'goal outcome');
  return { id, outcome, acceptance: strings(acceptance, 'acceptance', true), boundary: validateBoundary(boundary) };
}
