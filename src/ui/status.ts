import type { Projection } from '../domain/projector.js';

export function statusText(
  projection: Projection,
  shortcut: string,
): string | undefined {
  if (projection.active === 0 && projection.recent === 0) {
    return undefined;
  }

  const parts = [
    projection.active > 0 ? `${projection.active} active` : '',
    projection.recent > 0 ? `${projection.recent} done` : '',
  ].filter(Boolean);
  return `subagents: ${parts.join(' · ')} · ${shortcut
    .split('+')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join('+')}`;
}
