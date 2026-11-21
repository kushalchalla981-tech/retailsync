import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { TEAM_MEMBERS, storeToTeamMember, TeamMember } from '../data/team';
import { ExtendedStore } from '../data/storeManager';
import { cardVertex, cardFragment } from '../webgl/shaders';
import { createPreviewTexture, createPaperNormalTexture } from '../webgl/textures';
import { sound } from '../utils/sound';

THREE.ColorManagement.enabled = false; // reference renders raw (OGL, no colour management)

export interface SceneApi {
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
  setLocked: (locked: boolean) => void;
}

interface WebGLSceneProps {
  ready: boolean;
  onProgress: (p: number) => void;
  onShowName: (index: number) => void;
  onHideName: () => void;
  onNameHover: (hovered: boolean) => void;
  onSelect: (index: number) => void;
  /** Called instead of rendering when the browser cannot create a WebGL context. */
  onUnsupported: () => void;
  apiRef: React.MutableRefObject<SceneApi | null>;
  stores?: ExtendedStore[];
}

export const WebGLScene: React.FC<WebGLSceneProps> = ({
  ready,
  onProgress,
  onShowName,
  onHideName,
  onNameHover,
  onSelect,
  onUnsupported,
  apiRef,
  stores,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cb = useRef({ onProgress, onShowName, onHideName, onNameHover, onSelect, onUnsupported });
  cb.current = { onProgress, onShowName, onHideName, onNameHover, onSelect, onUnsupported };
  const startRef = useRef<(() => void) | null>(null);

  const members: TeamMember[] = stores && stores.length > 0 ? stores.map(storeToTeamMember) : TEAM_MEMBERS;
  const N = members.length;

  useEffect(() => {
    const container = containerRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      // GPU disabled or blocklisted (e.g. Chrome with graphics acceleration off): let the app show its 2D fallback.
      cb.current.onUnsupported();
      return;
    }
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new THREE.Color(244 / 255, 240 / 255, 237 / 255), 1);
    container.appendChild(renderer.domElement);
    renderer.domElement.className = 'webgl';

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 3);
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.position.y = 0.05;
    scene.add(group);

    const geometry = new THREE.PlaneGeometry(1, 1, 40, 40);
    const paper = createPaperNormalTexture();

    // ---- planes ---------------------------------------------------------
    type Plane = {
      mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
      u: Record<string, THREE.IUniform>;
      hover: { value: number };
      isHover: boolean;
      introOffset: number;
    };
    const baseScale = new THREE.Vector3((3 / 4) * 1.05, 1.05, 1);
    const oScale = baseScale.clone();
    const planes: Plane[] = members.map((m, i) => {
      // The store poster (drawn with the store's own name) is the card face; no per-card video.
      const preview = createPreviewTexture(m, i);

      const u: Record<string, THREE.IUniform> = {
        uVelocity: { value: 0 }, uVelocityAbs: { value: 0 }, uBump: { value: 1 }, uIndex: { value: i },
        uFold: { value: 1 }, uHover: { value: 0 }, uHit: { value: new THREE.Vector2(0.5, 0.5) },
        uReveal: { value: 0 }, uAlpha: { value: 1 }, uPaperBlend: { value: 0.2 }, uPaperDisplacement: { value: 0.008 },
        uPreview: { value: preview }, uMap: { value: preview }, uNormal: { value: paper },
      };
      const material = new THREE.ShaderMaterial({ vertexShader: cardVertex, fragmentShader: cardFragment, uniforms: u, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.copy(oScale);
      mesh.userData.index = i;
      group.add(mesh);

      const plane: Plane = { mesh, u, hover: { value: 0 }, isHover: false, introOffset: 1 };
      return plane;
    });
    cb.current.onProgress(1);

    // ---- carousel state (same constants as the reference) -----------------
    const st = {
      progress: 5000 * N, target: 5000 * N, velocity: 0, velocityAbs: 0,
      wheel: 0, isHome: false, locked: false, idle: false, canShowName: false, lastShow: -1, mouseIn: false,
    };

    // ---- pointer --------------------------------------------------------
    const ptr = { x: 0, y: 0, nx: 0, ny: 0, vx: 0, vy: 0, isDown: false, downAt: 0, lastX: 0, lastY: 0 };
    const isTouch = matchMedia('(pointer: coarse)').matches;
    const raycaster = new THREE.Raycaster();
    let hovered: Plane | null = null;
    let canRaycast = false;

    const raycast = () => {
      if (!canRaycast) return;
      raycaster.setFromCamera(new THREE.Vector2(ptr.nx, ptr.ny), camera);
      const hit = raycaster.intersectObjects(planes.filter((p) => p.mesh.visible).map((p) => p.mesh))[0];
      hovered = hit ? planes[hit.object.userData.index] : null;
      if (hit && hit.uv && hovered) hovered.u.uHit.value.set(hit.uv.x - 0.5, hit.uv.y - 0.5);
      planes.forEach((p) => {
        const on = p === hovered;
        if (on !== p.isHover) {
          p.isHover = on;
          gsap.to(p.hover, { value: on ? 1 : 0, duration: 0.3, ease: 'cubic.out', overwrite: true });
        }
      });
    };

    const setPointer = (x: number, y: number) => {
      ptr.x = x; ptr.y = y;
      ptr.nx = (x / window.innerWidth) * 2 - 1;
      ptr.ny = -(y / window.innerHeight) * 2 + 1;
    };
    const onMove = (e: PointerEvent) => { setPointer(e.clientX, e.clientY); raycast(); };
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('a,button,.work-names')) return;
      setPointer(e.clientX, e.clientY);
      ptr.isDown = true; ptr.downAt = Date.now(); ptr.lastX = e.clientX; ptr.lastY = e.clientY;
      raycast();
    };
    const onUp = () => { ptr.isDown = false; raycast(); };

    const shortestTo = (index: number) => {
      const cur = Math.round(st.progress % N);
      let d = index - cur;
      if (Math.abs(d) > N / 2) d += d > 0 ? -N : N;
      return Math.round(st.target) + d;
    };

    const onClick = (e: MouseEvent) => {
      if (st.locked || !hovered || (e.target as HTMLElement).closest('a,button,.work-names')) return;
      if (Date.now() - ptr.downAt > 300 || st.velocityAbs > 0.5) return;
      const idx = hovered.mesh.userData.index as number;
      const cur = Math.round(st.progress) % N;
      if (idx === cur && st.velocityAbs < 0.1) { sound.playCardSelect(); cb.current.onSelect(idx); }
      else { st.target = shortestTo(idx); sound.playWhoosh(1); }
    };

    const onWheel = (e: WheelEvent) => {
      if (st.locked) return;
      e.preventDefault();
      st.wheel += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    };

    const onKey = (e: KeyboardEvent) => {
      if (st.locked || !st.isHome) return;
      if (e.key === 'ArrowLeft') { st.target--; sound.playWhoosh(0.9); }
      else if (e.key === 'ArrowRight') { st.target++; sound.playWhoosh(1.1); }
      else if (e.key === 'Enter') cb.current.onSelect(Math.round(st.target) % N);
      st.target = Math.round(st.target);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('click', onClick);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);

    apiRef.current = {
      goTo: (i) => { st.target = shortestTo(i); },
      next: () => { st.target = Math.round(st.target) + 1; },
      prev: () => { st.target = Math.round(st.target) - 1; },
      setLocked: (l) => {
        st.locked = l;
        planes.forEach((p) => gsap.to(p.u.uBump, { value: l ? 0 : 1, duration: l ? 1 : 2, ease: 'expo.out', overwrite: true }));
      },
    };

    // ---- intro (fires once preloader is done) ---------------------------
    startRef.current = () => {
      const startIndex = Math.round(st.progress % N);
      planes.forEach((p, i) => {
        gsap.to(p, { introOffset: 0, duration: 3, delay: 0.4, ease: 'elastic.out(0.5,0.6)' });
        gsap.to(p.u.uFold, { value: 0, duration: 1.6, ease: 'quart.inOut', delay: startIndex === i ? 0.5 : Math.random() * 0.4 });
      });
      setTimeout(() => { st.isHome = true; }, 200);
      setTimeout(() => { canRaycast = true; }, 600);
      setTimeout(() => { st.canShowName = true; }, 2000);
    };

    // ---- resize ---------------------------------------------------------
    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Portrait phones: the centre card sits ~0.4 closer (bump), so fit it to 80% of the view width there.
      const visibleW = 2 * (camera.position.z - 0.4) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
      oScale.copy(baseScale).multiplyScalar(Math.min(1, (visibleW * 0.8) / baseScale.x));
    };
    onResize();
    window.addEventListener('resize', onResize);

    // ---- loop -----------------------------------------------------------
    const tmp = new THREE.Vector3();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);

      // pointer velocity (px / frame)
      ptr.vx = ptr.x - ptr.lastX; ptr.vy = ptr.y - ptr.lastY;
      ptr.lastX = ptr.x; ptr.lastY = ptr.y;

      if (st.isHome && !st.locked) {
        st.target += st.wheel / 600;
        const k = isTouch ? 1.3 : 1;
        if (ptr.isDown) {
          if (isTouch) { if (Math.abs(ptr.vy) < 20) st.target += (-ptr.vx / 160) * k; }
          else st.target += (-ptr.vx / 140) * k;
        }
      }
      st.wheel = 0;

      st.velocity = st.target - st.progress;
      st.velocityAbs += (Math.abs(st.velocity) - st.velocityAbs) * 0.12;
      if (Math.abs(st.velocity) < (isTouch ? 0.06 : 0.01)) {
        st.target = Math.round(st.progress);
        st.velocity = st.target - st.progress;
        st.progress += st.velocity * 0.1;
      } else {
        st.progress += st.velocity * 0.09;
      }

      // work-name show/hide when the carousel settles on a card
      const frac = st.progress % 1;
      const snapped = frac < 0.05 || frac > 0.95;
      if (st.idle && Math.abs(st.velocity) > 0.05 && !snapped) {
        st.idle = false; st.lastShow = -1; cb.current.onHideName();
        if (st.mouseIn) { st.mouseIn = false; cb.current.onNameHover(false); }
      } else if (Math.abs(st.velocity) <= 0.05 && snapped && !st.idle && st.canShowName) {
        st.idle = true;
        st.lastShow = Math.round(st.target) % N;
        cb.current.onShowName(st.lastShow);
      }
      const hoverIdx = hovered ? (hovered.mesh.userData.index as number) : -1;
      const nameHover = !st.locked && hoverIdx >= 0 && st.velocityAbs < 0.08 && hoverIdx === st.lastShow;
      if (nameHover !== st.mouseIn) { st.mouseIn = nameHover; cb.current.onNameHover(nameHover); }

      document.body.style.cursor = st.locked ? '' : ptr.isDown ? 'grabbing' : hovered ? 'pointer' : 'grab';
      if (!st.locked && ptr.isDown && Math.abs(ptr.vx) > 4 && Math.random() < 0.15) sound.playWhoosh(1 + Math.min(Math.abs(ptr.vx) / 60, 0.6));

      const scaleBoost = 1 + Math.min(st.velocityAbs / 10, 0.185);
      planes.forEach((p, i) => {
        const prog = st.progress + p.introOffset * 10;
        const l = (-prog + i) % N;
        const x = Math.abs(l / N) > 0.5 ? l + N : l;
        p.mesh.position.set(x, 0, 0);
        p.mesh.scale.copy(oScale).multiplyScalar(scaleBoost);
        p.u.uVelocity.value = st.velocity;
        p.u.uHover.value = p.hover.value;

        // frustum cull like the reference (both edges projected)
        tmp.set(x - p.mesh.scale.x / 2, 0, 0).project(camera);
        const left = (tmp.x + 1) / 2;
        tmp.set(x + p.mesh.scale.x / 2, 0, 0).project(camera);
        const right = (tmp.x + 1) / 2;
        p.mesh.visible = right >= 0 && left <= 1 && p.u.uFold.value < 0.999;

      });

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('click', onClick);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      document.body.style.cursor = '';
      planes.forEach((p) => {
        gsap.killTweensOf([p, p.hover, p.u.uFold, p.u.uReveal, p.u.uBump]);
        (p.u.uPreview.value as THREE.Texture).dispose();
        p.mesh.material.dispose();
      });
      paper.dispose();
      geometry.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      apiRef.current = null;
    };
  }, [apiRef, N, members.map((m) => `${m.id}-${m.name}`).join('|')]);

  useEffect(() => {
    if (ready && startRef.current) {
      startRef.current();
      startRef.current = null;
    }
  }, [ready]);

  return <div ref={containerRef} className="fixed inset-0 touch-none" />;
};
