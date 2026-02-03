import { useEffect, useRef } from "react";
import "./App.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { World, Vec3, Body, Plane, Box } from "cannon-es";

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const MODEL_PATH = new URL("./assets/3D/base.glb", import.meta.url).href;
const DRAG_SENSITIVITY = 0.005;
const GROUND_Y = -1;
const MODEL_Y_OFFSET = -0.5; // ajuster si le modèle flotte ou s'enfonce

// ─────────────────────────────────────────────
// HELPERS — scène Three.js
// ─────────────────────────────────────────────
function createCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(70, aspect);
  camera.position.set(0, 0.8, 2.3);
  camera.rotation.x = -0.1;
  return camera;
}

function createRenderer(canvas, width, height) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0xffffff); // fond gris clair
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
              node.material = node.material.clone(); // éviter de modifier l'original
              node.material.color.set(0xc0f5c7); // <-- couleur rouge
              node.material.shadowSide = THREE.FrontSide;
            }
          }
        });

        model.scale.set(1, 1, 0.5);
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

  const body = new Body({
    mass: 1,
    linearDamping: 0.9,
  });
  body.addShape(shape);
  body.position.set(0, startY, 0);
  return body;
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

    // --- Scène ---
    const scene = new THREE.Scene();
    const camera = createCamera(width / height);
    const renderer = createRenderer(canvas, width, height);
    const { dirLight } = createLights(scene);
    createGround(scene);

    // --- Monde physique ---
    const world = createPhysicsWorld();
    const groundBody = createGroundBody();
    world.addBody(groundBody);

    const characterBody = createCharacterBody(GROUND_Y + 2);
    world.addBody(characterBody);

    // --- Modèle 3D ---
    const placeholder = createPlaceholderCube(scene);
    let mesh = placeholder;
    let modelSize = new THREE.Vector3(1, 1, 1); // taille par défaut

    mesh.position.set(
      characterBody.position.x,
      characterBody.position.y + MODEL_Y_OFFSET,
      characterBody.position.z,
    );

    loadModel(scene, placeholder).then((model) => {
      mesh = model;
      // calculer la taille du modèle pour clamp correct
      const box = new THREE.Box3().setFromObject(mesh);
      box.getSize(modelSize);

      mesh.position.set(
        characterBody.position.x,
        characterBody.position.y + MODEL_Y_OFFSET,
        characterBody.position.z,
      );
    });

    // --- Raycaster ---
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

    // --- Clamp par les bords ---
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

      // gauche/droite (bras)
      characterBody.position.x = THREE.MathUtils.clamp(
        characterBody.position.x,
        -halfW + halfModelW,
        halfW - halfModelW,
      );

      // haut (tête)
      const maxY = halfH - modelHeight / 2;
      if (characterBody.position.y > maxY) characterBody.position.y = maxY;
    };

    // --- Drag ---
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    const onMouseDown = (e) => {
      if (!isOverModel(e.clientX, e.clientY)) return;
      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;

      characterBody.mass = 0;
      characterBody.updateMassProperties();
      characterBody.velocity.set(0, 0, 0);
      characterBody.angularVelocity.set(0, 0, 0);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = (e.clientX - prevX) * DRAG_SENSITIVITY;
      const deltaY = (e.clientY - prevY) * DRAG_SENSITIVITY;

      characterBody.position.x += deltaX;
      characterBody.position.y -= deltaY;

      // sol
      const minY = GROUND_Y + 0.5;
      if (characterBody.position.y < minY) characterBody.position.y = minY;

      clampByModelEdges();

      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      characterBody.mass = 1;
      characterBody.updateMassProperties();
    };

    // --- Drop ---
    const onDragOver = (e) => e.preventDefault();
    const onDrop = (e) => {
      e.preventDefault();
      if (!mesh) return;

      screenToNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(mouse, camera);
      const intersections = raycaster.intersectObjects([mesh], true);
    };

    // --- Lumière ---
    const updateLightTarget = () => {
      if (!mesh) return;
      dirLight.target.position.copy(mesh.position);
      dirLight.target.updateMatrixWorld();
    };

    // --- Animate ---
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

    // --- Resize ---
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    // --- Events ---
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchstart", onMouseDown);
    window.addEventListener("touchmove", onMouseMove);
    window.addEventListener("touchend", onMouseUp);
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("dragover", onDragOver);
    renderer.domElement.addEventListener("drop", onDrop);

    // --- Cleanup --
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
