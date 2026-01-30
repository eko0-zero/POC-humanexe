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

    // Variables pour le contrôle à la souris
    let mouseX = 0;
    let mouseY = 0;

    const onMouseMove = (event) => {
      mouseX = (event.clientX / iw) * 2 - 1;
      mouseY = -(event.clientY / ih) * 2 + 1;
    };

    const animate = () => {
      requestAnimationFrame(animate);
      // Rotation basée sur la position de la souris
      mesh.rotation.y = mouseX * Math.PI;
      mesh.rotation.x = mouseY * Math.PI;
      renderer.render(scene, camera);
    };
    animate();

    window.addEventListener("mousemove", onMouseMove);

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
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <main className="relative w-full h-screen">
      <h1 className="absolute">Human.exe POC</h1>
      <canvas ref={canvasRef}></canvas>
    </main>
  );
};

export default App;
