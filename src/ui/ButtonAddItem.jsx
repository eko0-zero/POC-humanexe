export default function ButtonAddItem() {
  const handleClick = () => {
    console.log("Bouton cliqué !");
    // Vous pouvez ajouter votre logique ici
  };

  return (
    <main>
      <button
        onClick={handleClick}
        className="absolute top-5 right-5 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors z-10"
      >
        Add Item
      </button>
    </main>
  );
}
