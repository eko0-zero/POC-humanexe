import { useEffect, useRef } from "react";
import "./App.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const App = () => {
  // Référence vers le <canvas> React
  const canvasRef = useRef(null);

  useEffect(() => {
    // Si le canvas n'est pas encore monté, on sort
    if (!canvasRef.current) return;

    // Récupération du canvas et des dimensions de la fenêtre
    const canvas = canvasRef.current;
    const iw = window.innerWidth;
    const ih = window.innerHeight;

    // Création de la scène Three.js
    const scene = new THREE.Scene();

    // Caméra perspective
    // FOV = 70°, ratio = largeur / hauteur
    const camera = new THREE.PerspectiveCamera(70, iw / ih);

    // Variable qui contiendra le mesh (cube temporaire ou modèle GLTF)
    let mesh = null;

    /* =========================
     CUBE TEMPORAIRE (DEBUG)
     ========================= */

    // Géométrie d'un cube
    const geometry = new THREE.BoxGeometry(1, 1, 1);

    // Matériau Phong (réagit à la lumière + ombres)
    const material = new THREE.MeshPhongMaterial({ color: 0x0000ff });

    // Création du mesh
    mesh = new THREE.Mesh(geometry, material);

    // Le cube projette des ombres
    mesh.castShadow = true;

    // Le cube ne reçoit pas d’ombres
    mesh.receiveShadow = false;

    // Ajout à la scène
    scene.add(mesh);

    /* =========================
     CHARGEMENT DU MODÈLE 3D
     ========================= */

    const loader = new GLTFLoader();
    loader.load(
      // Chemin vers le fichier .glb
      new URL("./assets/3D/base.glb", import.meta.url).href,

      // Callback succès
      (gltf) => {
        // On enlève le cube temporaire
        scene.remove(mesh);

        // On remplace par le modèle 3D
        mesh = gltf.scene;

        // Le modèle projette des ombres
        mesh.castShadow = true;
        mesh.receiveShadow = false;

        // Parcours de tous les objets du modèle
        mesh.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = false;

            // Clone du matériau pour éviter des effets de bord
            if (node.material) {
              const newMaterial = node.material.clone();
              newMaterial.shadowSide = THREE.FrontSide;
              node.material = newMaterial;
            }
          }
        });

        // Ajout du modèle à la scène
        scene.add(mesh);
        console.log("Modèle 3D chargé");
      },

      // Callback progression (non utilisé)
      undefined,

      // Callback erreur
      (error) => {
        console.error("Erreur chargement modèle:", error);
      },
    );

    /* =========================
     CAMÉRA
     ========================= */

    // Position de la caméra
    camera.position.set(0, 0, 2);

    /* =========================
     RENDERER
     ========================= */

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
    });

    // Activation des ombres
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // Couleur de fond blanche
    renderer.setClearColor(0xffffff);

    // Taille du renderer
    renderer.setSize(iw, ih);

    /* =========================
     LUMIÈRES
     ========================= */

    // Lumière ambiante (éclaire tout uniformément)
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
    scene.add(ambientLight);

    // Lumière directionnelle (soleil)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 5);

    // Position de la lumière
    directionalLight.position.set(5, 8, 5);

    // La lumière pointe vers le centre
    directionalLight.target.position.set(0, 0, 0);

    // Activation des ombres
    directionalLight.castShadow = true;

    // Résolution de la shadow map
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;

    // Frustum de la caméra d’ombre
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 100;

    // Réduction des artefacts d’ombre
    directionalLight.shadow.bias = 0.0001;
    directionalLight.shadow.normalBias = 0.05;

    scene.add(directionalLight);
    scene.add(directionalLight.target);

    /* =========================
     SOL POUR RECEVOIR L’OMBRE
     ========================= */

    const planeGeometry = new THREE.PlaneGeometry(10, 10);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);

    // Orientation horizontale
    plane.rotation.x = -Math.PI / 2;

    // Position sous le modèle
    plane.position.y = -1;

    // Le plan reçoit les ombres
    plane.receiveShadow = true;

    scene.add(plane);

    // Premier rendu
    renderer.render(scene, camera);

    /* =========================
     DRAG & DROP (POSITION)
     ========================= */

    let isDraggingPosition = false;
    let previousPosX = 0;
    let previousPosY = 0;

    const onMouseDown = (event) => {
      isDraggingPosition = true;
      previousPosX = event.clientX;
      previousPosY = event.clientY;
    };

    const onMouseMove = (event) => {
      if (!isDraggingPosition || !mesh) return;

      // Calcul du déplacement de la souris
      const deltaX = event.clientX - previousPosX;
      const deltaY = event.clientY - previousPosY;

      // Déplacement du modèle
      mesh.position.x += deltaX * 0.005;
      mesh.position.y -= deltaY * 0.005;

      previousPosX = event.clientX;
      previousPosY = event.clientY;
    };

    const onMouseUp = () => {
      isDraggingPosition = false;
    };

    /* =========================
     ANIMATION LOOP
     ========================= */

    const animate = () => {
      requestAnimationFrame(animate);

      // La lumière suit le modèle
      if (mesh) {
        directionalLight.target.position.copy(mesh.position);
        directionalLight.target.updateMatrixWorld();

        // Mise à jour de la caméra d’ombre
        directionalLight.shadow.camera.position.copy(directionalLight.position);
        directionalLight.shadow.camera.lookAt(mesh.position);
        directionalLight.shadow.camera.updateProjectionMatrix();
      }

      renderer.render(scene, camera);
    };

    animate();

    /* =========================
     EVENTS
     ========================= */

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    const handleResize = () => {
      const newIw = window.innerWidth;
      const newIh = window.innerHeight;
      camera.aspect = newIw / newIh;
      camera.updateProjectionMatrix();
      renderer.setSize(newIw, newIh);
    };

    window.addEventListener("resize", handleResize);

    // Cleanup React
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);
  return (
    <main className="relative w-full h-screen">
      <h1 className="absolute p-5">Human.exe POC</h1>
      <canvas ref={canvasRef}></canvas>
    </main>
  );
};

export default App;
