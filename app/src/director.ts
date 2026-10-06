// Picks the edit for this run. v3: a run folder with song.json {"slug": "<slug>"} plays the authored
// timeline in songs/<slug>/timeline.ts (treatment + bespoke plates written for that song). Without it the
// legacy v2 auto director (plan.ts + generic archetypes) runs; it is kept only as a fallback preview.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';
import { plan, type Archetype } from './plan';

export type MakeTimeline = (ly: Lyrics, au: AudioData) => TimelineEntry[];

const modules = import.meta.glob<{ default: SceneClass }>('./archetypes/*.ts');
const load = (a: Archetype) => () => {
  const m = modules[`./archetypes/${a}.ts`];
  return m ? m() : Promise.reject(new Error(`archetype module not found: archetypes/${a}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  return plan(ly, au).map((p, i) => ({
    id: `${String(i).padStart(2, '0')}-${p.archetype}`, load: load(p.archetype), start: p.start, end: p.end,
    params: { ...p.params, archetype: p.archetype, section: p.section, features: p.features },
  }));
}

const songs = import.meta.glob<{ makeTimeline: MakeTimeline }>('./songs/*/timeline.ts');

/** The authored timeline named by run/song.json, else the legacy auto director. Fails loudly on a bad slug. */
export async function resolveTimeline(): Promise<{ make: MakeTimeline; slug: string | null }> {
  const r = await fetch('run/song.json');
  if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return { make: makeTimeline, slug: null };
  const { slug } = (await r.json()) as { slug?: string };
  const mod = slug ? songs[`./songs/${slug}/timeline.ts`] : undefined;
  if (!mod) throw new Error(`run/song.json names "${slug}" but app/src/songs/${slug}/timeline.ts does not exist`);
  return { make: (await mod()).makeTimeline, slug: slug! };
}
