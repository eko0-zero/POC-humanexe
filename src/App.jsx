import { useEffect, useRef } from "react";
import "./App.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { World, Vec3, Body, Plane, Box } from "cannon-es";

const MODEL_PATH = new URL("./assets/3D/base.glb", import.meta.url).href;
const GROUND_Y = -1;
const MODEL_Y_OFFSET = -0.5;
const HEAD_OFFSET_Y = 0.6; // La tête est à 0.6 au-dessus du centre du corps

const BoneState = {
  PHYSICS: "physics",
  DRAG: "drag",
  RECOVER: "recover",
};

function recoverUpright(body) {
  const uprightQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, 0),
  );

  const currentQuat = new THREE.Quaternion(
    body.quaternion.x,
    body.quaternion.y,
    body.quaternion.z,
    body.quaternion.w,
  );

  currentQuat.slerp(uprightQuat, 0.1);

  body.quaternion.set(
    currentQuat.x,
    currentQuat.y,
    currentQuat.z,
    currentQuat.w,
  );

  body.velocity.scale(0.96, body.velocity);
  body.angularVelocity.scale(0.92, body.angularVelocity);
}

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
    linearDamping: 0.15,
    angularDamping: 0.4,
    restitution: 0, // Pas de rebond
  });
  body.addShape(shape);
  body.position.set(0, startY, 0);
  return body;
}

function getMouseOnPlane(clientX, clientY, camera, renderer, planePoint) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

  const normal = new THREE.Vector3();
  camera.getWorldDirection(normal);
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(normal, planePoint);

  const target = new THREE.Vector3();
  ray.ray.intersectPlane(plane, target);

  return target;
}

