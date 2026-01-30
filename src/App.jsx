import { useEffect, useRef } from "react";
import "./App.css";
import * as THREE from "three";

const App = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const iw = window.innerWidth;
    const ih = window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, iw / ih);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshPhongMaterial({ color: 0x000ff });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    camera.position.set(0, 0, 2);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0xffffff);
    renderer.setSize(iw, ih);

    // Lumière ambiante
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    // Lumière directionnelle avec ombres
    const directionalLight = new THREE.DirectionalLight(0xffffff, 6);
    directionalLight.position.set(7, 10, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

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
      // Si Alt est pressé, commence le drag de rotation
      if (event.shiftKey) {
        isDraggingRotation = true;
        previousMouseX = event.clientX;
        previousMouseY = event.clientY;
      } else {
        // Sinon, commence le drag de position
        isDraggingPosition = true;
        previousPosX = event.clientX;
        previousPosY = event.clientY;
      }
    };

    // Fonction appelée quand la souris se déplace
    const onMouseMove = (event) => {
      // Si on drag la rotation
      if (isDraggingRotation) {
        // Calcule la différence de mouvement
        const deltaX = event.clientX - previousMouseX;
        const deltaY = event.clientY - previousMouseY;
        // Ajoute le delta à la rotation
        mouseX += deltaX * 0.01;
        mouseY += deltaY * 0.01;
        // Sauvegarde la position pour le prochain frame
        previousMouseX = event.clientX;
        previousMouseY = event.clientY;
      }
      // Si on drag la position
      else if (isDraggingPosition) {
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
      // Arrête tous les drags
      isDraggingRotation = false;
      isDraggingPosition = false;
    };

    const animate = () => {
      requestAnimationFrame(animate);
      // Applique la rotation Y du cube basée sur le drag horizontal
      mesh.rotation.y = mouseX;
      // Applique la rotation X du cube basée sur le drag vertical
      mesh.rotation.x = mouseY;
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
