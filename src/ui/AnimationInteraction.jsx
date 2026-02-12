// ui/animation.jsx
// Système complet de gestion des animations avec détection de collision
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

const ANIMATION_PATH = new URL("../assets/3D/animation1.glb", import.meta.url)
  .href;

export class AnimationManager {
  constructor(scene, mesh, skeleton) {
    this.scene = scene;
    this.mesh = mesh;
    this.skeleton = skeleton;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.isAnimationPlaying = false;
    this.collisionCooldown = 0;
    this.COLLISION_COOLDOWN_TIME = 1.5; // Délai en secondes avant de pouvoir relancer l'animation
  }

  // Charge l'animation depuis le fichier GLB
  async loadAnimation() {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        ANIMATION_PATH,
        (gltf) => {
          // Récupère l'AnimationClip du fichier chargé
          const animationClip = gltf.animations[0];
          if (!animationClip) {
            console.warn("Aucune animation trouvée dans animation1.glb");
            reject(new Error("Pas d'animation dans le fichier"));
            return;
          }

          // Stocke l'animation pour plus tard
          this.animationClip = animationClip;
          console.log("✅ Animation chargée:", animationClip.name);
          resolve(animationClip);
        },
        undefined,
        (error) => {
          console.error("[Animation] Erreur chargement:", error);
          reject(error);
        },
      );
    });
  }

  // Initialise le mixer avec le skeleton du modèle
  initializeMixer(scene) {
    // Crée un mixer pour animer le skeleton
    const mesh = scene.getObjectByProperty("type", "SkinnedMesh");
    if (mesh && mesh.skeleton) {
      // On utilisera le skeleton existant du modèle pour jouer l'animation
      this.prepareMixer(mesh);
    }
  }

  // Prépare le mixer en cherchant le modèle skinné
  prepareMixer(skinnedMesh) {
    // L'animation va être appliquée au skeleton existant
    this.skinnedMesh = skinnedMesh;
  }

  // Lance l'animation quand il y a collision
  playCollisionAnimation(itemToRemove) {
    // Ignore new interactions if an animation is already playing
    if (this.isAnimationPlaying) {
      console.log("⛔ Animation already playing - interaction ignored");
      return;
    }
    // Vérifier le cooldown
    if (this.collisionCooldown > 0) {
      console.log("Animation en cooldown...");
      return;
    }

    if (!this.animationClip) {
      console.warn("Animation pas chargée");
      return;
    }

    this.isAnimationPlaying = true;
    this.collisionCooldown = this.COLLISION_COOLDOWN_TIME;

    // Récupère le modèle skinné de la scène
    let skinnedMesh = null;
    this.scene.traverse((obj) => {
      if (obj.isSkinnedMesh && obj.skeleton) {
        skinnedMesh = obj;
      }
    });

    if (!skinnedMesh || !skinnedMesh.skeleton) {
      console.warn("Modèle skinné non trouvé");
      this.isAnimationPlaying = false;
      return;
    }

    // Stocke les rotations et positions originales des bones
    const originalBoneStates = new Map();
    skinnedMesh.skeleton.bones.forEach((bone) => {
      originalBoneStates.set(bone, {
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone(),
      });
    });

    // Crée ou réutilise le mixer
    if (!this.mixer) {
      // On crée un mixer basé sur le skeleton
      // Puisqu'on veut animer les bones directement
      this.mixer = new THREE.AnimationMixer(skinnedMesh);
    }

    // Joue l'animation
    const action = this.mixer.clipAction(this.animationClip);
    action.clampWhenFinished = true;
    action.loop = THREE.LoopOnce;
    action.reset();
    action.play();

    console.log("🎬 Animation de collision lancée!");

    // === SUPPRIME L'ITEM IMMÉDIATEMENT ===
    if (itemToRemove) {
      // Supprime le mesh de la scène
      this.scene.remove(itemToRemove.mesh);
      // Supprime le body du monde physique
      if (itemToRemove.body && itemToRemove.body.world) {
        itemToRemove.body.world.removeBody(itemToRemove.body);
      }
      console.log("💨 Item supprimé!");
    }

    // Nettoie après l'animation et réinitialise les bones
    const animationDuration = this.animationClip.duration * 1000;
    setTimeout(() => {
      this.isAnimationPlaying = false;

      // Réinitialise les bones à leur état original
      skinnedMesh.skeleton.bones.forEach((bone) => {
        const originalState = originalBoneStates.get(bone);
        if (originalState) {
          bone.position.copy(originalState.position);
          bone.quaternion.copy(originalState.quaternion);
          bone.scale.copy(originalState.scale);
        }
      });

      console.log("✅ Modèle revenu à sa position d'origine");
    }, animationDuration);
  }

  // Appelle cette fonction chaque frame
  update(dt) {
    if (this.mixer) {
      this.mixer.update(dt);
    }

    // Décrémente le cooldown
    if (this.collisionCooldown > 0) {
      this.collisionCooldown -= dt;
    }
  }

  // Détecte si deux sphères (item et modèle) se chevauchent
  // Sans marge supplémentaire - détection exacte sur le modèle
  checkCollision(itemPosition, itemSize, characterPosition, characterSize) {
    // Completely disable collision checks while animation is playing
    if (this.isAnimationPlaying) {
      return false;
    }
    const itemRadius = Math.max(itemSize.x, itemSize.y, itemSize.z) / 2;
    const characterRadius =
      Math.max(characterSize.x, characterSize.y, characterSize.z) / 2;

    const distance = itemPosition.distanceTo(characterPosition);
    // Détection EXACTE sans coefficient de marge
    const minDistance = itemRadius + characterRadius;

    return distance < minDistance;
  }
}
