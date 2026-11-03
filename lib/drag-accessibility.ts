export const dragAccessibility = {
  screenReaderInstructions: {
    draggable:
      "Presiona Espacio para tomar el elemento. Usa las flechas para moverlo, Espacio para soltarlo y Escape para cancelar.",
  },
  announcements: {
    onDragStart: () => "Elemento seleccionado para mover.",
    onDragOver: () => "Elemento sobre una nueva posición.",
    onDragEnd: () => "Movimiento terminado.",
    onDragCancel: () => "Movimiento cancelado.",
  },
};
