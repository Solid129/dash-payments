import { API_BASE_URL } from '@/lib/api-client';
import type { PayoutStatus } from '@/types/api';

/**
 * Points straight at the API's export endpoint rather than fetching a blob
 * client-side. A plain `<a href download>` is a normal top-level GET
 * navigation, so the browser attaches the httpOnly session cookie the same
 * way it would for any other request to this origin — no CORS-with-credentials
 * or blob-URL plumbing needed, and the API's `Content-Disposition` header is
 * what turns the navigation into a download instead of leaving the page.
 */
export function buildPayoutsExportUrl(status?: PayoutStatus): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const query = params.toString();
  return `${API_BASE_URL}/payouts/export${query ? `?${query}` : ''}`;
}
