export async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${init?.method ?? 'GET'} ${url} -> ${response.status} ${body}`);
  }
  return response.json() as Promise<T>;
}

export const jsonHeaders = { 'Content-Type': 'application/json' };
