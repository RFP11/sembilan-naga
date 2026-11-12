import type { DiceColor } from "@dnd/contracts";
import { Body, ContactMaterial, ConvexPolyhedron, Material, Plane, Vec3, World } from "cannon-es";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { DIE_FACES, faceOf, fitCentre, polyhedron, restingFace, symmetryRotation } from "./faces";
import { SIDES, type DieThrow, type Sides } from "./throws";
import { clack } from "./sound";

// The 3D dice: three.js draws them, cannon-es throws them. The server has already rolled, so a
// throw is simulated to the end first, then played back with each die's painted mesh turned
// by a symmetry of its shape so that the number the server rolled is the one on top.

const BASE = `${import.meta.env.BASE_URL}dice/`;
/** Physics step, and the playback frame rate. */
const STEP = 1 / 60;
const MAX_STEPS = 60 * 8;
/** World units are about one d6 across; these are tuned to look right at that size. */
const GRAVITY = 50;
/** Seconds the dice stay after landing, then take to fade. */
const HOLD = 2.4;
const FADE = 0.6;
/** The d6 model, in its own units after the FBX scale; everything is sized against it. */
const D6_SIZE = 2 * 0.5858;

type DieTextures = { map: string; normal: string; roughness?: string };
const NORMALS: Record<Sides, string> = {
  4: "d4Normal",
  6: "SixSidedNormal",
  8: "d8Normal",
  10: "d10Normal",
  12: "12Normal",
  20: "D20RedNormal",
};
const plain = (maps: Record<Sides, string>) =>
  Object.fromEntries(SIDES.map((s) => [s, { map: maps[s], normal: NORMALS[s] }])) as Record<
    Sides,
    DieTextures
  >;
const TEXTURES: Record<DiceColor, Record<Sides, DieTextures>> = {
  gold: {
    4: { map: "d4YellowAlbedo", normal: "d4YellowNormal", roughness: "d4_Roughness" },
    6: { map: "SixDiceAlbedo", normal: "SixYellowNormal", roughness: "d6_Roughness" },
    8: { map: "d8YellowAlbedo", normal: "d8YellowNormal", roughness: "d8_Roughness" },
    10: { map: "d10YellowAlbedo", normal: "d10YellowNormals", roughness: "d10_Roughness" },
    12: { map: "12Yellow", normal: "12YellowNormal", roughness: "d12_Roughness" },
    20: { map: "d20Diffuse", normal: "D20Normal", roughness: "d20_Roughness" },
  },
  red: plain({
    4: "d4RedAlbedo",
    6: "SixRedAlbedo",
    8: "d8RedAlbedo",
    10: "d10RedAlbedo",
    12: "12Albedo",
    20: "RedDiceAlbedo",
  }),
  silver: plain({
    4: "d4SilverAlbedo",
    6: "SixSilverAlbedo",
    8: "d8Silver",
    10: "d10SilverAlbedo",
    12: "12Silver",
    20: "SilverDiceAlbedo",
  }),
  tiedye: plain({
    4: "d4TieDyeAlbedo",
    6: "SixTieDyeAlbedo",
    8: "d8TieDyeAlbedo",
    10: "d10TieDyeAlbedo",
    12: "12TieDyeAlbedo",
    20: "TyeDieDiceAlbedo",
  }),
};
const SURFACE: Record<DiceColor, { roughness: number; metalness: number }> = {
  gold: { roughness: 1, metalness: 0.25 },
  red: { roughness: 0.32, metalness: 0 },
  silver: { roughness: 0.3, metalness: 0.85 },
  tiedye: { roughness: 0.32, metalness: 0 },
};

interface Model {
  geometry: THREE.BufferGeometry;
  shape: ConvexPolyhedron;
}

let models: Promise<Record<Sides, Model>> | null = null;

