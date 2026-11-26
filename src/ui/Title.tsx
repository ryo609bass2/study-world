import type { ReactNode } from 'react';

export function Title({ hasSave, blocked, unavailable, island, quick, settings, profiles, resume }: {
  hasSave: boolean; blocked: boolean; unavailable: boolean; island: () => void; quick: () => void;
  settings: () => void; profiles: () => void; resume: ReactNode;
}) {
  return <main className="title-screen">
    <header className="title-header"><span className="brand-mark" aria-hidden="true">▰</span><b>STUDY WORLD</b><button onClick={settings}>設定</button></header>
    <div className="hero">
      <div className="hero-copy"><p className="eyebrow">EXPLORE · LEARN · CREATE</p>
        <h1>STUDY<br /><em>WORLD</em></h1>
        <p className="tagline">学ぶたび、世界が広がる。</p>
        <div className="title-actions">
          <button className="primary" disabled={blocked || unavailable} onClick={island}>{hasSave ? '島の冒険を続ける' : '島の冒険をはじめる'} <span aria-hidden="true">→</span></button>
          <button disabled={blocked} onClick={quick}>学習クイックスタート <span aria-hidden="true">↗</span></button>
          <button className="subtle" onClick={profiles}>プロフィールを選ぶ</button>
          {resume}
        </div>
        {unavailable && <p>この端末ではクイックスタートから採掘クエストを遊べます。</p>}
      </div>
      <div className="hero-art" aria-hidden="true"><div className="hero-sun" /><div className="hero-cloud cloud-a" /><div className="hero-cloud cloud-b" />
        <div className="hero-island"><i className="island-face face-front" /><i className="island-face face-side" /><i className="island-grass" />
          <i className="island-path" /><i className="hero-house" /><i className="hero-roof" /><i className="hero-door" />
          <i className="hero-tree tree-a" /><i className="hero-tree tree-b" /><i className="hero-tree tree-c" />
          <i className="hero-rock" /><i className="hero-chest" /></div><span className="hero-label">マイアイランド</span></div>
    </div>
  </main>;
}
