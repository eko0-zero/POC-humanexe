import { useEffect, useRef } from "react";
import "./App.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const MODEL_PATH = new URL("./assets/3D/base.glb", import.meta.url).href;
const DRAG_SENSITIVITY = 0.005;

// ─────────────────────────────────────────────
// HELPERS — créent chaque partie de la scène
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
  renderer.setClearColor(0xffffff);
  renderer.setSize(width, height);
  return renderer;
}

function createLights(scene) {
  // Lumière ambiante
  const ambient = new THREE.AmbientLight(0xffffff, 2.5);
  scene.add(ambient);

  // Lumière directionnelle (soleil)
  const dirLight = new THREE.DirectionalLight(0xffffff, 5);
  dirLight.position.set(5, 8, 5);
  dirLight.target.position.set(0, 0, 0);
  dirLight.castShadow = true;

  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -10;
  dirLight.shadow.camera.right = 10;
  dirLight.shadow.camera.top = 10;
  dirLight.shadow.camera.bottom = -10;
  dirLight.shadow.camera.near = 0.1;
  dirLight.shadow.camera.far = 100;
  dirLight.shadow.bias = 0.0001;
  dirLight.shadow.normalBias = 0.05;

  scene.add(dirLight);
  scene.add(dirLight.target);

  return { ambient, dirLight };
}

function createGround(scene) {
  const geometry = new THREE.PlaneGeometry(10, 10);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const plane = new THREE.Mesh(geometry, material);

  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -1;
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
        // Enlever le cube temporaire
        scene.remove(placeholderCube);

        const model = gltf.scene;
        model.castShadow = true;

        // Appliquer les ombres à chaque mesh du modèle
        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = false;
            if (node.material) {
              node.material = node.material.clone();
              node.material.shadowSide = THREE.FrontSide;
            }
          }
        });

        model.scale.set(1, 1, 0.5);
        model.position.set(0, -1, 0);
        scene.add(model);

        console.log("Modèle 3D chargé");
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
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────
const App = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // ── Initialisation de la scène ──
    const scene = new THREE.Scene();
    const camera = createCamera(width / height);
    const renderer = createRenderer(canvas, width, height);
    const { dirLight } = createLights(scene);
    createGround(scene);

    // ── Modèle 3D : cube par défaut, puis GLTF ──
    const placeholder = createPlaceholderCube(scene);
    let mesh = placeholder; // référence active vers l'objet courant

    loadModel(scene, placeholder).then((model) => {
      mesh = model;
    });

    // Premier rendu
    renderer.render(scene, camera);

    // ─────────────────────────────────────────
    // RAYCASTER partagé (drag + drop)
    // ─────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Convertit une position écran en NDC (-1 → 1)
    const screenToNDC = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    // Teste si un point écran touche le modèle
    const isOverModel = (clientX, clientY) => {
      if (!mesh) return false;
      screenToNDC(clientX, clientY);
      raycaster.setFromCamera(mouse, camera);
      return raycaster.intersectObjects([mesh], true).length > 0;
    };

    // ─────────────────────────────────────────
    // DRAG DE POSITION (clic + souris)
    // ─────────────────────────────────────────
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    const onMouseDown = (e) => {
      // On ne démarre le drag que si le clic est sur le modèle
      if (!isOverModel(e.clientX, e.clientY)) return;

      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onMouseMove = (e) => {
      if (!isDragging || !mesh) return;

      mesh.position.x += (e.clientX - prevX) * DRAG_SENSITIVITY;
      mesh.position.y -= (e.clientY - prevY) * DRAG_SENSITIVITY;

      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onDragOver = (e) => {
      e.preventDefault(); // obligatoire pour autoriser le drop
    };

    const onDrop = (e) => {
      e.preventDefault();
      if (!mesh) return;

      // Réutilise screenToNDC + raycaster déjà déclarés
      screenToNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(mouse, camera);
      const intersections = raycaster.intersectObjects([mesh], true);
    };

    // ─────────────────────────────────────────
    // LUMIÈRE DIRECTIONNELLE suit le modèle
    // ─────────────────────────────────────────
    const updateLightTarget = () => {
      if (!mesh) return;
      dirLight.target.position.copy(mesh.position);
      dirLight.target.updateMatrixWorld();
      dirLight.shadow.camera.position.copy(dirLight.position);
      dirLight.shadow.camera.lookAt(mesh.position);
      dirLight.shadow.camera.updateProjectionMatrix();
    };

    // ─────────────────────────────────────────
    // BOUCLE D'ANIMATION
    // ─────────────────────────────────────────
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      updateLightTarget();
      renderer.render(scene, camera);
    };
    animate();

    // ─────────────────────────────────────────
    // REDIMENSIONNEMENT DE LA FENÊTRE
    // ─────────────────────────────────────────
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    // ─────────────────────────────────────────
    // ABONNEMENT AUX ÉVÉNEMENTS
    // ─────────────────────────────────────────
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("dragover", onDragOver);
    renderer.domElement.addEventListener("drop", onDrop);

    // ─────────────────────────────────────────
    // CLEANUP (unmount du composant)
    // ─────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
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
