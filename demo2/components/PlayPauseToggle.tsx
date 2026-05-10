import React from 'react';
import { PauseIcon, PlayIcon } from './icons';

export function PlayPauseToggle({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  const state = playing ? 'b' : 'a';
  return (
    <button
      className="playground-play-toggle"
      type="button"
      data-state={state}
      onClick={onToggle}
      aria-pressed={playing}
      aria-label={playing ? 'Pause shader animation' : 'Play shader animation'}
    >
      <span className="t-icon" data-icon="a"><PlayIcon /></span>
      <span className="t-icon" data-icon="b"><PauseIcon /></span>
    </button>
  );
}