/** The six meshes, centred on their true centre and scaled to world units, with their solids. */
function loadModels() {
  models ??= new FBXLoader().loadAsync(`${BASE}DiceSet.fbx`).then((fbx) => {
    const out = {} as Record<Sides, Model>;
    for (const sides of SIDES) {
      let mesh: THREE.Mesh | undefined;
      fbx.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.name === `${sides}Yellow`) mesh = o as THREE.Mesh;
      });
      if (!mesh) throw new Error(`dice model d${sides} is missing`);
      const geometry = mesh.geometry.clone();
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!.getCenter(new THREE.Vector3());
      geometry.translate(-box.x, -box.y, -box.z);

      // How far out each flat face sits: the furthest vertex along its normal.
      const pos = geometry.getAttribute("position");
      const v = new THREE.Vector3();
      const planes = DIE_FACES[sides].normals.map(([x, y, z]) => {
        const n = new THREE.Vector3(x, y, z).normalize();
        let max = -Infinity;
        for (let i = 0; i < pos.count; i++)
          max = Math.max(max, n.dot(v.fromBufferAttribute(pos, i)));
        return max;
      });
      const { centre, distance } = fitCentre(sides, planes);
      geometry.translate(-centre.x, -centre.y, -centre.z);
      const k = mesh.scale.x / 100 / D6_SIZE;
      geometry.scale(k, k, k);

      const solid = polyhedron(sides, distance * k);
      const shape = new ConvexPolyhedron({
        vertices: solid.vertices.map((p) => new Vec3(p.x, p.y, p.z)),
        faces: solid.faces,
      });
      out[sides] = { geometry, shape };
    }
    return out;
  });
  models.catch(() => (models = null));
  return models;
}

const materials = new Map<DiceColor, Promise<Record<Sides, THREE.MeshStandardMaterial>>>();

/** One colour's materials, loaded the first time someone throws dice of that colour. */
function loadMaterials(color: DiceColor) {
  let loading = materials.get(color);
  if (loading) return loading;
  const loader = new THREE.TextureLoader();
  const texture = async (name: string, colour = false) => {
    const t = await loader.loadAsync(`${BASE}textures/${name}.png`);
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  loading = Promise.all(
    SIDES.map(async (sides) => {
      const names = TEXTURES[color][sides];
      const [map, normalMap, roughnessMap] = await Promise.all([
        texture(names.map, true),
        texture(names.normal),
        names.roughness ? texture(names.roughness) : null,
      ]);
      return [
        sides,
        new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, ...SURFACE[color] }),
      ] as const;
    }),
  ).then((list) => Object.fromEntries(list) as Record<Sides, THREE.MeshStandardMaterial>);
  loading.catch(() => materials.delete(color));
  materials.set(color, loading);
  return loading;
}

/** Starts loading what a throw needs, so the first one isn't late. */
export function preloadDice(color: DiceColor) {
  void loadModels().catch(() => undefined);
  void loadMaterials(color).catch(() => undefined);
}

interface Impact {
  step: number;
  strength: number;
  against: "table" | "die";
}

