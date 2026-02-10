import { useEffect, useRef } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

// Composant pour afficher le modèle trash.glb
export default function Trash({ scene, camera }) {
  const trashRef = useRef();

  useEffect(() => {
    if (!scene || !camera) return;

    const loader = new GLTFLoader();
    loader.load(
      "/assets/3D/trash.glb", // Doit être dans public/assets/3D/
      (gltf) => {
        const trash = gltf.scene;
        trash.castShadow = true;

        // Position visible devant la caméra
        trash.position.set(0, -1, 0); // Y=-1 pour être au sol
        trash.rotation.set(0, Math.PI / 2, 0); // Optionnel : orientation

        // Si ton monde a un sol à z=0, ajuste Z si nécessaire
        scene.add(trash);
        trashRef.current = trash;
      },
      undefined,
      (err) => console.error("Erreur chargement trash.glb :", err),
    );
  }, [scene, camera]);

  return null;
}
