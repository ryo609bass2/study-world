import { buildingIds, catalog, resourceIds, resources } from '../building/catalog.ts';
import type { Building, BuildingId, Placement } from '../building/catalog.ts';
import type { Material } from '../learning/session.ts';
import type { Save } from '../app/state.ts';
import { ResourceBar } from './components.tsx';

export function CraftPanel({ save, busy, craft, buy, buyMaterial, shop }: {
  save: Save; busy: boolean; craft: (id: BuildingId) => void; buy: (id: BuildingId) => void;
  buyMaterial: (id: Material) => void; shop: boolean;
}) {
  const unrestricted = save.progress.firstPlacedBuildingIds.includes('house_small');
  return <div className="form-stack">
    <ResourceBar value={save.economy} />
    {shop && <div className="button-row">{(['wood', 'stone'] as const).map(id =>
      <button key={id} disabled={busy || !unrestricted || save.economy.coin < 5} onClick={() => buyMaterial(id)}>{resources[id]}を1個買う · 5C</button>)}</div>}
    <ul className="catalog">{buildingIds.map(id => {
      const def = catalog[id];
      const unlocked = save.recipes.includes(id);
      const allowTutorial = id === 'house_small' && save.progress.tutorialStep === 'craft' && !shop;
      const cost = shop ? { coin: def.shopPrice, wood: 0, stone: 0 } : def.cost;
      const shortages = resourceIds.filter(resource => cost[resource] > save.economy[resource]);
      const allowed = unlocked && (unrestricted || allowTutorial) && !shortages.length;
      return <li key={id}>
        <span className={'building-icon ' + id} aria-hidden="true">{({ house_small: '⌂', warehouse: '▧', flowerbed: '✿', bench: '▱', stone_path: '▦' })[id]}</span>
        <div><b>{def.name}</b><p>{def.width} × {def.depth} m</p>
          {unlocked ? <><ResourceBar value={shop ? { coin: cost.coin } : cost} />
            {!!shortages.length && <small>不足　{shortages.map(r => resources[r] + (cost[r] - save.economy[r])).join('・')}</small>}</> :
            <small>{id === 'warehouse' ? '家を置いて累計5問を解決すると解放' : '累計5問を解決すると解放'}</small>}</div>
        <button disabled={busy || !allowed} onClick={() => shop ? buy(id) : craft(id)}>{shop ? '買う' : '作る'}<span className="sr-only"> {def.name}</span></button>
      </li>;
    })}</ul>
  </div>;
}

export function Inventory({ save, isHome, busy, choose, store, undo, craft }: {
  save: Save; isHome: boolean; busy: boolean; choose: (building: Building) => void;
  store: (id: string) => void; undo: () => void; craft: () => void;
}) {
  return <div className="form-stack">
    <ResourceBar value={save.economy} />
    <p>基本道具　オノ・ツルハシ</p>
    <div className="button-row">
      <button onClick={craft} disabled={!isHome}>クラフト</button>
      <button onClick={undo} disabled={!isHome || !save.undo || busy}>直前の建築を取り消す</button>
    </div>
    {!isHome && <p>建築はマイアイランドでできるよ。</p>}
    {!save.buildings.length && <p>作った建物はここに入るよ。</p>}
    <ul className="inventory-list">{save.buildings.map(b => <li key={b.instanceId}>
      <span><b>{catalog[b.buildingId].name}</b><small>{b.placement ? '配置済み' : '収納中'}</small></span>
      <div className="button-row">
        <button disabled={!isHome || busy} onClick={() => choose(b)}>{b.placement ? '移動する' : '配置する'}</button>
        {b.placement && <button disabled={!isHome || busy} onClick={() => store(b.instanceId)}>収納する</button>}
      </div>
    </li>)}</ul>
  </div>;
}

export function BuildingControls({ building, placement, error, busy, rotate, move, apply, close }: {
  building: Building; placement: Placement; error: string | null; busy: boolean;
  rotate: () => void; move: (x: number, z: number) => void; apply: () => void; close: () => void;
}) {
  return <aside className="build-controls" aria-label="建築操作">
    <h2>{catalog[building.buildingId].name}</h2>
    <p>地面を選ぶか、ボタンで1マスずつ動かそう。</p>
    <div className="button-row" aria-label="位置調整">
      <button aria-label="北へ1マス" onClick={() => move(0, -1)}>↑</button>
      <button aria-label="西へ1マス" onClick={() => move(-1, 0)}>←</button>
      <button aria-label="南へ1マス" onClick={() => move(0, 1)}>↓</button>
      <button aria-label="東へ1マス" onClick={() => move(1, 0)}>→</button>
    </div>
    <p className="build-position" role="status">X {placement.x}　Z {placement.z}　{placement.rotation}°<br />{error ?? '配置できます'}</p>
    <div className="button-row">
      <button onClick={rotate}>回転</button>
      <button className="primary" disabled={!!error || busy} onClick={apply}>ここに配置</button>
      <button onClick={close}>戻る</button>
    </div>
  </aside>;
}
