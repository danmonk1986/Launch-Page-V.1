/**
 * V20-449 (Dan, Nov 21): a half-typed Add task survives clicking off / closing / refresh.
 * Kept on this browser only, per account, until it's saved or CLEARed.
 */
let draftUser = '';
/** App sets the signed-in account each render so two accounts on one browser never share a draft. */
export function setDraftUser(id: string | null | undefined) {
  draftUser = id ?? '';
}
const keyOf = (name: string) => (draftUser ? `lp.draft.${name}.${draftUser}` : '');

export function readDraft<T>(name: string): T | null {
  const k = keyOf(name);
  if (!k) return null;
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function writeDraft(name: string, value: unknown) {
  const k = keyOf(name);
  if (!k) return;
  try {
    localStorage.setItem(k, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the form still works, just without a draft */
  }
}
export function clearDraft(name: string) {
  const k = keyOf(name);
  if (!k) return;
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
