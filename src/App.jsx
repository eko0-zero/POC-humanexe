import { useEffect, useRef } from "react";
import "./App.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { World, Vec3, Body, Plane, Box } from "cannon-es";
import ButtonAddItem from "./ui/ButtonAddItem"; // ← Importez le composant

// Chemin d'accès au modèle 3D
const MODEL_PATH = new URL("./assets/3D/new.glb", import.meta.url).href;
// Position Y du sol
const GROUND_Y = -1;
// Décalage vertical du modèle par rapport au corps physique
const MODEL_Y_OFFSET = -0.5;
// Décalage vertical de la tête par rapport au centre du corps
const HEAD_OFFSET_Y = 0.6;

// Énumération des états possibles du corps/os
const BoneState = {
  PHYSICS: "physics", // Mode physique normal (pas de contrôle)
  DRAG: "drag", // Mode glisser (contrôlé par la souris)
  RECOVER: "recover", // Mode récupération (retour à la position initiale)
};

/**
 * Fonction pour récupérer la position verticale du corps
 * Ramène progressivement l'orientation à la verticale et réduit les vélocités
 * @param {Body} body - Corps physique à récupérer
 */
function recoverUpright(body) {
  // Crée un quaternion représentant une orientation verticale (pas de rotation)
  const uprightQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, 0),
  );

  // Récupère le quaternion actuel du corps
  const currentQuat = new THREE.Quaternion(
    body.quaternion.x,
    body.quaternion.y,
    body.quaternion.z,
    body.quaternion.w,
  );

  // Interpole progressivement entre la rotation actuelle et la verticale
  currentQuat.slerp(uprightQuat, 0.1);

  // Applique le nouveau quaternion au corps
  body.quaternion.set(
    currentQuat.x,
    currentQuat.y,
    currentQuat.z,
    currentQuat.w,
  );

  // Réduit progressivement la vélocité linéaire et angulaire
  body.velocity.scale(0.96, body.velocity);
  body.angularVelocity.scale(0.92, body.angularVelocity);
}

/**
 * Crée la caméra pour la scène 3D
 * @param {number} aspect - Ratio largeur/hauteur
 * @returns {THREE.PerspectiveCamera} La caméra configurée
 */
function createCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(55, aspect);
  // Position initiale de la caméra
  camera.position.set(0, 0.8, 3);
  // Légère rotation pour voir vers le bas
  camera.rotation.x = -0.1;
  return camera;
}

/**
 * Crée le rendu WebGL
 * @param {HTMLCanvasElement} canvas - Élément canvas
 * @param {number} width - Largeur du rendu
 * @param {number} height - Hauteur du rendu
 * @returns {THREE.WebGLRenderer} Le rendu configuré
 */
function createRenderer(canvas, width, height) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Active les ombres
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Fond blanc
  renderer.setClearColor(0xffffff);
  renderer.setSize(width, height);
  return renderer;
}

/**
 * Crée l'éclairage de la scène
 * @param {THREE.Scene} scene - Scène 3D
 * @returns {Object} Objet contenant la lumière ambiante et la lumière directionnelle
 */
function createLights(scene) {
  // Lumière ambiante pour éclairer globalement
  const ambient = new THREE.AmbientLight(0xffffff, 2.5);
  scene.add(ambient);

  // Lumière directionnelle (soleil) pour les ombres
  const dirLight = new THREE.DirectionalLight(0xffffff, 10);
  // Position de la lumière
  dirLight.position.set(5, 8, 5);
  // Point vers lequel la lumière est dirigée
  dirLight.target.position.set(0, 0, 0);
  // Active la projection d'ombres
  dirLight.castShadow = true;
  // Résolution de la carte d'ombres
  dirLight.shadow.mapSize.set(6048, 6048);
  // Limites de la caméra d'ombre
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

/**
 * Crée le sol de la scène
 * @param {THREE.Scene} scene - Scène 3D
 * @returns {THREE.Mesh} Le maillage du sol
 */
function createGround(scene) {
  // Crée une géométrie plane (rectangle)
  const geometry = new THREE.PlaneGeometry(10, 10);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const plane = new THREE.Mesh(geometry, material);
  // Rotation pour que le plan soit horizontal
  plane.rotation.x = -Math.PI / 2;
  // Position au niveau du sol
  plane.position.y = GROUND_Y;
  // Le sol reçoit les ombres
  plane.receiveShadow = true;
  scene.add(plane);
  return plane;
}

/**
 * Crée un cube temporaire en attendant le chargement du modèle 3D
 * @param {THREE.Scene} scene - Scène 3D
 * @returns {THREE.Mesh} Le cube temporaire
 */
function createPlaceholderCube(scene) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshPhongMaterial({ color: 0x0000ff });
  const cube = new THREE.Mesh(geometry, material);
  // Le cube projette une ombre
  cube.castShadow = true;
  scene.add(cube);
  return cube;
}

