import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import * as THREE from 'three';
import type { AvatarConfig } from '../app/avatar.ts';
import type { Settings } from '../app/settings.ts';
import type { MapDef } from '../worlds/maps.ts';
import { buildingArea } from '../worlds/maps.ts';
import { contains, groundAt, movement, stepAround } from '../worlds/geometry.ts';
import type { Point, Rect } from '../worlds/geometry.ts';
import { ModelKit } from './models.ts';

export interface VisualBuilding {
  id: string; type: string; area: Rect; rotation: number;
}
interface Props {
  world: MapDef; spawn: Point; avatar: AvatarConfig; settings: Settings;
  paused: boolean; building: boolean; buildings: VisualBuilding[];
  preview?: VisualBuilding & { valid: boolean };
  onPoint: (point: Point) => void;
  onPosition: (point: Point) => void;
  onFall?: () => void;
  onUnavailable: () => void;
}

export default function WorldView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const stick = useRef({ x: 0, z: 0 });
  const [stickView, setStickView] = useState({ x: 0, z: 0 });
  const touchJump = useRef(false);
  const [run, setRun] = useState(false);
  const touchRun = useRef(false);
  const touchId = useRef<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const clearTouch = () => {
    stick.current = { x: 0, z: 0 };
    setStickView(stick.current);
    touchJump.current = false;
    touchId.current = null;
    touchRun.current = false;
    setRun(false);
  };

  useEffect(() => {
    if (props.paused || props.building) clearTouch();
  }, [props.paused, props.building]);

  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch {
      setUnavailable(true);
      current.current.onUnavailable();
      return;
    }
    const canvas = renderer.domElement;
    canvas.tabIndex = -1;
    canvas.setAttribute('aria-label', '3Dの島');
    container.append(canvas);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa9d3dc);
    scene.fog = new THREE.Fog(0xa9d3dc, 40, 112);
    const camera = new THREE.PerspectiveCamera(65, 1, .12, 180);
    const kit = new ModelKit();
    const terrain = new THREE.Group();
    const grid = new THREE.GridHelper(24, 24, 0x42795e, 0x709e6f);
    grid.position.y = .035;
    scene.add(grid);
    const objects = new THREE.Group();
    const buildings = new THREE.Group();
    scene.add(terrain, objects, buildings);
    const light = new THREE.DirectionalLight(0xffeed0, 2.05);
    light.position.set(-16, 30, 19);
    scene.add(light, new THREE.HemisphereLight(0xe7f7ff, 0x9c8168, 1.75));
    kit.box(scene, 0x79becb, 320, .22, 320, 0, -2.95, 0);
    for (let i = 0; i < 22; i++) {
      const angle = i * 2.399;
      const distance = 58 + (i % 5) * 11;
      kit.box(scene, 0xe0eef0, 6 + i % 6, .75, 3 + i % 4, Math.sin(angle) * distance, 14 + i % 7, Math.cos(angle) * distance);
    }
    const shadow = kit.box(scene, 0x3e5b55, .85, .027, .62, 0, .021, 0, .32);
    let world = current.current.world;
    let avatarConfig = current.current.avatar;
    let avatar = kit.avatar(avatarConfig);
    scene.add(avatar);
    let position = { ...current.current.spawn };
    let feet = 0, velocity = 0, falling = 0, orientation = 0;
    let yaw = world.id.startsWith('obby-') ? 0 : .45, pitch = .46, distance = 6;
    let elapsed = 0, reportAt = 0;
    let lastBuildings: VisualBuilding[] | undefined, lastPreview: Props['preview'];
    let previousBuildMode = false; let previousPause = false;
    let quality: Settings['graphics'] | undefined;
    const keys = new Set<string>();
    const pointer = new Map<number, { x: number; y: number; drag: boolean }>();
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const target = new THREE.Vector3();
    const eye = new THREE.Vector3();
    let stop = false;
    let frame = 0;
    let last = performance.now();
    let lastPaint = -Infinity;

    const renderWorld = () => {
      terrain.clear();
      objects.clear();
      for (const p of world.platforms) kit.lot(terrain, p);
      if (!world.id.startsWith('obby-')) kit.decorate(terrain, world);
      for (const marker of world.markers) objects.add(kit.marker(marker));
    };
    renderWorld();

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    function clear() {
      keys.clear();
      pointer.clear();
      clearTouch();
    }
    const codes = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space']);
    function keydown(event: KeyboardEvent) {
      if (current.current.paused || current.current.building || !codes.has(event.code)) return;
      if (event.target instanceof HTMLElement &&
          event.target.closest('input,select,textarea,[contenteditable],dialog') ||
          event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      keys.add(event.code);
    }
    function keyup(event: KeyboardEvent) { keys.delete(event.code); }
    function onDown(event: PointerEvent) {
      if (current.current.paused) return;
      pointer.set(event.pointerId, { x: event.clientX, y: event.clientY, drag: event.button === 2 || event.pointerType === 'touch' });
      canvas.setPointerCapture(event.pointerId);
      if (current.current.building && event.button === 0 && pointer.size === 1) {
        const rect = canvas.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
        if (ray.ray.intersectPlane(plane, hit)) current.current.onPoint({ x: Math.floor(hit.x), z: Math.floor(hit.z) });
      }
    }
    function onMove(event: PointerEvent) {
      const prior = pointer.get(event.pointerId);
      if (!prior || current.current.paused) return;
      const dx = event.clientX - prior.x, dy = event.clientY - prior.y;
      const another = [...pointer.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (another && event.pointerType === 'touch') {
        const diff = Math.hypot(prior.x - another.x, prior.y - another.y) - Math.hypot(event.clientX - another.x, event.clientY - another.y);
        distance = THREE.MathUtils.clamp(distance + diff * .024, 3, 10);
      } else if (prior.drag && !current.current.building) {
        const sensitivity = { low: .003, medium: .005, high: .008 }[current.current.settings.cameraSensitivity];
        yaw -= dx * sensitivity;
        pitch = THREE.MathUtils.clamp(pitch + dy * sensitivity, .12, 1.1);
      }
      prior.x = event.clientX;
      prior.y = event.clientY;
    }
    function onUp(event: PointerEvent) { pointer.delete(event.pointerId); }
    function onWheel(event: WheelEvent) {
      if (current.current.paused) return;
      event.preventDefault();
      distance = THREE.MathUtils.clamp(distance + Math.sign(event.deltaY) * .55, 3, 10);
    }
    function onContext(event: Event) { event.preventDefault(); }
    function lostContext(event: Event) {
      event.preventDefault();
      stop = true;
      setUnavailable(true);
      current.current.onUnavailable();
    }
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', onUp);
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('webglcontextlost', lostContext);

    function draw(now: number) {
      if (stop) return;
      frame = requestAnimationFrame(draw);
      const next = current.current;
      if (next.settings.graphics !== quality) {
        quality = next.settings.graphics;
        renderer.setPixelRatio(Math.min(devicePixelRatio, { low: 1.25, standard: 1.5, high: 2 }[quality]));
        resize();
      }
      const dt = Math.min((now - last) / 1000, .05);
      last = now;
      if (next.world !== world) {
        const reset = next.world.id !== world.id;
        world = next.world;
        renderWorld();
        if (reset) {
          position = { ...next.spawn };
          yaw = world.id.startsWith('obby-') ? 0 : .45;
          feet = velocity = falling = 0;
          reportAt = 0;
          clear();
        }
      }
      if (next.avatar !== avatarConfig) {
        avatarConfig = next.avatar;
        avatar.removeFromParent();
        avatar = kit.avatar(avatarConfig);
        scene.add(avatar);
      }
      if (next.buildings !== lastBuildings || next.preview !== lastPreview) {
        lastBuildings = next.buildings;
        lastPreview = next.preview;
        buildings.clear();
        for (const b of next.buildings) buildings.add(kit.prefab(b.type, b.area, b.rotation));
        if (next.preview) {
          const p = next.preview;
          buildings.add(kit.prefab(p.type, p.area, p.rotation, p.valid));
        }
      }
      if (next.building !== previousBuildMode) {
        previousBuildMode = next.building;
        clear();
      }
      if (next.paused !== previousPause) { previousPause = next.paused; clear(); }
      if (!next.paused && !next.building) {
        const down = (...codes: string[]) => Number(codes.some(code => keys.has(code)));
        const x = down('KeyD', 'ArrowRight') - down('KeyA', 'ArrowLeft') + stick.current.x;
        const z = down('KeyS', 'ArrowDown') - down('KeyW', 'ArrowUp') + stick.current.z;
        const dash = down('ShiftLeft', 'ShiftRight') || touchRun.current;
        const speed = (dash ? 6.5 : 4) * (next.settings.slowMove ? .64 : 1);
        const obstacles = [...world.obstacles, ...next.buildings.filter(b => b.type !== 'stone_path').map(b => b.area).filter(b => !contains(b, position, .3))];
        const delta = movement(x, z, yaw, speed, dt);
        if (x || z) {
          position = stepAround(position, delta, obstacles);
          orientation = Math.atan2(-delta.x, -delta.z);
          if (next.settings.autoCamera && pointer.size === 0 && z < -.4 && Math.abs(x) > .45)
            yaw += Math.sign(-x) * dt * .35;
        }
        const ground = groundAt(position, world.platforms, feet);
        const jump = keys.has('Space') || touchJump.current;
        keys.delete('Space');
        touchJump.current = false;
        if (jump && feet <= ground + .03) velocity = Math.sqrt(2 * 16 * (next.settings.actionDifficulty === 'assist' ? 1.7 : 1.5));
        velocity -= 16 * dt;
        feet += velocity * dt;
        if (feet <= ground) { feet = ground; velocity = 0; falling = 0; }
        if (ground === -Infinity && feet < -.45) falling += dt;
        if (falling > (next.settings.fallProtection ? .55 : .84) || feet < -9) {
          position = { ...next.spawn };
          feet = groundAt(position, world.platforms, 0);
          if (!Number.isFinite(feet)) feet = 0;
          velocity = falling = 0;
          keys.clear();
          next.onFall?.();
        }
        elapsed += dt;
        if (elapsed >= reportAt) {
          reportAt = elapsed + .12;
          next.onPosition({ ...position });
        }
      }
      avatar.position.set(position.x, feet, position.z);
      avatar.rotation.y = orientation;
      shadow.position.set(position.x, .025, position.z);
      shadow.visible = feet >= -.2;
      grid.visible = next.building;
      if (next.building) {

        const center = buildingArea;
        target.set(center.x + center.width / 2, 0, center.z + center.depth / 2);

        eye.copy(target).add(new THREE.Vector3(14, 23, 21));
      } else {
        target.set(position.x, Math.max(feet, -1) + 1.12, position.z);
        eye.set(target.x + Math.sin(yaw) * Math.cos(pitch) * distance, target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * Math.cos(pitch) * distance);
        const fromTarget = eye.clone().sub(target);
        for (let factor = 1; factor > .25; factor -= .08) {
          const testPoint = target.clone().addScaledVector(fromTarget, factor);
          if (!next.buildings.some(b => b.type !== 'stone_path' && testPoint.y < 3.75 &&
            testPoint.x >= b.area.x && testPoint.x <= b.area.x + b.area.width &&
            testPoint.z >= b.area.z && testPoint.z <= b.area.z + b.area.depth)) {
            eye.copy(testPoint);
            break;
          }
        }
      }
      if (next.settings.reducedMotion || next.building || camera.position.lengthSq() === 0) camera.position.copy(eye);
      else camera.position.lerp(eye, Math.min(1, dt * 13));
      camera.lookAt(target);
      if (quality !== 'low' || now - lastPaint >= 31) {
        renderer.render(scene, camera);
        lastPaint = now;
      }
    }
    frame = requestAnimationFrame(draw);
    return () => {
      stop = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onUp);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', lostContext);
      grid.geometry.dispose(); grid.material.dispose();
      kit.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  function steer(event: ReactPointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left - box.width / 2) / 38;
    const z = (event.clientY - box.top - box.height / 2) / 38;
    const normal = Math.max(Math.hypot(x, z), 1);
    stick.current = { x: x / normal, z: z / normal };
    setStickView(stick.current);
  }

  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (touchId.current !== event.pointerId) return;
    touchId.current = null;
    stick.current = { x: 0, z: 0 };
    setStickView(stick.current);
  };

  return <>
    <div ref={host} className="world-canvas" data-world={props.world.id} />
    {!props.paused && !props.building && !unavailable && <div className={'touch-controls' + (props.settings.leftHanded ? ' left-handed' : '')}>
      <div className="joystick" aria-label="移動スティック"
        onPointerDown={e => {
          if (touchId.current !== null) return;
          touchId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          steer(e);
        }}
        onPointerMove={e => { if (touchId.current === e.pointerId) steer(e); }}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
        <div style={{ transform: `translate(${stickView.x * 33}px,${stickView.z * 33}px)` }} />
      </div>
      <div className="touch-actions">
        <button type="button" aria-pressed={run} onClick={() => { touchRun.current = !run; setRun(!run); }}>走る</button>
        <button type="button" onPointerDown={() => { touchJump.current = true; }} onClick={e => { if (e.detail === 0) touchJump.current = true; }}>ジャンプ</button>
      </div>
    </div>}
  </>;
}
