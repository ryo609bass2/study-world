import * as THREE from 'three';
import type { Marker, MapDef } from '../worlds/maps.ts';
import type { Platform, Rect } from '../worlds/geometry.ts';

import { defaultAvatar } from '../app/avatar.ts';
import type { AvatarConfig } from '../app/avatar.ts';
const palette = {
  skin: [0xf8cf9d, 0xe7a576, 0xb97850, 0x845037],
  hair: [0x392f36, 0x764731, 0xdeb067, 0x37466d],
  outfit: [0x397f7d, 0x4f69a6, 0xb95554, 0xd39535, 0x6654a0],
};


export class ModelKit {
  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();

  box(parent: THREE.Object3D, color: number, width: number, height: number, depth: number,
      x = 0, y = 0, z = 0, opacity = 1) {
    const key = color + ':' + opacity;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, opacity, transparent: opacity < 1, depthWrite: opacity === 1 });
      this.materials.set(key, material);
    }
    const mesh = new THREE.Mesh(this.boxGeometry, material);
    mesh.scale.set(width, height, depth);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  lot(parent: THREE.Object3D, platform: Platform) {
    const { x, z, top, width, depth, color } = platform;
    this.box(parent, 0x9b7956, width, 2.4, depth, x + width / 2, top - 1.48, z + depth / 2);
    this.box(parent, color, width, 0.28, depth, x + width / 2, top - 0.14, z + depth / 2);
  }

  tree(parent: THREE.Object3D, x: number, z: number, size = 1, color = 0x478861) {
    this.box(parent, 0x866346, .54 * size, 2.4 * size, .54 * size, x, 1.2 * size, z);
    this.box(parent, color, 2.2 * size, 1.6 * size, 2.0 * size, x, 2.7 * size, z);
    this.box(parent, 0x6ba668, 1.5 * size, 1.1 * size, 1.5 * size, x + .12, 3.65 * size, z - .1);
  }

  avatar(config: AvatarConfig) {
    const g = new THREE.Group();
    const skin = palette.skin[config.skin] ?? palette.skin[1];
    const hair = palette.hair[config.hairColor] ?? palette.hair[0];
    const shirt = palette.outfit[config.color] ?? palette.outfit[0];
    const leg = (x: number) => this.box(g, 0x243952, .19, .43, .24, x, .28, 0);
    leg(-.14); leg(.14);
    this.box(g, 0x1e2d41, .22, .14, .33, -.14, .07, -.05);
    this.box(g, 0x1e2d41, .22, .14, .33, .14, .07, -.05);
    this.box(g, shirt, .53, .59, .35, 0, .75, 0);
    this.box(g, config.outfit === 1 ? 0xe8c068 : 0xf3e4b9, .25, .13, .03, 0, .89, -.184);
    this.box(g, config.outfit === 2 ? 0xc68c4b : 0x5b463c, .34, .42, .16, 0, .76, .23);
    for (const side of [-1, 1]) {
      this.box(g, shirt, .15, .26, .21, side * .34, .86, 0);
      this.box(g, skin, .14, .26, .18, side * .34, .64, 0);
      this.box(g, 0x222836, .047, config.face === 1 ? .024 : .055, .018, side * .10, 1.28, -.236);
    }
    this.box(g, skin, .46, .44, .46, 0, 1.29, 0);
    this.box(g, hair, .49, .15, .49, 0, 1.54, 0);
    if (config.hair) this.box(g, hair, config.hair === 1 ? .21 : .42, .17, .42, -.03, 1.64, .024);
    this.box(g, config.face === 2 ? 0x983847 : 0x745044, .09, .025, .018, 0, 1.17, -.236);
    return g;
  }

  marker(marker: Marker) {
    const g = new THREE.Group();
    g.position.set(marker.x, 0, marker.z);
    if (marker.kind === 'portal' || marker.kind === 'mining' || marker.kind === 'obby') {
      const tint = marker.kind === 'mining' ? 0xe1aa66 : 0x6fc6d5;
      this.box(g, 0x4f7377, 2.6, .19, 1.9, 0, .1);
      this.box(g, tint, 1.56, 2.3, .16, 0, 1.25, 0, .55);
      for (const x of [-1, 1]) this.box(g, 0xece0b9, .38, 2.5, .51, x, 1.25);
      this.box(g, 0xece0b9, 2.4, .4, .52, 0, 2.6);
    } else if (marker.kind === 'chest') {
      this.box(g, 0x774c34, 1.16, .56, .8, 0, .28);
      this.box(g, marker.depleted ? 0x94785c : 0xdaaa54, 1.19, .19, .81, 0, marker.depleted ? .77 : .64, marker.depleted ? -.1 : 0);
      this.box(g, 0xf4d688, .17, .25, .05, 0, .49, .42);
    } else if (marker.kind === 'node') {
      if (!marker.depleted) {
        const stone = marker.id.includes('stone') || marker.id.includes('vein');
        this.box(g, stone ? 0x777f94 : 0x946340, 1.45, .6, .92, 0, .3);
        this.box(g, stone ? 0xb8bfd0 : 0xbe8e60, .92, .35, .61, -.13, .7);
      }
    } else if (marker.kind === 'npc') {
      g.add(this.avatar({ ...defaultAvatar, color: 3, hair: 1 }));
      this.box(g, 0xffd67e, .34, .34, .34, 0, 2.19).rotation.z = Math.PI / 4;
    } else {
      this.box(g, 0x906446, 1.6, .79, .97, 0, .4);
      this.box(g, 0xf2c78b, 1.7, .17, 1.05, 0, .88);
    }
    return g;
  }

  prefab(id: string, box: Rect, rotation: number, preview?: boolean) {
    const g = new THREE.Group();
    g.position.set(box.x + box.width / 2, 0, box.z + box.depth / 2);
    g.rotation.y = rotation * Math.PI / 180;
    const opacity = preview === undefined ? 1 : .6;
    const part = (color: number, w: number, h: number, d: number, x: number, y: number, z: number) =>
      this.box(g, preview === false ? 0xc45850 : color, w, h, d, x, y, z, opacity);
    if (id === 'house_small' || id === 'warehouse') {
      const depth = id === 'house_small' ? 3.6 : 2.7;
      part(0x9c6b4d, 3.7, .25, depth, 0, .125, 0);
      part(id === 'house_small' ? 0xf3dca2 : 0xc0d8ca, 3.5, 2.2, depth - .2, 0, 1.35, 0);
      part(0x5d493c, .74, 1.4, .06, 0, .94, depth / 2 - .05);
      for (const x of [-1.12, 1.12]) part(0x7dbcca, .57, .65, .09, x, 1.52, depth / 2 - .05);
      for (let i = 0; i < 4; i++) part(0xae594c, 3.95 - i * .81, .26, depth + .12, 0, 2.52 + i * .24, 0);
    } else if (id === 'flowerbed') {
      part(0x956947, 1.87, .34, 1.87, 0, .17, 0);
      for (let i = 0; i < 6; i++) {
        const x = (i % 3 - 1) * .56, z = (Math.floor(i / 3) - .5) * .77;
        part(0x4d8654, .12, .31, .12, x, .45, z);
        part(i % 2 ? 0xf1bd55 : 0xde7785, .29, .18, .29, x, .65, z);
      }
    } else if (id === 'bench') {
      part(0xc89557, 1.9, .15, .75, 0, .48, 0);
      for (const x of [-.66, .66]) part(0x6f5443, .2, .47, .58, x, .23, 0);
      part(0xc89557, 1.9, .34, .12, 0, .73, -.34);
    } else part(0xc2c7b8, .96, .075, .96, 0, .037, 0);
    return g;
  }

  decorate(parent: THREE.Group, world: MapDef) {
    if (world.id === 'home') {
      for (const [x, z, s] of [[-19,15,1.15],[-17,9,.88],[-20,2,1.2],[-18,-13,1.35],[-13,-18,.94],[7,-19,1.25],[17,-16,.85],[19,-7,1.22],[17,7,1.07],[20,14,.88],[-9,20,.66]]) this.tree(parent, x, z, s);
      this.box(parent, 0x8bbb72, 24, .025, 24, 0, .013, 0);
    } else if (world.id === 'hub') {
      this.box(parent, 0xd7d1af, 9, .14, 9, 0, .07, 0);
      this.box(parent, 0x85bdcb, 7.5, .39, 7.5, 0, .26, 0);
      this.box(parent, 0xf2dfac, 1.4, 2.2, 1.4, 0, 1.1, 0);
      for (const x of [-28, -16, 16, 28]) for (const z of [-26, 12, 27]) this.tree(parent, x, z, 1.08);
    } else if (world.id === 'greenwood_mine') {
      for (let i = 0; i < 35; i++) {
        const x = -60 + ((i * 17) % 50), z = -60 + ((i * 31) % 119);
        if (!world.markers.some(m => Math.hypot(m.x - x, m.z - z) < 4)) this.tree(parent, x, z, .85 + (i % 5) * .13);
      }
      for (let i = 0; i < 5; i++) this.box(parent, 0xc0bc99, 1.4, 3, 1.4, -29 + 2 * i, 1.5, -25);
      this.box(parent, 0x79becd, 5, 8, .8, 25, 4, -57);
      this.box(parent, 0x9ea69b, 12, 8, 4, 25, 4, -59.5);
    } else {
      for (const x of [-58, -30, -12, 18, 43, 58]) {
        this.box(parent, 0xf6e4af, 3.5, 1, 3.5, x, .5, -7);
        this.box(parent, 0xd69974, 2.5, 1, 2.5, x, 1.5, -7);
      }
    }
  }

  dispose() { this.boxGeometry.dispose(); for (const material of this.materials.values()) material.dispose(); }
}