interface Simulation {
  /** Per die: x, y, z, qx, qy, qz, qw for every step. */
  frames: Float32Array[];
  steps: number;
  impacts: Impact[];
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Throws the dice into a box the size of the screen and records every step until they stop. */
function simulate(
  dice: readonly DieThrow[],
  shapes: Record<Sides, Model>,
  halfW: number,
  halfD: number,
): Simulation {
  const world = new World({ gravity: new Vec3(0, -GRAVITY, 0) });
  const dieMat = new Material("die");
  const tableMat = new Material("table");
  const wallMat = new Material("wall");
  world.addContactMaterial(
    new ContactMaterial(dieMat, tableMat, { friction: 0.35, restitution: 0.35 }),
  );
  world.addContactMaterial(
    new ContactMaterial(dieMat, wallMat, { friction: 0.05, restitution: 0.6 }),
  );
  world.addContactMaterial(
    new ContactMaterial(dieMat, dieMat, { friction: 0.2, restitution: 0.45 }),
  );

  const table = new Body({ mass: 0, material: tableMat, shape: new Plane() });
  table.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(table);
  // Planes face +z; turn each wall to face into the box.
  const walls: [number, number, number, number][] = [
    [-halfW, 0, 0, Math.PI / 2],
    [halfW, 0, 0, -Math.PI / 2],
    [0, 0, -halfD, 0],
    [0, 0, halfD, Math.PI],
  ];
  for (const [x, y, z, turn] of walls) {
    const wall = new Body({ mass: 0, material: wallMat, shape: new Plane() });
    wall.position.set(x, y, z);
    wall.quaternion.setFromEuler(0, turn, 0);
    world.addBody(wall);
  }

  // In from one side of the screen, towards the middle.
  const side = Math.floor(Math.random() * 3); // 0 left, 1 right, 2 bottom
  const bodies = dice.map((d, i) => {
    const body = new Body({
      mass: 1,
      material: dieMat,
      shape: shapes[d.sides].shape,
      linearDamping: 0.1,
      angularDamping: 0.1,
    });
    const along = (i % 4) * 1.2 - 1.8 + rand(-0.3, 0.3);
    const row = Math.floor(i / 4) * 1.3;
    if (side === 2) body.position.set(along, rand(2, 3.5), halfD - 1 - row);
    else body.position.set((side === 0 ? -1 : 1) * (halfW - 1 - row), rand(2, 3.5), along);
    const target = new Vec3(rand(-halfW, halfW) * 0.4, 0, rand(-halfD, halfD) * 0.4);
    const toward = target.vsub(body.position);
    toward.y = 0;
    toward.normalize();
    const speed = rand(16, 24);
    body.velocity.set(toward.x * speed, rand(-2, 3), toward.z * speed);
    body.angularVelocity.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
    body.quaternion.setFromEuler(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
    world.addBody(body);
    return body;
  });

  const impacts: Impact[] = [];
  let step = 0;
  const lastHeard = new Map<Body, number>();
  for (const body of bodies) {
    body.addEventListener(
      "collide",
      (e: { body: Body; contact: { getImpactVelocityAlongNormal(): number } }) => {
        const strength = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (strength < 1.5 || step - (lastHeard.get(body) ?? -99) < 4) return;
        const other = e.body;
        if (other.mass === 0 && other !== table) return; // the walls are the screen's edge: silent
        lastHeard.set(body, step);
        impacts.push({ step, strength, against: other === table ? "table" : "die" });
      },
    );
  }

  const frames = bodies.map(() => new Float32Array(MAX_STEPS * 7));
  let still = 0;
  for (; step < MAX_STEPS; step++) {
    world.step(STEP);
    bodies.forEach((b, i) => {
      frames[i]!.set(
        [
          b.position.x,
          b.position.y,
          b.position.z,
          b.quaternion.x,
          b.quaternion.y,
          b.quaternion.z,
          b.quaternion.w,
        ],
        step * 7,
      );
    });
    const resting = bodies.every(
      (b) => b.velocity.length() < 0.05 && b.angularVelocity.length() < 0.1,
    );
    still = resting ? still + 1 : 0;
    if (still >= 20) {
      step++;
      break;
    }
  }
  return { frames, steps: step, impacts };
}

interface ActiveRoll {
  group: THREE.Group;
  meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  turns: THREE.Quaternion[];
  sim: Simulation;
  start: number;
  heard: number;
  landed: boolean;
  onLanded?: () => void;
}

/** The dice tray laid over an element: a transparent canvas the dice tumble on. */
export class DiceScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private readonly light = new THREE.DirectionalLight(0xffffff, 2.2);
  private readonly shadow: THREE.Mesh;
  private readonly observer: ResizeObserver;
  private rolls: ActiveRoll[] = [];
  private raf = 0;
  private halfW = 6;
  private halfD = 4;
  private disposed = false;
  sound = true;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = "dice-canvas";
    host.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x403020, 1.1));
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.radius = 4;
    this.scene.add(this.light, this.light.target);

    // An invisible table that only catches the dice's shadows, so they sit on the map.
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ opacity: 0.4 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.receiveShadow = true;
    this.scene.add(this.shadow);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    // A d6 is about an eighth of the shorter side, within reason.
    const px = Math.min(80, Math.max(44, Math.min(w, h) / 8));
    this.halfW = w / 2 / px;
    this.halfD = h / 2 / px;
    this.camera.aspect = w / h;
    const height = this.halfD / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.set(0, height, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    this.camera.far = height + 20;
    this.camera.updateProjectionMatrix();

    const reach = Math.max(this.halfW, this.halfD) * 1.3;
    this.light.position.set(-this.halfW * 0.4, 20, -this.halfD * 0.6);
    const cam = this.light.shadow.camera;
    Object.assign(cam, {
      left: -reach,
      right: reach,
      top: reach,
      bottom: -reach,
      near: 1,
      far: 50,
    });
    cam.updateProjectionMatrix();
    this.shadow.scale.set(this.halfW * 2, this.halfD * 2, 1);
    if (!this.raf) this.renderer.render(this.scene, this.camera);
  }

  /** Throws dice of a colour; `onLanded` runs when they come to rest. */
  async throw(dice: readonly DieThrow[], color: DiceColor, onLanded?: () => void) {
    const [shapes, mats] = await Promise.all([loadModels(), loadMaterials(color)]);
    if (this.disposed || dice.length === 0) return;
    const sim = simulate(dice, shapes, this.halfW, this.halfD);
    const group = new THREE.Group();
    const last = (sim.steps - 1) * 7;
    const meshes = dice.map((d) => {
      const mesh = new THREE.Mesh(shapes[d.sides].geometry, mats[d.sides].clone());
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    });
    const turns = dice.map((d, i) => {
      const f = sim.frames[i]!;
      const landed = new THREE.Quaternion(f[last + 3], f[last + 4], f[last + 5], f[last + 6]);
      return symmetryRotation(d.sides, faceOf(d.sides, d.value), restingFace(d.sides, landed));
    });
    this.scene.add(group);
    this.rolls.push({
      group,
      meshes,
      turns,
      sim,
      start: performance.now(),
      heard: -1,
      landed: false,
      onLanded,
    });
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    const q = new THREE.Quaternion();
    const q2 = new THREE.Quaternion();
    for (const roll of [...this.rolls]) {
      const { sim } = roll;
      const t = (now - roll.start) / 1000;
      const at = Math.min(t / STEP, sim.steps - 1);
      const i0 = Math.floor(at);
      const i1 = Math.min(i0 + 1, sim.steps - 1);
      const mix = at - i0;
      roll.meshes.forEach((mesh, d) => {
        const f = sim.frames[d]!;
        const a = i0 * 7;
        const b = i1 * 7;
        mesh.position.set(
          f[a]! + (f[b]! - f[a]!) * mix,
          f[a + 1]! + (f[b + 1]! - f[a + 1]!) * mix,
          f[a + 2]! + (f[b + 2]! - f[a + 2]!) * mix,
        );
        q.set(f[a + 3]!, f[a + 4]!, f[a + 5]!, f[a + 6]!);
        q2.set(f[b + 3]!, f[b + 4]!, f[b + 5]!, f[b + 6]!);
        mesh.quaternion.slerpQuaternions(q, q2, mix).multiply(roll.turns[d]!);
      });
      // Knocks are heard as playback reaches them.
      for (const hit of sim.impacts) {
        if (hit.step > roll.heard && hit.step <= at && this.sound) clack(hit.strength, hit.against);
      }
      roll.heard = at;

      const after = t - sim.steps * STEP;
      if (after >= 0 && !roll.landed) {
        roll.landed = true;
        roll.onLanded?.();
      }
      if (after > HOLD) {
        const fade = (after - HOLD) / FADE;
        for (const mesh of roll.meshes) {
          mesh.material.transparent = true;
          mesh.material.opacity = Math.max(0, 1 - fade);
          mesh.castShadow = fade < 0.5;
        }
        if (fade >= 1) this.remove(roll);
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.raf = this.rolls.length ? requestAnimationFrame(this.tick) : 0;
  };

  private remove(roll: ActiveRoll) {
    this.scene.remove(roll.group);
    for (const mesh of roll.meshes) mesh.material.dispose();
    this.rolls = this.rolls.filter((r) => r !== roll);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    for (const roll of [...this.rolls]) this.remove(roll);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
