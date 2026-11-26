// Pedido HTTP con timeout y error claro si la respuesta no es exitosa.
export const TIMEOUT_MS = 30000;

export async function pedir(fetch, url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al pedir ${url}`);
  }
  return res;
}
