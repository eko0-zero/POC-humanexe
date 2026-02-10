import { useEffect, useRef } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

// Chemin du modèle trash avec import.meta.url (même que ButtonAddItem)
const TRASH_PATH = new URL("../assets/3D/trash.glb", import.meta.url).href;

// Composant pour afficher le modèle trash.glb
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
    size: new THREE.Vector3(0.5, 0.5, 0.5), // Taille par défaut
  });
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const GROUND_Y = -1;

  useEffect(() => {
    if (!scene || !camera) return;

    const loader = new GLTFLoader();
    loader.load(
      TRASH_PATH,
      (gltf) => {
        const trash = gltf.scene;
        trash.castShadow = true;
        trash.receiveShadow = true;

        // Position visible dans la scène
        trash.position.set(2.7, GROUND_Y + 0.2, 0.14);
        trash.scale.set(0.5, 1, 1);
        trash.rotation.set(0, Math.PI / 2, 0);

        // Configure les matériaux
        trash.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.material) {
              node.material = node.material.clone();
            }
          }
        });

        // Calcule la bounding box du trash pour la détection
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

  // Expose une fonction globale pour vérifier les collisions avec trash
  useEffect(() => {
    window.checkTrashCollisions = () => {
      if (!trashRef.current || !spawnedItems.current.length) return;

      const trashPos = trashRef.current.position;
      const trashSize = trashBoundsRef.current.size;

      // Rayon de collision du trash
      const trashRadius = Math.max(trashSize.x, trashSize.y, trashSize.z) / 2;

      // Vérifie chaque item
      for (let i = spawnedItems.current.length - 1; i >= 0; i--) {
        const item = spawnedItems.current[i];
        const itemPos = item.body.position;

        // Distance entre l'item et la trash
        const distX = itemPos.x - trashPos.x;
        const distY = itemPos.y - trashPos.y;
        const distZ = itemPos.z - trashPos.z;
        const distance = Math.sqrt(
          distX * distX + distY * distY + distZ * distZ,
        );

        // Si l'item touche la trash, le supprimer
        if (distance < trashRadius + 0.05) {
          console.log("🗑️ Item supprimé dans la trash!");

          // Supprime le mesh de la scène
          if (item.mesh && item.mesh.parent) {
            item.mesh.parent.remove(item.mesh);
          }

          // Supprime le body du monde physique
          if (item.body && world) {
            world.removeBody(item.body);
          }

          // Supprime de l'array
          spawnedItems.current.splice(i, 1);
        }
      }
    };

    return () => {
      delete window.checkTrashCollisions;
    };
  }, [spawnedItems, world]);

  // Ajoute la détection de click sur la trash
  useEffect(() => {
    if (!renderer || !camera) return;

    const onMouseClick = (e) => {
      if (!trashRef.current) return;

      // Convertit les coordonnées souris en NDC
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Setup raycaster
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      // Teste l'intersection avec la trash
      const intersects = raycasterRef.current.intersectObject(
        trashRef.current,
        true,
      );

      // Si on a cliqué sur la trash
      if (intersects.length > 0) {
        console.log("🗑️ Click sur trash - Suppression de tous les items!");
        deleteAllItems();
      }
    };

    const deleteAllItems = () => {
      // Copie l'array pour éviter les problèmes de modification durant la boucle
      const itemsToDelete = [...spawnedItems.current];

      itemsToDelete.forEach((item) => {
        // Supprime le mesh de la scène
        if (item.mesh && item.mesh.parent) {
          item.mesh.parent.remove(item.mesh);
        }

        // Supprime le body du monde physique
        if (item.body && world) {
          world.removeBody(item.body);
        }
      });

      // Vide l'array
      spawnedItems.current = [];
    };

    window.addEventListener("click", onMouseClick);

    return () => {
      window.removeEventListener("click", onMouseClick);
    };
  }, [renderer, camera, spawnedItems, world]);

  return null;
}