const App = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    const camera = createCamera(width / height);
    const renderer = createRenderer(canvas, width, height);
    const { dirLight } = createLights(scene);
    createGround(scene);

    const world = createPhysicsWorld();
    const groundBody = createGroundBody();
    world.addBody(groundBody);

    const characterBody = createCharacterBody(GROUND_Y + 2);
    world.addBody(characterBody);

    let boneState = BoneState.PHYSICS;

    // Position désirée de la TÊTE (c'est ça qu'on va contrôler)
    const desiredHeadPos = new THREE.Vector3(0, 1, 0);

    const placeholder = createPlaceholderCube(scene);
    let mesh = placeholder;
    let modelSize = new THREE.Vector3(1, 1, 1);
    let skeleton = null;
    let testBone = null;

    mesh.position.set(
      characterBody.position.x,
      characterBody.position.y + MODEL_Y_OFFSET,
      characterBody.position.z,
    );

    loadModel(scene, placeholder).then((model) => {
      mesh = model;
      const box = new THREE.Box3().setFromObject(mesh);
      box.getSize(modelSize);

      mesh.traverse((o) => {
        if (o.isSkinnedMesh && o.skeleton) {
          skeleton = o.skeleton;
        }
      });

      if (skeleton) {
        testBone =
          skeleton.getBoneByName("Spine") ||
          skeleton.getBoneByName("spine") ||
          skeleton.getBoneByName("Chest") ||
          skeleton.bones[0];
      }

      mesh.position.set(
        characterBody.position.x,
        characterBody.position.y + MODEL_Y_OFFSET,
        characterBody.position.z,
      );
    });

    renderer.render(scene, camera);

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

    const getViewBounds = () => {
      const distance = camera.position.z - mesh.position.z;
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const viewHeight = 2 * Math.tan(vFov / 2) * distance;
      const viewWidth = viewHeight * camera.aspect;
      return { halfW: viewWidth / 2, halfH: viewHeight / 2 };
    };

    const clampCharacterWithinBounds = () => {
      if (!mesh) return;

      const { halfW, halfH } = getViewBounds();
      const halfModelW = modelSize.x / 2;
      const modelHeight = modelSize.y;
      const bodyHalfHeight = 0.5; // Box half-height from createCharacterBody

      // Limites X (gauche/droite)
      const minX = -halfW + halfModelW * 0.5;
      const maxX = halfW - halfModelW * 0.5;

      // Limites Y (haut/bas) - le corps ne peut pas passer sous le sol
      const minY = GROUND_Y + bodyHalfHeight;
      const maxY = halfH - modelHeight / 4;

      // Clamp position
      const clampedX = THREE.MathUtils.clamp(
        characterBody.position.x,
        minX,
        maxX,
      );
      const clampedY = THREE.MathUtils.clamp(
        characterBody.position.y,
        minY,
        maxY,
      );

      // Si on a dû clamper, on met à jour la position et on annule la vélocité dans cette direction
      if (clampedX !== characterBody.position.x) {
        characterBody.position.x = clampedX;
        characterBody.velocity.x = 0;
      }

      if (clampedY !== characterBody.position.y) {
        characterBody.position.y = clampedY;
        characterBody.velocity.y = 0;
      }
    };

    let isDragging = false;
    const dragPlanePoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3(); // Offset souris vs tête au mousedown

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
      boneState = BoneState.DRAG;

      // Position actuelle de la tête en 3D
      const headWorldY = characterBody.position.y + HEAD_OFFSET_Y;

      // Plan de projection au niveau de la tête
      dragPlanePoint.set(
        characterBody.position.x,
        headWorldY,
        characterBody.position.z,
      );

      // Où la souris intersecte ce plan
      const mouseWorld = getMouseOnPlane(
        clientX,
        clientY,
        camera,
        renderer,
        dragPlanePoint,
      );

      // Offset = tête - souris (pour garder le même point de contact)
      dragOffset.set(
        characterBody.position.x - mouseWorld.x,
        headWorldY - mouseWorld.y,
        0,
      );

      characterBody.velocity.set(0, 0, 0);
      characterBody.angularVelocity.set(0, 0, 0);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const { clientX, clientY } = getClientPos(e);

      // Plan au niveau de la tête actuelle
      const headWorldY = characterBody.position.y + HEAD_OFFSET_Y;
      dragPlanePoint.set(
        characterBody.position.x,
        headWorldY,
        characterBody.position.z,
      );

      // Intersection souris avec le plan
      const mouseWorld = getMouseOnPlane(
        clientX,
        clientY,
        camera,
        renderer,
        dragPlanePoint,
      );

      // Position désirée de la tête = souris + offset
      desiredHeadPos.x = mouseWorld.x + dragOffset.x;
      desiredHeadPos.y = mouseWorld.y + dragOffset.y;
      desiredHeadPos.z = characterBody.position.z;

      // Clamp pour rester dans le cadre
      const { halfW, halfH } = getViewBounds();
      const halfModelW = modelSize.x / 2;
      const modelHeight = modelSize.y;

      desiredHeadPos.x = THREE.MathUtils.clamp(
        desiredHeadPos.x,
        -halfW + halfModelW * 0.5,
        halfW - halfModelW * 0.5,
      );

      desiredHeadPos.y = THREE.MathUtils.clamp(
        desiredHeadPos.y,
        -halfH + modelHeight / 2,
        halfH - modelHeight / 4,
      );
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      boneState = BoneState.RECOVER;
    };

    const onDragOver = (e) => e.preventDefault();

    const onDrop = (e) => {
      e.preventDefault();
      if (!mesh) return;
      screenToNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(mouse, camera);
      raycaster.intersectObjects([mesh], true);
    };

    const updateLightTarget = () => {
      if (!mesh) return;
      dirLight.target.position.copy(mesh.position);
      dirLight.target.updateMatrixWorld();
    };

    let animId;
    let lastTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (boneState === BoneState.DRAG) {
        const bodyHalfHeight = 0.5;
        const minY = GROUND_Y + bodyHalfHeight;

        const stiffness = 600;
        const damping = 50;

        // Position actuelle de la tête
        const currentHeadX = characterBody.position.x;
        const currentHeadY = characterBody.position.y + HEAD_OFFSET_Y;

        // Calcul des différences
        const diffX = desiredHeadPos.x - currentHeadX;
        const diffY = desiredHeadPos.y - currentHeadY;

        // Si on est au sol, verrouille la position Y
        if (characterBody.position.y <= minY) {
          characterBody.position.y = minY;
          characterBody.velocity.y = 0;

          // Force uniquement horizontale
          const forceX = diffX * stiffness - characterBody.velocity.x * damping;
          characterBody.velocity.x += (forceX / characterBody.mass) * dt;
        } else {
          // En l'air, applique les deux forces
          const forceX = diffX * stiffness - characterBody.velocity.x * damping;
          const forceY = diffY * stiffness - characterBody.velocity.y * damping;

          characterBody.velocity.x += (forceX / characterBody.mass) * dt;
          characterBody.velocity.y += (forceY / characterBody.mass) * dt;
        }
      }

      if (boneState === BoneState.RECOVER) {
        recoverUpright(characterBody);

        if (
          characterBody.velocity.length() < 0.05 &&
          characterBody.angularVelocity.length() < 0.05
        ) {
          boneState = BoneState.PHYSICS;
        }
      }

      world.step(1 / 60, dt, 3);

      // Bloque Z à 0
      characterBody.position.z = 0;

      // Applique les contraintes de limites du cadre et empêche les rebonds
      clampCharacterWithinBounds();

      if (testBone) {
        const tiltX = THREE.MathUtils.clamp(
          -characterBody.velocity.y * 0.15,
          -0.6,
          0.6,
        );

        const tiltZ = THREE.MathUtils.clamp(
          characterBody.velocity.x * 0.15,
          -0.6,
          0.6,
        );

        testBone.rotation.x += (tiltX - testBone.rotation.x) * 0.15;
        testBone.rotation.z += (tiltZ - testBone.rotation.z) * 0.15;
      }

      if (mesh) {
        mesh.position.x = characterBody.position.x;
        mesh.position.y = characterBody.position.y + MODEL_Y_OFFSET;
        mesh.position.z = characterBody.position.z;
      }

      updateLightTarget();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchstart", onMouseDown, { passive: false });
    window.addEventListener("touchmove", onMouseMove, { passive: false });
    window.addEventListener("touchend", onMouseUp);
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("dragover", onDragOver);
    renderer.domElement.addEventListener("drop", onDrop);

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
