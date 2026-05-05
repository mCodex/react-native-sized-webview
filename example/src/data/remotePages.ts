/**
 * Catalogue of public websites used by the {@link RemoteSitePicker} demo to
 * exercise the auto-sizing pipeline against real-world CMS pages.
 */

export interface RemotePage {
  readonly id: string;
  readonly label: string;
  readonly uri: string;
}

export const REMOTE_PAGES: readonly RemotePage[] = [
  { id: 'marvel', label: 'Marvel', uri: 'https://www.marvel.com/' },
  { id: 'nfl', label: 'NFL', uri: 'https://www.nfl.com/' },
  {
    id: 'google',
    label: 'Google',
    uri: 'https://www.google.com/search?q=marvel+studios',
  },
  {
    id: 'wikipedia',
    label: 'Wikipedia',
    uri: 'https://en.wikipedia.org/wiki/Marvel_Cinematic_Universe',
  },
  { id: 'verge', label: 'The Verge', uri: 'https://www.theverge.com/tech' },
] as const;

export const DEFAULT_REMOTE_PAGE_ID: RemotePage['id'] =
  REMOTE_PAGES[0]?.id ?? 'marvel';