/**
 * Charge le modèle 3D depuis un fichier GLTF
 * @param {THREE.Scene} scene - Scène 3D
 * @param {THREE.Mesh} placeholderCube - Cube temporaire à remplacer
 * @returns {Promise} Promesse résolue avec le modèle chargé
 */
function loadModel(scene, placeholderCube) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      MODEL_PATH,
      (gltf) => {
        // Retire le cube temporaire
        scene.remove(placeholderCube);
        const model = gltf.scene;
        // Le modèle projette une ombre
        model.castShadow = true;

        // Parcourt tous les nœuds du modèle
        model.traverse((node) => {
          if (node.isMesh) {
            // Configure les ombres
            node.castShadow = true;
            node.receiveShadow = false;
            // Modifie la couleur et les propriétés du matériau
            if (node.material) {
              node.material = node.material.clone();
              // Change la couleur en vert clair
              node.material.color.set(0xc0f5c7);
              // Configuration des ombres
              node.material.shadowSide = THREE.FrontSide;
            }
          }
        });

        // Ajuste l'échelle du modèle (aplati légèrement en Z)
        model.scale.set(1, 1, 0.8);
        scene.add(model);
        resolve(model);
      },
      undefined,
      (error) => {
        // Gestion des erreurs de chargement
        console.error("Erreur chargement modèle :", error);
        reject(error);
      },
    );
  });
}

/**
 * Crée le monde physique avec la gravité
 * @returns {World} Le monde physique configuré
 */
function createPhysicsWorld() {
  const world = new World({
    gravity: new Vec3(0, -9.82, 0),
  });
  // Nombre d'itérations du solveur de physique
  world.solver.iterations = 10;
  return world;
}

/**
 * Crée le corps physique du sol
 * @returns {Body} Le corps physique du sol (immobile)
 */
function createGroundBody() {
  // Forme d'un plan
  const shape = new Plane();
  // Corps statique (masse = 0)
  const body = new Body({ mass: 0 });
  body.addShape(shape);
  // Rotation pour que le plan soit horizontal
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  // Position du sol
  body.position.set(0, GROUND_Y, 0);
  return body;
}

/**
 * Crée le corps physique du personnage
 * @param {number} startY - Position Y initiale
 * @returns {Body} Le corps physique du personnage
 */
function createCharacterBody(startY) {
  // Dimensions du corps (demi-dimensions)
  const halfExtents = new Vec3(0.4, 0.5, 0.3);
  const shape = new Box(halfExtents);
  // Crée un corps dynamique avec amortissement
  const body = new Body({
    mass: 1,
    linearDamping: 0.15, // Amortissement du mouvement linéaire
    angularDamping: 0.4, // Amortissement de la rotation
    restitution: 0, // Pas de rebond
  });
  body.addShape(shape);
  // Position initiale
  body.position.set(0, startY, 0);
  return body;
}

/**
 * Calcule l'intersection de la souris avec un plan 3D
 * @param {number} clientX - Coordonnée X de la souris
 * @param {number} clientY - Coordonnée Y de la souris
 * @param {THREE.Camera} camera - Caméra de la scène
 * @param {THREE.WebGLRenderer} renderer - Rendu
 * @param {THREE.Vector3} planePoint - Point du plan
 * @returns {THREE.Vector3} Position 3D de l'intersection
 */
function getMouseOnPlane(clientX, clientY, camera, renderer, planePoint) {
  // Convertit les coordonnées écran en coordonnées normalisées
  const rect = renderer.domElement.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

  // Crée un rayon depuis la caméra
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

  // Crée un plan perpendiculaire à la direction de la caméra
  const normal = new THREE.Vector3();
  camera.getWorldDirection(normal);
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(normal, planePoint);

  // Calcule l'intersection du rayon avec le plan
  const target = new THREE.Vector3();
  ray.ray.intersectPlane(plane, target);

  return target;
}

/**
 * Composant principal de l'application
 */
