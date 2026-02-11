import { useEffect, useRef, useState } from "react";
import "./App.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { World, Vec3, Body, Plane, Box } from "cannon-es";
import ButtonAddItem from "./ui/ButtonAddItem";
import Trash from "./ui/Trashh";

// Chemin d'accès au modèle 3D
const MODEL_PATH = new URL("./assets/3D/test.glb", import.meta.url).href;
// Position Y du sol
const GROUND_Y = -1;
// Décalage vertical du modèle par rapport au corps physique
const MODEL_Y_OFFSET = -0.5;
// Décalage vertical de la tête par rapport au centre du corps
const HEAD_OFFSET_Y = 0.6;

// Énumération des états possibles du corps/os
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
    restitution: 0,
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
  const spawnedItemsRef = useRef([]);
  const sceneRef = useRef(null);
  const worldRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const modelSizeRef = useRef(new THREE.Vector3(1, 1, 1));
  const meshRef = useRef(null);
  const characterBodyRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // === Initialisation Three.js ===
    // Création de la scène 3D principale, de la caméra et du renderer.
    // La scène contient tous les objets visibles.
    // La caméra définit le point de vue.
    // Le renderer dessine le tout dans le canvas.
    const scene = new THREE.Scene();
    const camera = createCamera(width / height);
    const renderer = createRenderer(canvas, width, height);
    const { dirLight } = createLights(scene);
    createGround(scene);

    // Stocke les références pour le composant enfant
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // === Initialisation physique ===
    // Création du monde physique avec cannon-es.
    // Ce monde gère la gravité, les collisions et les forces.
    // Les bodies (sol + personnage) sont simulés ici.
    const world = createPhysicsWorld();
    worldRef.current = world;

    const groundBody = createGroundBody();
    world.addBody(groundBody);

    const characterBody = createCharacterBody(GROUND_Y + 2);
    world.addBody(characterBody);
    characterBodyRef.current = characterBody;

    let boneState = BoneState.PHYSICS;
    const desiredHeadPos = new THREE.Vector3(0, 1, 0);

    const placeholder = createPlaceholderCube(scene);
    let mesh = placeholder;
    let modelSize = new THREE.Vector3(1, 1, 1);
    let skeleton = null;
    let testBone = null;
    let headBone = null;
    let leftArmBoneTop = null;
    let leftArmBone = null;
    let rightArmBoneTop = null;
    let rightArmBone = null;
    const leftArmRest = new THREE.Euler();
    const leftArmRestTop = new THREE.Euler();
    const rightArmRest = new THREE.Euler();
    const rightArmRestTop = new THREE.Euler();

    const armSpringBottom = { angleZ: 0, velZ: 0, angleX: 0, velX: 0 };
    const armSpringTop = { angleZ: 0, velZ: 0, angleX: 0, velX: 0 };

    mesh.position.set(
      characterBody.position.x,
      characterBody.position.y + MODEL_Y_OFFSET,
      characterBody.position.z,
    );

    // === Chargement du modèle principal ===
    // Chargement du modèle GLB.
    // Une fois chargé :
    // - On récupère sa taille
    // - On extrait le skeleton
    // - On stocke certaines bones (tête, bras)
    // Cela permet ensuite d'animer certaines parties dynamiquement.
    loadModel(scene, placeholder)
      .then((model) => {
        mesh = model;
        meshRef.current = mesh;
        const box = new THREE.Box3().setFromObject(mesh);
        box.getSize(modelSize);
        modelSizeRef.current.copy(modelSize);

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
          console.log(skeleton.bones.map((bone) => bone.name));

          headBone =
            skeleton.getBoneByName("head") ||
            skeleton.getBoneByName("Head") ||
            skeleton.getBoneByName("mixamorigHead");

          rightArmBoneTop = skeleton.getBoneByName("body001");
          rightArmBone = skeleton.getBoneByName("body002");
          leftArmBoneTop = skeleton.getBoneByName("top-armr_1");
          leftArmBone = skeleton.getBoneByName("bottom-armr");

          if (leftArmBone) leftArmRest.copy(leftArmBone.rotation);
          if (leftArmBoneTop) leftArmRestTop.copy(leftArmBoneTop.rotation);
          if (rightArmBone) rightArmRest.copy(rightArmBone.rotation);
          if (rightArmBoneTop) rightArmRestTop.copy(rightArmBoneTop.rotation);
        }

        mesh.position.set(
          characterBody.position.x,
          characterBody.position.y + MODEL_Y_OFFSET,
          characterBody.position.z,
        );

        console.log("✅ Modèle principal chargé");
        setIsReady(true);
      })
      .catch((err) => {
        console.error("Erreur chargement modèle principal:", err);
        setIsReady(true); // Permet quand même de continuer
      });

    renderer.render(scene, camera);

    // === Raycasting ===
    // Le raycasting permet de détecter les interactions souris/touch
    // avec le modèle 3D (ex: cliquer sur la tête).
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const screenToNDC = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const isOverHead = (clientX, clientY) => {
      if (!mesh) return false;
      screenToNDC(clientX, clientY);
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects([mesh], true);
      if (intersects.length === 0) return false;

      const hitPoint = intersects[0].point;

      if (headBone) {
        const headWorldPos = new THREE.Vector3();
        headBone.getWorldPosition(headWorldPos);
        const HEAD_RADIUS = 0.7;
        return hitPoint.distanceTo(headWorldPos) < HEAD_RADIUS;
      }

      const headThresholdY =
        characterBody.position.y + MODEL_Y_OFFSET + modelSize.y * 0.7;
      return hitPoint.y >= headThresholdY;
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
      const bodyHalfHeight = 0.5;

      const minX = -halfW + halfModelW * 0.5;
      const maxX = halfW - halfModelW * 0.5;

      const minY = GROUND_Y + bodyHalfHeight;
      const maxY = halfH - modelHeight / 4;

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
    const dragOffset = new THREE.Vector3();

    const getClientPos = (e) => {
      if (e.touches && e.touches.length > 0) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
      }
      return { clientX: e.clientX, clientY: e.clientY };
    };

    const onMouseDown = (e) => {
      const { clientX, clientY } = getClientPos(e);
      if (!isOverHead(clientX, clientY)) return;

      isDragging = true;
      boneState = BoneState.DRAG;

      const headWorldY = characterBody.position.y + HEAD_OFFSET_Y;

      dragPlanePoint.set(
        characterBody.position.x,
        headWorldY,
        characterBody.position.z,
      );

      const mouseWorld = getMouseOnPlane(
        clientX,
        clientY,
        camera,
        renderer,
        dragPlanePoint,
      );

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

      const headWorldY = characterBody.position.y + HEAD_OFFSET_Y;
      dragPlanePoint.set(
        characterBody.position.x,
        headWorldY,
        characterBody.position.z,
      );

      const mouseWorld = getMouseOnPlane(
        clientX,
        clientY,
        camera,
        renderer,
        dragPlanePoint,
      );

      desiredHeadPos.x = mouseWorld.x + dragOffset.x;
      desiredHeadPos.y = mouseWorld.y + dragOffset.y;
      desiredHeadPos.z = characterBody.position.z;

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

    // === Boucle d'animation ===
    let animId;
    let lastTime = performance.now();

    // === Boucle d'animation principale ===
    // Cette fonction est appelée à chaque frame (~60fps).
    // Elle met à jour :
    // - La physique
    // - Les animations des bones
    // - Les objets spawnés
    // - Le rendu final
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

        const currentHeadX = characterBody.position.x;
        const currentHeadY = characterBody.position.y + HEAD_OFFSET_Y;

        const diffX = desiredHeadPos.x - currentHeadX;
        const diffY = desiredHeadPos.y - currentHeadY;

        if (characterBody.position.y <= minY) {
          characterBody.position.y = minY;
          characterBody.velocity.y = 0;

          const forceX = diffX * stiffness - characterBody.velocity.x * damping;
          characterBody.velocity.x += (forceX / characterBody.mass) * dt;
        } else {
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

      // Avance la simulation physique d'un pas.
      // 1/60 = simulation cible 60fps.
      world.step(1 / 60, dt, 3);

      characterBody.position.z = 0;

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

      if (leftArmBone || rightArmBone || leftArmBoneTop || rightArmBoneTop) {
        const MAX_ARM_ANGLE = 1.2;

        const targetZ = THREE.MathUtils.clamp(
          -characterBody.velocity.x * 0.5,
          -MAX_ARM_ANGLE,
          MAX_ARM_ANGLE,
        );
        const targetX = THREE.MathUtils.clamp(
          characterBody.velocity.y * 0.3,
          -MAX_ARM_ANGLE,
          MAX_ARM_ANGLE,
        );

        const BOT_STIFFNESS = 45;
        const BOT_DAMPING = 6;

        const fBotZ =
          (targetZ - armSpringBottom.angleZ) * BOT_STIFFNESS -
          armSpringBottom.velZ * BOT_DAMPING;
        armSpringBottom.velZ += fBotZ * dt;
        armSpringBottom.angleZ += armSpringBottom.velZ * dt;
        armSpringBottom.angleZ = THREE.MathUtils.clamp(
          armSpringBottom.angleZ,
          -MAX_ARM_ANGLE,
          MAX_ARM_ANGLE,
        );

        const fBotX =
          (targetX - armSpringBottom.angleX) * BOT_STIFFNESS -
          armSpringBottom.velX * BOT_DAMPING;
        armSpringBottom.velX += fBotX * dt;
        armSpringBottom.angleX += armSpringBottom.velX * dt;
        armSpringBottom.angleX = THREE.MathUtils.clamp(
          armSpringBottom.angleX,
          -MAX_ARM_ANGLE,
          MAX_ARM_ANGLE,
        );

        const TOP_STIFFNESS = 30;
        const TOP_DAMPING = 4;

        const fTopZ =
          (targetZ - armSpringTop.angleZ) * TOP_STIFFNESS -
          armSpringTop.velZ * TOP_DAMPING;
        armSpringTop.velZ += fTopZ * dt;
        armSpringTop.angleZ += armSpringTop.velZ * dt;
        armSpringTop.angleZ = THREE.MathUtils.clamp(
          armSpringTop.angleZ,
          -MAX_ARM_ANGLE,
          MAX_ARM_ANGLE,
        );

        const fTopX =
          (targetX - armSpringTop.angleX) * TOP_STIFFNESS -
          armSpringTop.velX * TOP_DAMPING;
        armSpringTop.velX += fTopX * dt;
        armSpringTop.angleX += armSpringTop.velX * dt;
        armSpringTop.angleX = THREE.MathUtils.clamp(
          armSpringTop.angleX,
          -MAX_ARM_ANGLE,
          MAX_ARM_ANGLE,
        );

        if (leftArmBone) {
          leftArmBone.rotation.x = leftArmRest.x + armSpringBottom.angleX;
          leftArmBone.rotation.z = leftArmRest.z + armSpringBottom.angleZ;
        }
        if (rightArmBone) {
          rightArmBone.rotation.x = rightArmRest.x + armSpringBottom.angleX;
          rightArmBone.rotation.z = rightArmRest.z - armSpringBottom.angleZ;
        }
        if (leftArmBoneTop) {
          leftArmBoneTop.rotation.x = leftArmRestTop.x + armSpringTop.angleX;
          leftArmBoneTop.rotation.z = leftArmRestTop.z + armSpringTop.angleZ;
        }
        if (rightArmBoneTop) {
          rightArmBoneTop.rotation.x = rightArmRestTop.x + armSpringTop.angleX;
          rightArmBoneTop.rotation.z = rightArmRestTop.z - armSpringTop.angleZ;
        }
      }

      if (mesh) {
        mesh.position.x = characterBody.position.x;
        mesh.position.y = characterBody.position.y + MODEL_Y_OFFSET;
        mesh.position.z = characterBody.position.z;
      }

      // === Mise à jour des objets spawés ===
      // Chaque item possède un body physique et un mesh.
      // On synchronise le mesh (visuel) avec le body (physique).
      spawnedItemsRef.current.forEach((item) => {
        // Applique la physique spring SEULEMENT pendant le drag
        if (item.useSpring && !item.isBeingDragged) {
          const diffX = item.desiredX - item.body.position.x;
          const diffY = item.desiredY - item.body.position.y;

          const forceX =
            diffX * item.springStiffness -
            item.body.velocity.x * item.springDamping;
          const forceY =
            diffY * item.springStiffness -
            item.body.velocity.y * item.springDamping;

          item.body.velocity.x += (forceX / item.body.mass) * dt;
          item.body.velocity.y += (forceY / item.body.mass) * dt;

          // Met à jour la position désirée vers la position actuelle
          item.desiredX = item.body.position.x;
          item.desiredY = item.body.position.y;
        }

        // Verrouille l'axe Z à 0 (vue de face)
        item.body.position.z = 0;
        item.body.velocity.z = 0;
        item.body.angularVelocity.z = 0;

        item.mesh.position.copy(item.body.position);
        item.mesh.quaternion.copy(item.body.quaternion);
      });

      // Applique les limites aux items spawés
      if (window.clampSpawnedItemsWithinBounds) {
        window.clampSpawnedItemsWithinBounds();
      }

      // Vérifier les collisions avec la trash
      if (window.checkTrashCollisions) {
        window.checkTrashCollisions();
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

    // === Gestion des événements utilisateur ===
    // Écoute des interactions souris/tactiles et redimensionnement de la fenêtre
    window.addEventListener("mousedown", onMouseDown); // Début du drag avec souris
    window.addEventListener("mousemove", onMouseMove); // Déplacement lors du drag
    window.addEventListener("mouseup", onMouseUp); // Fin du drag avec souris
    window.addEventListener("touchstart", onMouseDown, { passive: false }); // Début du drag tactile
    window.addEventListener("touchmove", onMouseMove, { passive: false }); // Déplacement tactile
    window.addEventListener("touchend", onMouseUp); // Fin du drag tactile
    window.addEventListener("resize", onResize); // Ajuste caméra et renderer lors du redimensionnement
    renderer.domElement.addEventListener("dragover", onDragOver); // Empêche le comportement par défaut du drag
    renderer.domElement.addEventListener("drop", onDrop); // Gère le drop d'éléments dans le canvas

    // === Nettoyage des événements lors du démontage ===
    return () => {
      cancelAnimationFrame(animId); // Arrête la boucle d'animation
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchstart", onMouseDown);
      window.removeEventListener("touchmove", onMouseMove);
      window.removeEventListener("touchend", onMouseUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("dragover", onDragOver);
      renderer.domElement.removeEventListener("drop", onDrop);
      renderer.dispose(); // Libère la mémoire du renderer
    };
  }, []);

  return (
    <main className="relative w-full h-screen">
      <h1 className="absolute p-5">Human.exe POC</h1>
      <ButtonAddItem
        scene={sceneRef.current}
        world={worldRef.current}
        camera={cameraRef.current}
        renderer={rendererRef.current}
        spawnedItems={spawnedItemsRef}
        modelSize={modelSizeRef.current}
        characterBody={characterBodyRef.current}
        getViewBounds={() => {
          const camera = cameraRef.current;
          const mesh = meshRef.current;
          if (!camera || !mesh) return { halfW: 5, halfH: 5 };
          const distance = camera.position.z - mesh.position.z;
          const vFov = THREE.MathUtils.degToRad(camera.fov);
          const viewHeight = 2 * Math.tan(vFov / 2) * distance;
          const viewWidth = viewHeight * camera.aspect;
          return { halfW: viewWidth / 2, halfH: viewHeight / 2 };
        }}
      />
      {sceneRef.current && cameraRef.current && (
        <Trash
          scene={sceneRef.current}
          camera={cameraRef.current}
          spawnedItems={spawnedItemsRef}
          world={worldRef.current}
          renderer={rendererRef.current}
        />
      )}
      <canvas ref={canvasRef} />
    </main>
  );
};

export default App;
