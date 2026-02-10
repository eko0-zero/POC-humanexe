import { useRef, useCallback, useState, useEffect } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { Body, Box, Vec3, Material, ContactMaterial } from "cannon-es";

const ITEM_MATERIAL = new Material("itemMaterial");

const SPAWNED_ITEM_PATH = new URL("../assets/3D/cube.glb", import.meta.url)
  .href;
const GROUND_Y = -1;

let contactMaterialAdded = false;
function ensureContactMaterial(world) {
  if (contactMaterialAdded) return;
  const contact = new ContactMaterial(ITEM_MATERIAL, ITEM_MATERIAL, {
    friction: 0.6,
    restitution: 0.25,
    contactEquationStiffness: 1e7,
    contactEquationRelaxation: 3,
  });
  world.addContactMaterial(contact);
  contactMaterialAdded = true;
}

async function createSpawnedItem(scene, world, position) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      SPAWNED_ITEM_PATH,
      (gltf) => {
        const model = gltf.scene;
        model.position.copy(position);
        model.castShadow = true;
        model.receiveShadow = true;

        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.material) {
              node.material = node.material.clone();
            }
          }
        });

        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const boxMin = box.min;
        const boxMax = box.max;

        // Calcule la distance entre le centre et le sol du modèle
        const centerY = (boxMin.y + boxMax.y) / 2;
        const itemGroundOffset = centerY - boxMin.y;

        const halfExtents = new Vec3(
          Math.max(size.x / 2, 0.05),
          Math.max(size.y / 2, 0.05),
          Math.max(size.z / 2, 0.05),
        );

        const shape = new Box(halfExtents);

        ensureContactMaterial(world);

        const body = new Body({
          mass: 1,
          material: ITEM_MATERIAL,
          linearDamping: 0.4,
          angularDamping: 0.8,
          restitution: 0.25,
          collisionResponse: true,
        });
        body.addShape(shape);

        body.collisionFilterGroup = 1;
        body.collisionFilterMask = 1;

        // Positionne le body pour que le sol soit au GROUND_Y
        body.position.set(
          position.x,
          position.y - itemGroundOffset,
          position.z,
        );

        world.addBody(body);

        // Stocke les informations de physique smooth
        const itemData = {
          mesh: model,
          body,
          size,
          groundOffset: itemGroundOffset,
          // Physique smooth plus rapide
          springStiffness: 1000, // Augmenté
          springDamping: 100, // Augmenté
          isBeingDragged: false,
          desiredX: body.position.x,
          desiredY: body.position.y,
          useSpring: false, // Désactive la spring par défaut
        };

        resolve(itemData);
      },
      undefined,
      (error) => {
        console.error("[SPAWN] Erreur:", error);
        reject(new Error(`Impossible de charger le modèle`));
      },
    );
  });
}

