import { useEffect, useRef } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

// Trashh.jsx
// Composant gérant la poubelle 3D dans la scène
// - Chargement du modèle
// - Positionnement dynamique
// - Hover et click interactions
// - Suppression des items déposés

const TRASH_PATH = new URL("../assets/3D/trash.glb", import.meta.url).href;
const TRASH_Z_POSITION = 0.14; // ← Modifiez cette valeur pour ajuster Z

export default function Trash({
  scene,
  camera,
  spawnedItems,
  world,
  renderer,
}) {
  const trashRef = useRef();
  const trashBoundsRef = useRef({
    position: new THREE.Vector3(),
    size: new THREE.Vector3(0.5, 0.5, 0.5), // Valeurs par défaut, seront mises à jour après chargement du modèle
  });
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const isHoveredRef = useRef(false);
  const BASE_SCALE = 0.84;
  const HOVER_SCALE = 0.88;
  const GROUND_Y = -1;

  // === Chargement du modèle de la poubelle ===
  // Charge le modèle GLB et l'ajoute à la scène
  // Configure les ombres et clone les matériaux pour éviter les conflits
  // Calcule les dimensions pour la détection de collision
  useEffect(() => {
    if (!scene || !camera) return;

    const loader = new GLTFLoader();
    loader.load(
      TRASH_PATH,
      (gltf) => {
        const trash = gltf.scene;
        trash.castShadow = true;
        trash.receiveShadow = true;

        trash.position.set(100, GROUND_Y + 0.2, TRASH_Z_POSITION);
        trash.scale.setScalar(BASE_SCALE);
        trash.rotation.set(0, Math.PI / 2, 0);

        trash.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.material) {
              node.material = node.material.clone();
            }
          }
        });

        const box = new THREE.Box3().setFromObject(trash);
        const size = box.getSize(new THREE.Vector3());

        trashBoundsRef.current = {
          position: trash.position.clone(),
          size: size,
        };

        scene.add(trash);
        trashRef.current = trash;

        console.log("✅ Trash chargé avec succès");
      },
      undefined,
      (err) => console.error("Erreur chargement trash.glb :", err),
    );
  }, [scene, camera]);

  // === Mise à jour de la position de la poubelle ===
  // Positionne la poubelle à l'écran en fonction de la caméra
  // Applique un scale fluide lors du hover
  // Met à jour les bounds pour collision
  // Remplace temporairement renderer.render pour inclure la mise à jour
  useEffect(() => {
    if (!renderer || !camera) return;

    const getViewBounds = () => {
      const distance = camera.position.z;
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const viewHeight = 2 * Math.tan(vFov / 2) * distance;
      const viewWidth = viewHeight * camera.aspect;
      return { halfW: viewWidth / 2, halfH: viewHeight / 2 };
    };

    const updateTrashPosition = () => {
      if (!trashRef.current) return;

      const { halfW, halfH } = getViewBounds();
      const TRASH_OFFSET_X = 0.35;
      const TRASH_OFFSET_Y = 0.185;

      trashRef.current.position.x = halfW - TRASH_OFFSET_X;
      trashRef.current.position.y = GROUND_Y + TRASH_OFFSET_Y;
      trashRef.current.position.z = TRASH_Z_POSITION;

      const targetScale = isHoveredRef.current ? HOVER_SCALE : BASE_SCALE;

      // Transition fluide (lerp)
      const currentScale = trashRef.current.scale.x;
      const smoothScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.1);
      trashRef.current.scale.setScalar(smoothScale);

      trashBoundsRef.current.position = trashRef.current.position.clone();
    };

    const originalRender = renderer.render.bind(renderer);
    renderer.render = function (scene, camera) {
      updateTrashPosition();
      return originalRender(scene, camera);
    };

    return () => {
      renderer.render = originalRender;
    };
  }, [renderer, camera]);

  // === Détection des collisions avec les items ===
  // Vérifie la distance entre chaque item et la poubelle
  // Supprime les items si proche de la poubelle
  // Expose checkTrashCollisions globalement pour être appelé depuis la boucle principale
  useEffect(() => {
    window.checkTrashCollisions = () => {
      if (!trashRef.current || !spawnedItems.current.length) return;

      const trashPos = trashRef.current.position;
      const trashSize = trashBoundsRef.current.size;
      const trashRadius = Math.max(trashSize.x, trashSize.y, trashSize.z) / 2;

      for (let i = spawnedItems.current.length - 1; i >= 0; i--) {
        const item = spawnedItems.current[i];
        const itemPos = item.body.position;

        const distX = itemPos.x - trashPos.x;
        const distY = itemPos.y - trashPos.y;
        const distZ = itemPos.z - trashPos.z;
        const distance = Math.sqrt(
          distX * distX + distY * distY + distZ * distZ,
        );

        if (distance < trashRadius + 0.1) {
          console.log("🗑️ Item supprimé dans la trash!");

          if (item.mesh && item.mesh.parent) {
            item.mesh.parent.remove(item.mesh);
          }

          if (item.body && world) {
            world.removeBody(item.body);
          }

          spawnedItems.current.splice(i, 1);
        }
      }
    };

    return () => {
      delete window.checkTrashCollisions;
    };
  }, [spawnedItems, world]);

  // === Hover detection ===
  // Utilise raycasting pour détecter si la souris est au-dessus de la poubelle
  // Met à jour isHoveredRef pour le scale animé
  useEffect(() => {
    if (!renderer || !camera) return;

    const onMouseMove = (e) => {
      if (!trashRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const intersects = raycasterRef.current.intersectObject(
        trashRef.current,
        true,
      );

      isHoveredRef.current = intersects.length > 0;
    };

    window.addEventListener("mousemove", onMouseMove);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [renderer, camera]);

  // === Click detection ===
  // Détecte le click sur la poubelle et supprime tous les items de la scène et du monde physique
  // deleteAllItems gère le nettoyage complet
  useEffect(() => {
    if (!renderer || !camera) return;

    const onMouseClick = (e) => {
      if (!trashRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const intersects = raycasterRef.current.intersectObject(
        trashRef.current,
        true,
      );

      if (intersects.length > 0) {
        console.log("🗑️ Click sur trash - Suppression de tous les items!");
        deleteAllItems();
      }
    };

    const deleteAllItems = () => {
      const itemsToDelete = [...spawnedItems.current];

      itemsToDelete.forEach((item) => {
        if (item.mesh && item.mesh.parent) {
          item.mesh.parent.remove(item.mesh);
        }

        if (item.body && world) {
          world.removeBody(item.body);
        }
      });

      spawnedItems.current = [];
    };

    window.addEventListener("click", onMouseClick);

    return () => {
      window.removeEventListener("click", onMouseClick);
    };
  }, [renderer, camera, spawnedItems, world]);

  return null;
}
