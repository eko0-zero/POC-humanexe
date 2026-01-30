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
    const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    camera.position.set(0, 0, 2);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setClearColor(0xffffff);
    renderer.setSize(iw, ih);
    renderer.render(scene, camera);

    const animate = () => {
      requestAnimationFrame(animate);
      mesh.rotation.z += 0.01;
      mesh.rotation.y += 0.01;
      mesh.rotation.x += 0.01;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const newIw = window.innerWidth;
      const newIh = window.innerHeight;
      camera.aspect = newIw / newIh;
      camera.updateProjectionMatrix();
      renderer.setSize(newIw, newIh);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <main className="relative w-full h-screen">
      <h1 className="absolute">Human.exe POC</h1>
      <canvas ref={canvasRef}></canvas>
    </main>
  );
};

export default App;