export default function ButtonAddItem({
  scene,
  world,
  spawnedItems,
  camera,
  renderer,
  modelSize,
  characterBody,
  getViewBounds,
}) {
  const isLoadingRef = useRef(false);
  const [itemCount, setItemCount] = useState(0);
  const [error, setError] = useState(null);
  const draggedItemRef = useRef(null);
  const dragOffsetRef = useRef(new THREE.Vector3());
  const dragPlanePointRef = useRef(new THREE.Vector3());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const lastMousePosRef = useRef(new THREE.Vector3());
  const mouseVelocityRef = useRef(new THREE.Vector3());

  const screenToNDC = useCallback(
    (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    },
    [renderer],
  );

  const getMouseOnPlane = useCallback(
    (clientX, clientY, planePoint) => {
      screenToNDC(clientX, clientY);
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const normal = new THREE.Vector3();
      camera.getWorldDirection(normal);
      const plane = new THREE.Plane();
      plane.setFromNormalAndCoplanarPoint(normal, planePoint);

      const target = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(plane, target);
      return target;
    },
    [camera, screenToNDC],
  );

  const getItemUnderMouse = useCallback(
    (clientX, clientY) => {
      if (!spawnedItems.current.length) return null;

      screenToNDC(clientX, clientY);
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const meshes = spawnedItems.current.map((item) => item.mesh);
      const intersects = raycasterRef.current.intersectObjects(meshes, true);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        return spawnedItems.current.find((item) => {
          let node = hitMesh;
          while (node) {
            if (node === item.mesh) return true;
            node = node.parent;
          }
          return false;
        });
      }

      return null;
    },
    [spawnedItems, camera, screenToNDC],
  );

  const clampItemWithinBounds = useCallback(
    (item) => {
      const bounds = getViewBounds();
      if (!bounds) return;

      const { halfW, halfH } = bounds;
      const halfItemW = item.size.x / 2;
      const bodyHalfHeight = item.size.y / 2;

      const minX = -halfW + halfItemW * 0.5;
      const maxX = halfW - halfItemW * 0.5;
      const minY = GROUND_Y + bodyHalfHeight;
      const maxY = halfH - item.size.y / 4;

      // X bounds with rebound
      if (item.body.position.x < minX) {
        item.body.position.x = minX;
        item.body.velocity.x *= -0.4;
      } else if (item.body.position.x > maxX) {
        item.body.position.x = maxX;
        item.body.velocity.x *= -0.4;
      }

      // Y bounds with rebound
      if (item.body.position.y < minY) {
        item.body.position.y = minY;
        item.body.velocity.y *= -0.4;
      } else if (item.body.position.y > maxY) {
        item.body.position.y = maxY;
        item.body.velocity.y *= -0.4;
      }

      // Lock Z
      item.body.position.z = 0;
      item.body.velocity.z = 0;
    },
    [getViewBounds, characterBody, spawnedItems],
  );

  const onMouseDown = useCallback(
    (e) => {
      const { clientX, clientY } = e.touches
        ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
        : { clientX: e.clientX, clientY: e.clientY };

      const item = getItemUnderMouse(clientX, clientY);
      if (!item) return;

      draggedItemRef.current = item;
      item.isBeingDragged = true;
      item.body.type = Body.KINEMATIC;
      item.body.updateMassProperties();
      dragPlanePointRef.current.copy(item.body.position);

      const mouseWorld = getMouseOnPlane(
        clientX,
        clientY,
        dragPlanePointRef.current,
      );

      dragOffsetRef.current.set(
        item.body.position.x - mouseWorld.x,
        item.body.position.y - mouseWorld.y,
        0,
      );

      item.body.velocity.set(0, 0, 0);
      item.body.angularVelocity.set(0, 0, 0);
    },
    [getItemUnderMouse, getMouseOnPlane],
  );

  const onMouseMove = useCallback(
    (e) => {
      if (!draggedItemRef.current) return;

      const { clientX, clientY } = e.touches
        ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
        : { clientX: e.clientX, clientY: e.clientY };

      const item = draggedItemRef.current;
      dragPlanePointRef.current.copy(item.body.position);
      const mouseWorld = getMouseOnPlane(
        clientX,
        clientY,
        dragPlanePointRef.current,
      );

      let desiredX = mouseWorld.x + dragOffsetRef.current.x;
      let desiredY = mouseWorld.y + dragOffsetRef.current.y;

      const bounds = getViewBounds();
      if (bounds) {
        const { halfW, halfH } = bounds;
        const halfItemW = item.size.x / 2;
        const itemHeight = item.size.y;

        desiredX = THREE.MathUtils.clamp(
          desiredX,
          -halfW + halfItemW * 0.5,
          halfW - halfItemW * 0.5,
        );
        desiredY = THREE.MathUtils.clamp(
          desiredY,
          -halfH + itemHeight / 2,
          halfH - itemHeight / 4,
        );

        // Vérifier collision avec le personnage
        if (characterBody) {
          const distX = desiredX - characterBody.position.x;
          const distY = desiredY - characterBody.position.y;
          const distance = Math.sqrt(distX * distX + distY * distY);

          const minDistance = 1.0;

          if (distance < minDistance && distance > 0.01) {
            const angle = Math.atan2(distY, distX);
            desiredX = characterBody.position.x + Math.cos(angle) * minDistance;
            desiredY = characterBody.position.y + Math.sin(angle) * minDistance;
          }
        }

        // Track la vélocité de la souris pour le lancer
        const currentMousePos = new THREE.Vector3(desiredX, desiredY, 0);
        mouseVelocityRef.current.subVectors(
          currentMousePos,
          lastMousePosRef.current,
        );
        lastMousePosRef.current.copy(currentMousePos);

        // Stick to mouse while dragging (no lag)
        item.body.position.x = desiredX;
        item.body.position.y = desiredY;
        item.body.position.z = 0;

        item.body.velocity.set(0, 0, 0);
      }
    },
    [getMouseOnPlane, getViewBounds, characterBody, spawnedItems],
  );

  const onMouseUp = useCallback(() => {
    if (draggedItemRef.current) {
      const item = draggedItemRef.current;

      item.body.type = Body.DYNAMIC;
      item.body.updateMassProperties();

      const velocity = mouseVelocityRef.current.length();
      const minThrowSpeed = 0.015;

      if (velocity > minThrowSpeed) {
        // Non‑linear throw curve: small gesture = light throw, fast gesture = real throw
        const strength = THREE.MathUtils.clamp(velocity * 14, 1.2, 6);

        item.body.applyImpulse(
          new Vec3(
            mouseVelocityRef.current.x * strength,
            mouseVelocityRef.current.y * strength,
            0,
          ),
          item.body.position,
        );

        // Damping to keep it readable and UX‑friendly
        item.body.velocity.scale(0.8, item.body.velocity);
      }

      item.body.angularVelocity.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        0,
      );

      // Réinitialise la vélocité de la souris
      mouseVelocityRef.current.set(0, 0, 0);

      item.isBeingDragged = false;
      item.desiredX = item.body.position.x;
      item.desiredY = item.body.position.y;
    }
    draggedItemRef.current = null;
  }, []);

  useEffect(() => {
    if (!renderer) return;

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchstart", onMouseDown, { passive: false });
    window.addEventListener("touchmove", onMouseMove, { passive: false });
    window.addEventListener("touchend", onMouseUp);

    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchstart", onMouseDown);
      window.removeEventListener("touchmove", onMouseMove);
      window.removeEventListener("touchend", onMouseUp);
    };
  }, [onMouseDown, onMouseMove, onMouseUp, renderer]);

  useEffect(() => {
    window.clampSpawnedItemsWithinBounds = () => {
      spawnedItems.current.forEach((item) => {
        clampItemWithinBounds(item);
      });
    };

    return () => {
      delete window.clampSpawnedItemsWithinBounds;
    };
  }, [spawnedItems, clampItemWithinBounds]);

  const handleClick = useCallback(async () => {
    if (!scene || !world || !spawnedItems) {
      setError("❌ Scene/World/Items non disponible");
      return;
    }

    if (isLoadingRef.current) return;

    try {
      isLoadingRef.current = true;
      setError(null);

      const spawnX = (Math.random() - 0.5) * 2;
      const spawnY = 3;
      const spawnZ = 0;

      const item = await createSpawnedItem(
        scene,
        world,
        new THREE.Vector3(spawnX, spawnY, spawnZ),
      );
      spawnedItems.current.push(item);

      setItemCount(spawnedItems.current.length);
    } catch (err) {
      setError(`Erreur: ${err.message}`);
    } finally {
      isLoadingRef.current = false;
    }
  }, [scene, world, spawnedItems]);

  const isDisabled = isLoadingRef.current || !scene || !world;

  return (
    <div className="absolute top-5 right-5 flex flex-col gap-3 items-end z-10">
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 active:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg"
      >
        {isLoadingRef.current ? "⏳ Chargement..." : "➕ Add Item"}
      </button>

      {itemCount > 0 && (
        <div className="text-sm font-medium text-gray-700 bg-white px-3 py-1 rounded shadow">
          Items: <span className="font-bold text-blue-600">{itemCount}</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-1 rounded shadow border border-red-200 max-w-xs">
          {error}
        </div>
      )}

      {!isDisabled && itemCount === 0 && (
        <div className="text-xs text-gray-500 text-right">
          Cliquez pour spawner
        </div>
      )}

      {itemCount > 0 && (
        <div className="text-xs text-gray-500 text-right">
          📍 Drag les items
        </div>
      )}
    </div>
  );
}
