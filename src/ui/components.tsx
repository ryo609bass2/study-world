import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Balance } from '../building/catalog.ts';
import { resources } from '../building/catalog.ts';

export function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const currentClose = useRef(close);
  currentClose.current = close;
  useEffect(() => {
    const previous = document.activeElement;
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className={wide ? 'panel wide' : 'panel'} aria-label={title}
    onCancel={e => { e.preventDefault(); currentClose.current(); }}>
    <header className="panel-header"><h2>{title}</h2><button className="subtle close" onClick={close} aria-label="閉じる">×</button></header>
    <div className="panel-body">{children}</div>
  </dialog>;
}

const icons = { coin: '●', wood: '▰', stone: '◆' } as const;
export function ResourceBar({ value, positive = false }: { value: Partial<Balance>; positive?: boolean }) {
  return <div className="resource-bar">{Object.entries(resources).map(([key, label]) => {
    const id = key as keyof Balance;
    if (value[id] === undefined) return null;
    return <span className={'resource ' + id} key={id}><i aria-hidden="true">{icons[id]}</i><span>{label}</span><b>{positive ? '+' : ''}{value[id]}</b></span>;
  })}</div>;
}

export const buttonClass = 'button primary';