const App = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    // Vérifie que le canvas est disponible
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // === Initialisation de Three.js ===
    const scene = new THREE.Scene();
    const camera = createCamera(width / height);
    const renderer = createRenderer(canvas, width, height);
    const { dirLight } = createLights(scene);
    createGround(scene);

    // === Initialisation de la physique ===
    const world = createPhysicsWorld();
    const groundBody = createGroundBody();
    world.addBody(groundBody);

    // Crée et ajoute le corps du personnage
    const characterBody = createCharacterBody(GROUND_Y + 2);
    world.addBody(characterBody);

    // État initial du personnage
    let boneState = BoneState.PHYSICS;

    // Position désirée de la TÊTE (point contrôlé par la souris)
    const desiredHeadPos = new THREE.Vector3(0, 1, 0);

    // Variables pour gérer le modèle 3D
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

    // État du ressort pour l'animation procédurale des bras
    // Ressort séparé pour les bras avant (bottom) et arrière (top)
    const armSpringBottom = {
      angleZ: 0,
      velZ: 0,
      angleX: 0,
      velX: 0,
    };
    const armSpringTop = {
      angleZ: 0,
      velZ: 0,
      angleX: 0,
      velX: 0,
    };

    // Position initiale du maillage
    mesh.position.set(
      characterBody.position.x,
      characterBody.position.y + MODEL_Y_OFFSET,
      characterBody.position.z,
    );

    // === Chargement du modèle 3D ===
    loadModel(scene, placeholder).then((model) => {
      mesh = model;
      // Calcule les dimensions du modèle
      const box = new THREE.Box3().setFromObject(mesh);
      box.getSize(modelSize);

      // Cherche le squelette pour contrôler les os
      mesh.traverse((o) => {
        if (o.isSkinnedMesh && o.skeleton) {
          skeleton = o.skeleton;
        }
      });

      // Sélectionne un os principal pour la rotation
      if (skeleton) {
        testBone =
          skeleton.getBoneByName("Spine") ||
          skeleton.getBoneByName("spine") ||
          skeleton.getBoneByName("Chest") ||
          skeleton.bones[0];
        console.log(skeleton.bones.map((bone) => bone.name));

        // Cherche l'os de la tête pour limiter le drag
        headBone =
          skeleton.getBoneByName("head") ||
          skeleton.getBoneByName("Head") ||
          skeleton.getBoneByName("mixamorigHead");

        // Cherche les os des bras pour l'animation procédurale
        rightArmBoneTop = skeleton.getBoneByName("body001");
        rightArmBone = skeleton.getBoneByName("body002");
        leftArmBoneTop = skeleton.getBoneByName("top-armr_1");
        leftArmBone = skeleton.getBoneByName("bottom-armr");

        // Sauvegarde les rotations de repos des bras
        if (leftArmBone) leftArmRest.copy(leftArmBone.rotation);
        if (leftArmBoneTop) leftArmRestTop.copy(leftArmBoneTop.rotation);
        if (rightArmBone) rightArmRest.copy(rightArmBone.rotation);
        if (rightArmBoneTop) rightArmRestTop.copy(rightArmBoneTop.rotation);
      }

      // Repositionne le maillage après chargement
      mesh.position.set(
        characterBody.position.x,
        characterBody.position.y + MODEL_Y_OFFSET,
        characterBody.position.z,
      );
    });

    // Rendu initial
    renderer.render(scene, camera);

    // === Configuration du raycasting (détection de clics sur le modèle) ===
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    /**
     * Convertit les coordonnées écran en coordonnées normalisées
     */
    const screenToNDC = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    /**
     * Vérifie si la souris est sur la tête du modèle
     */
    const isOverHead = (clientX, clientY) => {
      if (!mesh) return false;
      screenToNDC(clientX, clientY);
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects([mesh], true);
      if (intersects.length === 0) return false;

      const hitPoint = intersects[0].point;

      // Si l'os de la tête est disponible, vérifie la distance au centre de la tête
      if (headBone) {
        const headWorldPos = new THREE.Vector3();
        headBone.getWorldPosition(headWorldPos);
        const HEAD_RADIUS = 0.7;
        return hitPoint.distanceTo(headWorldPos) < HEAD_RADIUS;
      }

      // Fallback : vérifie si le point touché est dans le quart supérieur du modèle
      const headThresholdY =
        characterBody.position.y + MODEL_Y_OFFSET + modelSize.y * 0.7;
      return hitPoint.y >= headThresholdY;
    };

    /**
     * Calcule les limites visibles de la caméra
     */
    const getViewBounds = () => {
      const distance = camera.position.z - mesh.position.z;
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const viewHeight = 2 * Math.tan(vFov / 2) * distance;
      const viewWidth = viewHeight * camera.aspect;
      return { halfW: viewWidth / 2, halfH: viewHeight / 2 };
    };

    /**
     * Maintient le personnage dans les limites de l'écran
     */
    const clampCharacterWithinBounds = () => {
      if (!mesh) return;

      const { halfW, halfH } = getViewBounds();
      const halfModelW = modelSize.x / 2;
      const modelHeight = modelSize.y;
      const bodyHalfHeight = 0.5; // Demi-hauteur du corps

      // Limites X (gauche/droite)
      const minX = -halfW + halfModelW * 0.5;
      const maxX = halfW - halfModelW * 0.5;

      // Limites Y (haut/bas) - le corps ne peut pas passer sous le sol
      const minY = GROUND_Y + bodyHalfHeight;
      const maxY = halfH - modelHeight / 4;

      // Limite les positions
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

      // Met à jour la position si elle a été limitée et annule la vélocité
      if (clampedX !== characterBody.position.x) {
        characterBody.position.x = clampedX;
        characterBody.velocity.x = 0;
      }

      if (clampedY !== characterBody.position.y) {
        characterBody.position.y = clampedY;
        characterBody.velocity.y = 0;
      }
    };

    // === Configuration des entrées souris ===
    let isDragging = false;
    const dragPlanePoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3(); // Décalage souris vs tête au clic

    /**
     * Récupère les coordonnées cliente (souris ou tactile)
     */
    const getClientPos = (e) => {
      if (e.touches && e.touches.length > 0) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
      }
      return { clientX: e.clientX, clientY: e.clientY };
    };

    /**
     * Gestion du début du glissement (clic souris ou toucher)
     */
    const onMouseDown = (e) => {
      const { clientX, clientY } = getClientPos(e);
      // Vérifie que le clic est sur la tête du modèle
      if (!isOverHead(clientX, clientY)) return;

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

      // Point où la souris intersecte le plan
      const mouseWorld = getMouseOnPlane(
        clientX,
        clientY,
        camera,
        renderer,
        dragPlanePoint,
      );

      // Décalage = tête - souris (pour garder le même point de contact)
      dragOffset.set(
        characterBody.position.x - mouseWorld.x,
        headWorldY - mouseWorld.y,
        0,
      );

      // Arrête tout mouvement
      characterBody.velocity.set(0, 0, 0);
      characterBody.angularVelocity.set(0, 0, 0);
    };

    /**
     * Gestion du mouvement de la souris pendant le glissement
     */
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

      // Point d'intersection de la souris avec le plan
      const mouseWorld = getMouseOnPlane(
        clientX,
        clientY,
        camera,
        renderer,
        dragPlanePoint,
      );

      // Position désirée de la tête = souris + décalage
      desiredHeadPos.x = mouseWorld.x + dragOffset.x;
      desiredHeadPos.y = mouseWorld.y + dragOffset.y;
      desiredHeadPos.z = characterBody.position.z;

      // Limite la position dans le cadre visible
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

    /**
     * Gestion de la fin du glissement
     */
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      // Passe en mode récupération
      boneState = BoneState.RECOVER;
    };

    /**
     * Gestion du glisser-déposer (pour les images, etc.)
     */
    const onDragOver = (e) => e.preventDefault();

    const onDrop = (e) => {
      e.preventDefault();
      if (!mesh) return;
      screenToNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(mouse, camera);
      raycaster.intersectObjects([mesh], true);
    };

    /**
     * Met à jour la position de la lumière pour suivre le modèle
     */
    const updateLightTarget = () => {
      if (!mesh) return;
      dirLight.target.position.copy(mesh.position);
      dirLight.target.updateMatrixWorld();
    };

    // === Boucle d'animation ===
    let animId;
    let lastTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Calcule le temps écoulé depuis le dernier frame
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // === Mode DRAG : le personnage suit la souris ===
      if (boneState === BoneState.DRAG) {
        const bodyHalfHeight = 0.5;
        const minY = GROUND_Y + bodyHalfHeight;

        // Paramètres de la force appliquée
        const stiffness = 600; // Rigidité (plus élevé = plus fort)
        const damping = 50; // Amortissement (friction)

        // Position actuelle de la tête
        const currentHeadX = characterBody.position.x;
        const currentHeadY = characterBody.position.y + HEAD_OFFSET_Y;

        // Différences entre position désirée et actuelle
        const diffX = desiredHeadPos.x - currentHeadX;
        const diffY = desiredHeadPos.y - currentHeadY;

        // Si le personnage est au sol, verrouille la position Y
        if (characterBody.position.y <= minY) {
          characterBody.position.y = minY;
          characterBody.velocity.y = 0;

          // Force uniquement horizontale
          const forceX = diffX * stiffness - characterBody.velocity.x * damping;
          characterBody.velocity.x += (forceX / characterBody.mass) * dt;
        } else {
          // En l'air, applique les deux forces (X et Y)
          const forceX = diffX * stiffness - characterBody.velocity.x * damping;
          const forceY = diffY * stiffness - characterBody.velocity.y * damping;

          characterBody.velocity.x += (forceX / characterBody.mass) * dt;
          characterBody.velocity.y += (forceY / characterBody.mass) * dt;
        }
      }

      // === Mode RECOVER : retour à la position verticale ===
      if (boneState === BoneState.RECOVER) {
        recoverUpright(characterBody);

        // Passe au mode physique si la vitesse est faible
        if (
          characterBody.velocity.length() < 0.05 &&
          characterBody.angularVelocity.length() < 0.05
        ) {
          boneState = BoneState.PHYSICS;
        }
      }

      // === Simulation physique ===
      world.step(1 / 60, dt, 3);

      // Bloque la position Z à 0 (vue de face)
      characterBody.position.z = 0;

      // Applique les contraintes de limites et empêche les rebonds
      clampCharacterWithinBounds();

      // === Animation du squelette (inclinaison du corps) ===
      if (testBone) {
        // Inclinaison avant/arrière basée sur la vélocité verticale
        const tiltX = THREE.MathUtils.clamp(
          -characterBody.velocity.y * 0.15,
          -0.6,
          0.6,
        );

        // Inclinaison gauche/droite basée sur la vélocité horizontale
        const tiltZ = THREE.MathUtils.clamp(
          characterBody.velocity.x * 0.15,
          -0.6,
          0.6,
        );

        // Interpole progressivement vers les rotations désirées
        testBone.rotation.x += (tiltX - testBone.rotation.x) * 0.15;
        testBone.rotation.z += (tiltZ - testBone.rotation.z) * 0.15;
      }

      // === Animation procédurale des bras (ressort) ===
      if (leftArmBone || rightArmBone || leftArmBoneTop || rightArmBoneTop) {
        const MAX_ARM_ANGLE = 1.2;

        // Cibles communes basées sur la vélocité du corps
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

        // --- Bras avant (bottom) : plus réactifs ---
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

        // --- Bras arrière (top) : plus mous / floppy ---
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

        // Applique les rotations (repos + offset du ressort)
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

      // === Mise à jour de la position du maillage ===
      if (mesh) {
        mesh.position.x = characterBody.position.x;
        mesh.position.y = characterBody.position.y + MODEL_Y_OFFSET;
        mesh.position.z = characterBody.position.z;
      }

      // Mise à jour de la lumière et rendu
      updateLightTarget();
      renderer.render(scene, camera);
    };
    animate();

    /**
     * Gestion du redimensionnement de la fenêtre
     */
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    // === Attachement des écouteurs d'événements ===
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    // Gestion du tactile
    window.addEventListener("touchstart", onMouseDown, { passive: false });
    window.addEventListener("touchmove", onMouseMove, { passive: false });
    window.addEventListener("touchend", onMouseUp);
    // Gestion du redimensionnement
    window.addEventListener("resize", onResize);
    // Gestion du glisser-déposer
    renderer.domElement.addEventListener("dragover", onDragOver);
    renderer.domElement.addEventListener("drop", onDrop);

    // === Nettoyage des ressources ===
    return () => {
      cancelAnimationFrame(animId);
      // Supprime les écouteurs d'événements
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchstart", onMouseDown);
      window.removeEventListener("touchmove", onMouseMove);
      window.removeEventListener("touchend", onMouseUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("dragover", onDragOver);
      renderer.domElement.removeEventListener("drop", onDrop);
      // Libère les ressources Three.js
      renderer.dispose();
    };
  }, []);

  return (
    <main className="relative w-full h-screen">
      <h1 className="absolute p-5">Human.exe POC</h1>
      <ButtonAddItem />
      <canvas ref={canvasRef} />
    </main>
  );
};

export default App;
