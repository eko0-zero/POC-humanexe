import React, { useState, useEffect } from "react";

export class HealthManager {
  constructor(maxHealth = 200) {
    this.maxHealth = maxHealth;
    this.currentHealth = 50; // ✅ Commence à 100
    this.healthChangeCallbacks = [];
  }

  // Ajoute un callback appelé quand la santé change
  onHealthChange(callback) {
    this.healthChangeCallbacks.push(callback);
  }

  // Applique les dégâts ou soins d'un item
  applyItemEffect(itemStats) {
    if (!itemStats) return;

    const healthValue = itemStats.health || itemStats.power || 0;
    const previousHealth = this.currentHealth;

    // Applique le changement
    this.currentHealth = Math.max(
      0,
      Math.min(this.maxHealth, this.currentHealth + healthValue),
    );

    // Notifie tous les listeners
    this.healthChangeCallbacks.forEach((callback) => {
      callback({
        currentHealth: this.currentHealth,
        maxHealth: this.maxHealth,
        change: this.currentHealth - previousHealth,
        itemStats: itemStats,
        isDamage: healthValue < 0,
        isHealing: healthValue > 0,
      });
    });

    console.log(
      `❤️ Santé: ${previousHealth} → ${this.currentHealth} (${healthValue > 0 ? "+" : ""}${healthValue})`,
    );
  }

  getHealthPercentage() {
    return (this.currentHealth / this.maxHealth) * 200;
  }

  isDead() {
    return this.currentHealth <= 0;
  }

  heal(amount) {
    this.applyItemEffect({ health: amount, name: "Heal" });
  }

  takeDamage(amount) {
    this.applyItemEffect({ health: -amount, name: "Damage" });
  }
}

