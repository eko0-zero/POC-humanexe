import { useEffect, useRef } from "react";
import "./App.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { World, Vec3, Body, Plane, Box } from "cannon-es";

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const MODEL_PATH = new URL("./assets/3D/base.glb", import.meta.url).href;
const GROUND_Y = -1;
const MODEL_Y_OFFSET = -0.5;

// ─────────────────────────────────────────────
// HELPERS — scène Three.js
// ─────────────────────────────────────────────
function createCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(55, aspect);
  camera.position.set(0, 0.8, 3);
  camera.rotation.x = -0.1;
  return camera;
}

function createRenderer(canvas, width, height) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0xffffff);
  renderer.setSize(width, height);
  return renderer;
}

function createLights(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 2.5);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 10);
  dirLight.position.set(5, 8, 5);
  dirLight.target.position.set(0, 0, 0);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(6048, 6048);
  dirLight.shadow.camera.left = -10;
  dirLight.shadow.camera.right = 10;
  dirLight.shadow.camera.top = 10;
  dirLight.shadow.camera.bottom = -10;
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = 100;
  scene.add(dirLight);
  scene.add(dirLight.target);

  return { ambient, dirLight };
}

function createGround(scene) {
  const geometry = new THREE.PlaneGeometry(10, 10);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = GROUND_Y;
  plane.receiveShadow = true;
  scene.add(plane);
  return plane;
}

function createPlaceholderCube(scene) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshPhongMaterial({ color: 0x0000ff });
  const cube = new THREE.Mesh(geometry, material);
  cube.castShadow = true;
  scene.add(cube);
  return cube;
}

function loadModel(scene, placeholderCube) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      MODEL_PATH,
      (gltf) => {
        scene.remove(placeholderCube);
        const model = gltf.scene;
        model.castShadow = true;

        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = false;
            if (node.material) {
              node.material = node.material.clone();
              node.material.color.set(0xc0f5c7);
              node.material.shadowSide = THREE.FrontSide;
            }
          }
        });

        model.scale.set(1, 1, 0.8);
        scene.add(model);
        resolve(model);
      },
      undefined,
      (error) => {
        console.error("Erreur chargement modèle :", error);
        reject(error);
      },
    );
  });
}

// ─────────────────────────────────────────────
// HELPERS — monde physique Cannon.js
// ─────────────────────────────────────────────
function createPhysicsWorld() {
  const world = new World({
    gravity: new Vec3(0, -9.82, 0),
  });
  world.solver.iterations = 10;
  return world;
}

function createGroundBody() {
  const shape = new Plane();
  const body = new Body({ mass: 0 });
  body.addShape(shape);
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  body.position.set(0, GROUND_Y, 0);
  return body;
}

function createCharacterBody(startY) {
  const halfExtents = new Vec3(0.4, 0.5, 0.3);
  const shape = new Box(halfExtents);
  const body = new Body({ mass: 1, linearDamping: 0.9 });
  body.addShape(shape);
  body.position.set(0, startY, 0);
  return body;
}

// ─────────────────────────────────────────────
// HELPER — projection souris → point 3D
// ─────────────────────────────────────────────
// Crée un plan perpendiculaire à la caméra passant par un point donné.
// Puis on intersecte le rayon souris avec ce plan.
// Marche peu importe la rotation de la caméra.
function getMouseOnPlane(clientX, clientY, camera, renderer, planePoint) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

  // Rayon depuis la caméra vers la souris
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

  // Plan perpendiculaire à la caméra, passant par planePoint
  // La normale du plan = direction où regarde la caméra
  const normal = new THREE.Vector3();
  camera.getWorldDirection(normal);
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(normal, planePoint);

  // Intersection rayon ↔ plan
  const target = new THREE.Vector3();
  ray.ray.intersectPlane(plane, target);

  return target;
}

