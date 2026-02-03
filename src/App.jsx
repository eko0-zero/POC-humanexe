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

// Position Y du sol — doit correspondre à plane.position.y dans la scène
const GROUND_Y = -1;

// Décalage vertical du mesh par rapport au corps physique.
// La boîte Cannon a une demi-hauteur de 0.5, donc son centre est à 0.5 au-dessus du sol.
// Si le modèle a son origine aux pieds, on décale de -0.5 pour qu'il touche le sol.
// Ajustez cette valeur si le modèle flotte encore ou s'enfonce.
const MODEL_Y_OFFSET = -0.5;

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
  renderer.setClearColor(0xffffff);
  renderer.setSize(width, height);
  return renderer;
}

function createLights(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 2.5);
  scene.add(ambient);

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
              node.material.shadowSide = THREE.FrontSide;
            }
          }
        });

        model.scale.set(1, 1, 0.5);
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
// HELPERS — monde physique Cannon.js
// ─────────────────────────────────────────────

function createPhysicsWorld() {
  const world = new World({
    gravity: new Vec3(0, -9.82, 0),
  });

  // Solver plus précis (moins de jitter)
  world.solver.iterations = 10;

  return world;
}

// Corps du sol : statique (masse = 0), plan infini
function createGroundBody() {
  const shape = new Plane();
  const body = new Body({ mass: 0 });
  body.addShape(shape);

  // Le plan Cannon pointe vers +Z par défaut → on le couche vers le haut
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  body.position.set(0, GROUND_Y, 0);

  return body;
}

// Corps du personnage : boîte englobante approximée
// On peut affiner les dimensions plus tard selon le modèle réel
function createCharacterBody(startY) {
  const halfExtents = new Vec3(0.4, 0.5, 0.3);
  const shape = new Box(halfExtents);

  const body = new Body({
    mass: 1, // masse > 0 → dynamique, affecté par la gravité
    linearDamping: 0.9, // friction de l'air (évite que le personnage glisse indéfiniment)
  });

  body.addShape(shape);

  // Position de départ : au-dessus du sol
  // Le centre de la boîte doit être à GROUND_Y + halfExtents.y
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

    // ── Scène Three.js ──
    const scene = new THREE.Scene();
    const camera = createCamera(width / height);
    const renderer = createRenderer(canvas, width, height);
    const { dirLight } = createLights(scene);
    createGround(scene);

    // ── Monde physique Cannon.js ──
    const world = createPhysicsWorld();

    // Sol physique
    const groundBody = createGroundBody();
    world.addBody(groundBody);

    // Corps du personnage — on le place un peu au-dessus du sol pour qu'il tombe
    const characterBody = createCharacterBody(GROUND_Y + 2);
    world.addBody(characterBody);

    // ── Modèle 3D ──
    const placeholder = createPlaceholderCube(scene);
    let mesh = placeholder;

    // Positionne le placeholder sur le corps physique pour le début
    mesh.position.set(
      characterBody.position.x,
      characterBody.position.y + MODEL_Y_OFFSET,
      characterBody.position.z,
    );

    loadModel(scene, placeholder).then((model) => {
      mesh = model;
      // Synchronise le modèle chargé sur la position actuelle du corps physique
      mesh.position.set(
        characterBody.position.x,
        characterBody.position.y + MODEL_Y_OFFSET,
        characterBody.position.z,
      );
    });

    renderer.render(scene, camera);

    // ─────────────────────────────────────────
    // RAYCASTER partagé
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
    // DRAG DE POSITION
    // ─────────────────────────────────────────
    // Pendant le drag on manipule le corps physique, pas le mesh.
    // On met la masse à 0 pour "neutraliser" la gravité, puis on la remet à 1
    // à la souris levée → le personnage tombe naturellement.
    let isDragging = false;
    let prevX = 0;
    let prevY = 0;

    const onMouseDown = (e) => {
      if (!isOverModel(e.clientX, e.clientY)) return;

      isDragging = true;
      prevX = e.clientX;
      prevY = e.clientY;

      // Neutralise la gravité pendant le drag
      characterBody.mass = 0;
      characterBody.updateMassProperties();

      // Tue la vitesse actuelle pour éviter les sauteries
      characterBody.velocity.set(0, 0, 0);
      characterBody.angularVelocity.set(0, 0, 0);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = (e.clientX - prevX) * DRAG_SENSITIVITY;
      const deltaY = (e.clientY - prevY) * DRAG_SENSITIVITY;

      // Déplace le corps physique (pas le mesh — la synchro se fait dans animate)
      characterBody.position.x += deltaX;
      characterBody.position.y -= deltaY;

      // Bloque au sol : le centre de la boîte ne peut pas descendre en dessous de GROUND_Y + halfExtents.y
      // halfExtents.y = 0.5 (défini dans createCharacterBody)
      const minY = GROUND_Y + 0.5;
      if (characterBody.position.y < minY) {
        characterBody.position.y = minY;
      }

      prevX = e.clientX;
      prevY = e.clientY;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;

      // Remet la masse → la gravité reprend, le personnage tombe
      characterBody.mass = 1;
      characterBody.updateMassProperties();
    };

    // ─────────────────────────────────────────
    // DROP DE FICHIER
    // ─────────────────────────────────────────
    const onDragOver = (e) => {
      e.preventDefault();
    };

    const onDrop = (e) => {
      e.preventDefault();
      if (!mesh) return;

      screenToNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(mouse, camera);
      const intersections = raycaster.intersectObjects([mesh], true);

      if (intersections.length > 0) {
        const fichiers = e.dataTransfer.files;
        console.log("✅ Drop sur le modèle");
        console.log(
          "   Objet touché :",
          intersections[0].object.name || "sans nom",
        );
        console.log("   Point 3D     :", intersections[0].point);
        if (fichiers.length > 0) {
          console.log("   Fichier      :", fichiers[0].name);
        }
      } else {
        console.log("❌ Drop hors du modèle — ignoré");
      }
    };

    // ─────────────────────────────────────────
    // LUMIÈRE suit le modèle
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
    let lastTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Calcul du delta temps en secondes
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05); // capped à 50ms pour éviter les big jumps
      lastTime = now;

      // Step du monde physique
      world.step(1 / 60, dt, 3);

      // Synchronise le mesh sur le corps physique
      if (mesh) {
        mesh.position.set(
          characterBody.position.x,
          characterBody.position.y + MODEL_Y_OFFSET,
          characterBody.position.z,
        );
        // On copie aussi la rotation si vous voulez que le personnage puisse culbuter
        // mesh.quaternion.copy(characterBody.quaternion);
      }

      updateLightTarget();
      renderer.render(scene, camera);
    };
    animate();

    // ─────────────────────────────────────────
    // RESIZE
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
    // CLEANUP
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
