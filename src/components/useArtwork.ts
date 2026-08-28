import { useEffect, useState } from 'react';
import type { Track } from '../types';
import { fileFor, hasSource } from '../lib/library/fileSource';
import { loadArtwork } from '../lib/library/tags';

/**
 * Cover art for one track, fetched on demand and cached in IndexedDB.
 *
 * Covers are deliberately not read during the library scan — pulling one out of
 * every file would put hundreds of megabytes of images into the browser for
 * artwork nobody looks at.
 */
export function useArtwork(track: Track | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    setUrl(null);
    if (track && hasSource(track.id)) {
      void (async () => {
        try {
          const blob = await loadArtwork(track.id, await fileFor(track.id));
          if (cancelled || !blob) return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        } catch {
          // No cover is a normal outcome, not an error worth showing.
        }
      })();
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [track]);

  return url;
}