// ─────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────
const App = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // ── Scène ──
    const scene = new THREE.Scene();
    const camera = createCamera(width / height);
    const renderer = createRenderer(canvas, width, height);
    const { dirLight } = createLights(scene);
    createGround(scene);

    // ── Physique ──
    const world = createPhysicsWorld();
    const groundBody = createGroundBody();
    world.addBody(groundBody);

    const characterBody = createCharacterBody(GROUND_Y + 2);
    world.addBody(characterBody);

    // ── Modèle ──
    const placeholder = createPlaceholderCube(scene);
    let mesh = placeholder;
    let modelSize = new THREE.Vector3(1, 1, 1);

    mesh.position.set(
      characterBody.position.x,
      characterBody.position.y + MODEL_Y_OFFSET,
      characterBody.position.z,
    );

    loadModel(scene, placeholder).then((model) => {
      mesh = model;
      const box = new THREE.Box3().setFromObject(mesh);
      box.getSize(modelSize);
      mesh.position.set(
        characterBody.position.x,
        characterBody.position.y + MODEL_Y_OFFSET,
        characterBody.position.z,
      );
    });

    renderer.render(scene, camera);

    // ─────────────────────────────────────────
    // RAYCASTER
    // ─────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const screenToNDC = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const isOverModel = (clientX, clientY) => {
      if (!mesh) return false;
      screenToNDC(clientX, clientY);
      raycaster.setFromCamera(mouse, camera);
      return raycaster.intersectObjects([mesh], true).length > 0;
    };

    // ─────────────────────────────────────────
    // CLAMP — bords de l'écran
    // ─────────────────────────────────────────
    const getViewBounds = () => {
      const distance = camera.position.z - mesh.position.z;
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const viewHeight = 2 * Math.tan(vFov / 2) * distance;
      const viewWidth = viewHeight * camera.aspect;
      return { halfW: viewWidth / 2, halfH: viewHeight / 2 };
    };

    const clampByModelEdges = () => {
      if (!mesh) return;
      const { halfW, halfH } = getViewBounds();
      const halfModelW = modelSize.x / 2;
      const modelHeight = modelSize.y;

      characterBody.position.x = THREE.MathUtils.clamp(
        characterBody.position.x,
        -halfW + halfModelW,
        halfW - halfModelW,
      );

      const maxY = halfH - modelHeight / 2;
      if (characterBody.position.y > maxY) characterBody.position.y = maxY;
    };

    // ─────────────────────────────────────────
    // DRAG — projection 1:1
    // ─────────────────────────────────────────
    let isDragging = false;
    // Offset entre le point où on a cliqué et le centre du corps physique,
    // pour que la souris reste exactement où elle était au mousedown
    const dragOffset = new THREE.Vector3();
    // Point 3D utilisé comme référence pour le plan de projection (fixé au mousedown)
    const dragPlanePoint = new THREE.Vector3();

    const getClientPos = (e) => {
      if (e.touches && e.touches.length > 0) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
      }
      return { clientX: e.clientX, clientY: e.clientY };
    };

    const onMouseDown = (e) => {
      const { clientX, clientY } = getClientPos(e);
      if (!isOverModel(clientX, clientY)) return;

      isDragging = true;

      // On fixe le point de référence du plan sur la position actuelle du corps
      dragPlanePoint.set(
        characterBody.position.x,
        characterBody.position.y,
        characterBody.position.z,
      );

      // Où est la souris en 3D sur ce plan ?
      const mouseWorld = getMouseOnPlane(
        clientX,
        clientY,
        camera,
        renderer,
        dragPlanePoint,
      );

      // Offset = corps - souris → pour ne pas faire sauter le modèle au mousedown
      dragOffset.set(
        characterBody.position.x - mouseWorld.x,
        characterBody.position.y - mouseWorld.y,
        0,
      );

      // Neutralise la gravité
      characterBody.mass = 0;
      characterBody.updateMassProperties();
      characterBody.velocity.set(0, 0, 0);
      characterBody.angularVelocity.set(0, 0, 0);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const { clientX, clientY } = getClientPos(e);

      // Projette la souris sur le même plan (même point de référence)
      const mouseWorld = getMouseOnPlane(
        clientX,
        clientY,
        camera,
        renderer,
        dragPlanePoint,
      );

      // Position du corps = souris + offset
      characterBody.position.x = mouseWorld.x + dragOffset.x;
      characterBody.position.y = mouseWorld.y + dragOffset.y;

      // Bloque au sol
      const minY = GROUND_Y + 0.5;
      if (characterBody.position.y < minY) characterBody.position.y = minY;

      clampByModelEdges();
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;

      // Remet la masse → gravité reprend
      characterBody.mass = 1;
      characterBody.updateMassProperties();
    };

    // ─────────────────────────────────────────
    // DROP DE FICHIER
    // ─────────────────────────────────────────
    const onDragOver = (e) => e.preventDefault();

    const onDrop = (e) => {
      e.preventDefault();
      if (!mesh) return;
      screenToNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(mouse, camera);
      raycaster.intersectObjects([mesh], true);
    };

    // ─────────────────────────────────────────
    // LUMIÈRE suit le modèle
    // ─────────────────────────────────────────
    const updateLightTarget = () => {
      if (!mesh) return;
      dirLight.target.position.copy(mesh.position);
      dirLight.target.updateMatrixWorld();
    };

    // ─────────────────────────────────────────
    // BOUCLE D'ANIMATION
    // ─────────────────────────────────────────
    let animId;
    let lastTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      world.step(1 / 60, dt, 3);

      if (mesh) {
        mesh.position.set(
          characterBody.position.x,
          characterBody.position.y + MODEL_Y_OFFSET,
          characterBody.position.z,
        );
      }

      updateLightTarget();
      renderer.render(scene, camera);
    };
    animate();

    // ─────────────────────────────────────────
    // RESIZE
    // ─────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    // ─────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchstart", onMouseDown, { passive: false });
    window.addEventListener("touchmove", onMouseMove, { passive: false });
    window.addEventListener("touchend", onMouseUp);
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("dragover", onDragOver);
    renderer.domElement.addEventListener("drop", onDrop);

    // ─────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchstart", onMouseDown);
      window.removeEventListener("touchmove", onMouseMove);
      window.removeEventListener("touchend", onMouseUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("dragover", onDragOver);
      renderer.domElement.removeEventListener("drop", onDrop);
      renderer.dispose();
    };
  }, []);

  return (
    <main className="relative w-full h-screen">
      <h1 className="absolute p-5">Human.exe POC</h1>
      <canvas ref={canvasRef} />
    </main>
  );
};

export default App;
