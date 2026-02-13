// ui/animation.jsx
// Système complet de gestion des animations avec détection de collision
// ✅ VERSION STABLE - AVEC GESTION DE SANTÉ
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";

// Mapping des modèles d'items vers leurs animations correspondantes
// ⚠️ IMPORTANT: Ne mettez QUE les cubes que vous utilisez vraiment!
const ANIMATION_MAPPING = {
  "cube-r.glb": new URL("../assets/3D/animation-r.glb", import.meta.url).href,
  "cube-b.glb": new URL("../assets/3D/animation-b.glb", import.meta.url).href,
  "cube-v.glb": new URL("../assets/3D/animation-v.glb", import.meta.url).href,
  "cube-o.glb": new URL("../assets/3D/animation-o.glb", import.meta.url).href,
};

export class AnimationManager {
  constructor(scene, mesh, skeleton, healthManager = null) {
    this.scene = scene;
    this.mesh = mesh;
    this.skeleton = skeleton;
    this.healthManager = healthManager; // ✅ NOUVEAU: Lien vers le gestionnaire de santé
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.isAnimationPlaying = false;
    this.collisionCooldown = 0;
    this.COLLISION_COOLDOWN_TIME = 1.5;
    this.animationClips = {}; // Cache pour stocker les animations chargées
  }

  // Charge l'animation depuis le fichier GLB spécifié
  async loadAnimation(animationPath) {
    // Retourne depuis le cache si déjà chargée
    if (this.animationClips[animationPath]) {
      return this.animationClips[animationPath];
    }

    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        animationPath,
        (gltf) => {
          // Récupère l'AnimationClip du fichier chargé
          const animationClip = gltf.animations[0];
          if (!animationClip) {
            console.warn(`⚠️ Aucune animation trouvée dans ${animationPath}`);
            reject(new Error("Pas d'animation dans le fichier"));
            return;
          }

          // Stocke l'animation dans le cache
          this.animationClips[animationPath] = animationClip;
          console.log("✅ Animation chargée:", animationClip.name);
          resolve(animationClip);
        },
        undefined,
        (error) => {
          console.error("❌ [Animation] Erreur chargement:", error);
          reject(error);
        },
      );
    });
  }

  // Récupère le chemin d'animation correspondant au modèle de l'item
  getAnimationPathForItem(itemModelPath) {
    if (!itemModelPath) {
      console.warn("⚠️ itemModelPath est null ou undefined");
      return null;
    }

    // Extrait le nom du fichier du chemin complet
    const modelFileName = itemModelPath.split("/").pop();
    console.log("📁 Cherche animation pour:", modelFileName);

    // Retourne le chemin d'animation correspondant ou undefined si pas trouvé
    const animPath = ANIMATION_MAPPING[modelFileName];
    if (!animPath) {
      console.warn(`⚠️ Pas d'animation trouvée pour ${modelFileName}`);
      console.warn("Cubes disponibles:", Object.keys(ANIMATION_MAPPING));
    }
    return animPath;
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
  async playCollisionAnimation(itemToRemove) {
    // Ignore new interactions if an animation is already playing
    if (this.isAnimationPlaying) {
      console.log("⛔ Animation already playing - interaction ignored");
      return;
    }

    // SÉCURITÉ: Vérifier que itemToRemove existe
    if (!itemToRemove) {
      console.warn("⚠️ itemToRemove est null ou undefined");
      return;
    }

    // Récupère le chemin d'animation basé sur le modèle de l'item
    let animationPath = null;
    if (itemToRemove.modelPath) {
      animationPath = this.getAnimationPathForItem(itemToRemove.modelPath);
    }

    if (!animationPath) {
      console.warn("❌ Pas d'animation trouvée pour cet item");
      return;
    }

    // Charge l'animation appropriée
    let animationClip;
    try {
      animationClip = await this.loadAnimation(animationPath);
    } catch (error) {
      console.error("❌ Erreur lors du chargement de l'animation:", error);
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
      console.warn("⚠️ SkinnedMesh ou skeleton non trouvé");
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
      this.mixer = new THREE.AnimationMixer(skinnedMesh);
    } else {
      // IMPORTANT: Arrête les actions précédentes
      this.mixer.stopAllAction();
    }

    // Joue l'animation
    try {
      const action = this.mixer.clipAction(animationClip);
      action.clampWhenFinished = true;
      action.loop = THREE.LoopOnce;
      action.reset();
      action.play();

      console.log("🎬 Animation lancée pour:", animationPath);
    } catch (error) {
      console.error("❌ Erreur lors de la lecture de l'animation:", error);
      this.isAnimationPlaying = false;
      return;
    }

    // === DEBUG ITEM COMPLET DANS LA CONSOLE ===
    console.log("🧩 itemToRemove complet :", itemToRemove);

    if (itemToRemove && itemToRemove.stats) {
      console.log("🎁 Item reçu !");
      console.log("📊 Stats de l'item :", itemToRemove.stats);
    } else {
      console.warn("⚠️ Aucun stats trouvé sur itemToRemove");
    }

    // === ✅ APPLIQUE L'EFFET DE SANTÉ ===
    if (itemToRemove && itemToRemove.stats && this.healthManager) {
      console.log("❤️ Application de l'effet de santé:", itemToRemove.stats);
      this.healthManager.applyItemEffect(itemToRemove.stats);
    } else if (!this.healthManager) {
      console.warn("⚠️ HealthManager non disponible");
    }

    // === SUPPRIME L'ITEM IMMÉDIATEMENT ===
    if (itemToRemove) {
      try {
        // Supprime le mesh de la scène
        if (itemToRemove.mesh) {
          this.scene.remove(itemToRemove.mesh);
        }
        // Supprime le body du monde physique
        if (itemToRemove.body && itemToRemove.body.world) {
          itemToRemove.body.world.removeBody(itemToRemove.body);
        }
        console.log("💨 Item supprimé!");
      } catch (error) {
        console.error("⚠️ Erreur lors de la suppression de l'item:", error);
      }
    }

    // Nettoie après l'animation et réinitialise les bones
    const animationDuration = animationClip.duration * 1000;
    setTimeout(() => {
      try {
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
      } catch (error) {
        console.error("⚠️ Erreur lors de la réinitialisation:", error);
        this.isAnimationPlaying = false;
      }
    }, animationDuration);
  }

  // Appelle cette fonction chaque frame
  update(dt) {
    if (this.mixer) {
      try {
        this.mixer.update(dt);
      } catch (error) {
        console.error("⚠️ Erreur mixer.update:", error);
      }
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

    if (!itemPosition || !characterPosition || !itemSize || !characterSize) {
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
