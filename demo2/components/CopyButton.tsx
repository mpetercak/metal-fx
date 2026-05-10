import React, { useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from './icons';

function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

export function CopyButton({ getText }: { getText: () => string }) {
  const [state, setState] = useState<'a' | 'b'>('a');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleClick = () => {
    copyToClipboard(getText());
    setState('b');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState('a'), 2000);
  };

  return (
    <button className="copy-btn" type="button" data-state={state} onClick={handleClick} aria-label="Copy">
      <span className="t-icon" data-icon="a"><CopyIcon /></span>
      <span className="t-icon" data-icon="b"><CheckIcon /></span>
    </button>
  );
}