// Composant React pour afficher la barre de vie
export function HealthBar({ healthManager }) {
  const [health, setHealth] = useState(200);
  const [maxHealth, setMaxHealth] = useState(200);
  const [lastChange, setLastChange] = useState(null);
  const [showDamageEffect, setShowDamageEffect] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState([]);

  useEffect(() => {
    if (!healthManager) return;

    // Setup du callback
    const handleHealthChange = (data) => {
      setHealth(data.currentHealth);
      setMaxHealth(data.maxHealth);
      setLastChange(data);

      // Effet de dégât (flash rouge)
      if (data.isDamage) {
        setShowDamageEffect(true);
        setTimeout(() => setShowDamageEffect(false), 200);
      }

      // Texte flottant
      const newFloatingText = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        value: data.change,
        isDamage: data.isDamage,
        x: Math.random() * 40 - 20,
      };
      setFloatingTexts((prev) => [...prev, newFloatingText]);

      // Supprime le texte après animation
      setTimeout(() => {
        setFloatingTexts((prev) =>
          prev.filter((t) => t.id !== newFloatingText.id),
        );
      }, 1500);
    };

    healthManager.onHealthChange(handleHealthChange);

    // ✅ APPELLE LE CALLBACK AU DÉMARRAGE POUR INITIALISER LA BARRE
    handleHealthChange({
      currentHealth: healthManager.currentHealth,
      maxHealth: healthManager.maxHealth,
      change: 0,
      itemStats: { name: "Initial" },
      isDamage: false,
      isHealing: false,
    });
  }, [healthManager]);

  // ✅ 100 HP = 100%
  const healthPercentage = (health / maxHealth) * 100; // 200 HP = 100% width
  const displayPercentage = (health / maxHealth) * 200; // 200 HP = 200% affiché
  const isLowHealth = health / maxHealth < 0.35;
  const isCritical = health / maxHealth < 0.2;

  return (
    <div className="health-bar-container">
      {/* Barre de vie principale */}
      <div
        className={`health-bar-wrapper ${showDamageEffect ? "damage-flash" : ""}`}
      >
        <div className="health-bar-background">
          <div
            className={`health-bar-fill ${isLowHealth ? "low-health" : ""} ${isCritical ? "critical" : ""}`}
            style={{
              width: `${healthPercentage}%`,
              transition: "width 0.3s ease-out",
            }}
          >
            {/* Effet de brillance */}
            <div className="health-bar-shine"></div>
          </div>
        </div>

        {/* Texte de santé - Affiche le pourcentage */}
        <div className="health-text">
          <span className="health-percentage">
            {Math.ceil(displayPercentage)}%
          </span>
        </div>
      </div>

      {/* État critique */}
      {isCritical && <div className="critical-warning">⚠️ SANTÉ CRITIQUE</div>}

      {/* Textes flottants */}
      <div className="floating-texts">
        {floatingTexts.map((text) => (
          <div
            key={text.id}
            className={`floating-text ${text.isDamage ? "damage" : "heal"}`}
            style={{
              "--x-offset": `${text.x}px`,
            }}
          >
            {text.isDamage ? "-" : "+"}
            {Math.abs(text.value)}
          </div>
        ))}
      </div>

      <style>{`
        .health-bar-container {
          position: absolute;
          top: 100px;
          left: 20px;
          width: 600px;
          z-index: 100;
          font-family: 'Arial', sans-serif;
        }

        .health-bar-wrapper {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.5);
          padding: 8px;
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.7);
          transition: box-shadow 0.2s;
        }

        .health-bar-wrapper.damage-flash {
          animation: damageFlash 0.2s ease-out;
        }

        @keyframes damageFlash {
          0% { box-shadow: 0 0 30px rgba(255, 0, 0, 0.8); }
          100% { box-shadow: 0 0 20px rgba(0, 0, 0, 0.7); }
        }

        .health-bar-background {
          width: 100%;
          height: 28px;
          background: rgba(20, 20, 20, 0.8);
          border-radius: 4px;
          overflow: hidden;
          border: 2px solid rgba(100, 100, 100, 0.5);
          position: relative;
        }

        .health-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #00ff00, #90EE90);
          border-radius: 2px;
          position: relative;
          box-shadow: 0 0 10px rgba(0, 255, 0, 0.6);
          transition: background 0.3s ease-out;
        }

        .health-bar-fill.low-health {
          background: linear-gradient(90deg, #ff9800, #ffeb3b);
          box-shadow: 0 0 10px rgba(255, 152, 0, 0.8);
        }

        .health-bar-fill.critical {
          background: linear-gradient(90deg, #ff4444, #ff0000);
          box-shadow: 0 0 15px rgba(255, 0, 0, 1);
          animation: criticalPulse 0.6s infinite;
        }

        @keyframes criticalPulse {
          0%, 100% { box-shadow: 0 0 15px rgba(255, 0, 0, 0.8); }
          50% { box-shadow: 0 0 25px rgba(255, 0, 0, 1); }
        }

        .health-bar-shine {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 50%;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.3), transparent);
          border-radius: 2px 2px 0 0;
        }

        .health-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          color: white;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
          font-weight: bold;
          pointer-events: none;
        }

        .health-percentage {
          font-size: 16px;
          opacity: 1;
          font-weight: bold;
        }

        .critical-warning {
          margin-top: 8px;
          padding: 6px 12px;
          background: rgba(255, 0, 0, 0.7);
          color: white;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          text-align: center;
          animation: warningPulse 0.8s infinite;
        }

        @keyframes warningPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .floating-texts {
          position: absolute;
          top: 0;
          left: 0;
          width: 200%;
          pointer-events: none;
        }

        .floating-text {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translateX(var(--x-offset));
          font-weight: bold;
          font-size: 18px;
          animation: floatUp 1.5s ease-out forwards;
          text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
        }

        .floating-text.damage {
          color: #ff4444;
        }

        .floating-text.heal {
          color: #00ff00;
        }

        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translateX(var(--x-offset)) translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateX(var(--x-offset)) translateY(-40px);
          }
        }

        .item-received-indicator {
          margin-top: 8px;
          padding: 6px 12px;
          background: rgba(0, 100, 200, 0.6);
          border-left: 3px solid #00ccff;
          border-radius: 3px;
          font-size: 12px;
          color: white;
          animation: slideIn 0.3s ease-out;
        }

        .damage-indicator {
          color: #ff6b6b;
          font-weight: bold;
        }

        .heal-indicator {
          color: #51cf66;
          font-weight: bold;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
