import { useEffect, useRef } from "react";
import "./App.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const App = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const iw = window.innerWidth;
    const ih = window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, iw / ih);
    let mesh = null;

    // Cube temporaire pour tester les ombres (en attendant le modèle)
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({ color: 0x0000ff });
    mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    scene.add(mesh);

    // Charger le modèle 3D et remplacer le cube
    const loader = new GLTFLoader();
    loader.load(
      new URL("./assets/3D/base.glb", import.meta.url).href,
      (gltf) => {
        scene.remove(mesh);
        mesh = gltf.scene;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = false;
            // Clone le matériau pour éviter les conflits
            if (node.material) {
              const newMaterial = node.material.clone();
              newMaterial.shadowSide = THREE.FrontSide;
              node.material = newMaterial;
            }
          }
        });
        scene.add(mesh);
        console.log("Modèle 3D chargé");
      },
      undefined,
      (error) => {
        console.error("Erreur chargement modèle:", error);
      }
    );

    camera.position.set(0, 0, 2);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0xffffff);
    renderer.setSize(iw, ih);

    // Lumière ambiante
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
    scene.add(ambientLight);

    // Lumière directionnelle avec ombres
    const directionalLight = new THREE.DirectionalLight(0xffffff, 5);
    directionalLight.position.set(5, 8, 5);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.bias = 0.0001;
    directionalLight.shadow.normalBias = 0.05;
    scene.add(directionalLight);
    scene.add(directionalLight.target);

    // Plan pour recevoir l'ombre
    const planeGeometry = new THREE.PlaneGeometry(10, 10);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -1;
    plane.receiveShadow = true;
    scene.add(plane);

    renderer.render(scene, camera);

    // Stocke l'accumulation de rotation
    let mouseX = 0;
    let mouseY = 0;
    // Variables pour le drag and drop de rotation
    let isDraggingRotation = false;
    let previousMouseX = 0;
    let previousMouseY = 0;
    // Variables pour le drag and drop de position (Alt + drag)
    let isDraggingPosition = false;
    let previousPosX = 0;
    let previousPosY = 0;

    // Fonction appelée quand la souris est enfoncée
    const onMouseDown = (event) => {
      // Position drag uniquement
      isDraggingPosition = true;
      previousPosX = event.clientX;
      previousPosY = event.clientY;
    };

    // Fonction appelée quand la souris se déplace
    const onMouseMove = (event) => {
  if (isDraggingPosition) {
        // Calcule la différence de mouvement
        const deltaX = event.clientX - previousPosX;
        const deltaY = event.clientY - previousPosY;
        // Applique le delta à la position du cube
        mesh.position.x += deltaX * 0.005;
        mesh.position.y -= deltaY * 0.005;
        // Sauvegarde la position pour le prochain frame
        previousPosX = event.clientX;
        previousPosY = event.clientY;
      }
    };

    // Fonction appelée quand la souris est relâchée
    const onMouseUp = () => {
      isDraggingPosition = false;
    };

    const animate = () => {
      requestAnimationFrame(animate);
      
      // La lumière suit le modèle
      if (mesh && mesh.position) {
        const modelPos = mesh.position;
        directionalLight.target.position.copy(modelPos);
        directionalLight.target.updateMatrixWorld();
        
        // Met à jour la caméra d'ombre pour suivre le modèle
        directionalLight.shadow.camera.position.copy(directionalLight.position);
        directionalLight.shadow.camera.lookAt(modelPos);
        directionalLight.shadow.camera.updateProjectionMatrix();
      }
      
      renderer.render(scene, camera);
    };
    animate();

    // Enregistre les écouteurs de souris pour le drag and drop
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
