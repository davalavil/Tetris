// --- Configuración del Juego ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 1; // Tamaño de cada celda de la cuadrícula

// --- Variables Globales ---
let scene, camera, renderer;
let board;
let boardMeshes;
let currentPiece;
let score = 0;
let gameOver = false;
let gameLoopTimeout;
let fallSpeed = 1000;

const scoreElement = document.getElementById('score');
const gameOverElement = document.getElementById('game-over');

// --- Definiciones de Piezas (Tetrominós) ---
const PIECES = [
    // Colores estándar de Tetris Guideline
    { shape: [[1, 1, 1, 1]], color: 0x00FFFF }, // I (Cian)
    { shape: [[1, 1], [1, 1]], color: 0xFFFF00 }, // O (Amarillo)
    { shape: [[0, 1, 0], [1, 1, 1]], color: 0x800080 }, // T (Púrpura)
    { shape: [[0, 1, 1], [1, 1, 0]], color: 0x00FF00 }, // S (Verde)
    { shape: [[1, 1, 0], [0, 1, 1]], color: 0xFF0000 }, // Z (Rojo)
    { shape: [[1, 0, 0], [1, 1, 1]], color: 0x0000FF }, // J (Azul)
    { shape: [[0, 0, 1], [1, 1, 1]], color: 0xFF7F00 }  // L (Naranja)
];

// --- Inicialización ---
function init() {
    // Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // Cámara (Ortográfica)
    // El tablero ahora va de X=0 a COLS*BS, Y=0 a -ROWS*BS
    // Centraremos la cámara en medio de esta área.
    const boardWidth = COLS * BLOCK_SIZE;
    const boardHeight = ROWS * BLOCK_SIZE;
    const aspect = window.innerWidth / window.innerHeight;

    // Ajusta el tamaño de la vista para que quepa el tablero + un poco de margen
    const verticalMargin = 2 * BLOCK_SIZE;
    const frustumHeight = boardHeight + verticalMargin;
    const frustumWidth = frustumHeight * aspect;

    camera = new THREE.OrthographicCamera(
        frustumWidth / -2, frustumWidth / 2,
        frustumHeight / 2, frustumHeight / -2,
        1, 1000
    );

    // Posiciona la cámara para que mire al centro del tablero
    // Centro X = boardWidth / 2
    // Centro Y = -boardHeight / 2 (porque Y va hacia abajo en el tablero lógico)
    camera.position.set(
        boardWidth / 2,
        -boardHeight / 2,
        10 // Distancia Z
    );
    // Asegurarse de que la cámara apunta exactamente al centro del tablero en Z=0
    camera.lookAt(
         boardWidth / 2,
        -boardHeight / 2,
         0
    );
    scene.add(camera);


    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    // Ajustar la posición de la luz relativa al centro del tablero
    directionalLight.position.set(boardWidth / 2 + 5, -boardHeight / 2 + 10, 7.5);
    scene.add(directionalLight);

    // Crear el tablero lógico y visual
    createBoard();
    createVisualBoard(); // Dibuja la cuadrícula/fondo alineados

    // Iniciar el juego
    resetGame();

    // Manejador de eventos de teclado
    document.addEventListener('keydown', handleKeyPress);
    window.addEventListener('resize', onWindowResize, false);
    animate();
}

// --- Lógica del Tablero ---
function createBoard() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    boardMeshes = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function createVisualBoard() {
    const boardWidth = COLS * BLOCK_SIZE;
    const boardHeight = ROWS * BLOCK_SIZE;

    // Plano de fondo
    const planeGeo = new THREE.PlaneGeometry(boardWidth, boardHeight);
    const planeMat = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide, roughness: 0.8 });
    const backgroundPlane = new THREE.Mesh(planeGeo, planeMat);
    // Centrar el plano en el área del tablero (X=ancho/2, Y=-alto/2)
    backgroundPlane.position.set(
         boardWidth / 2,
        -boardHeight / 2,
        -BLOCK_SIZE // Ligeramente detrás de los bloques
    );
    scene.add(backgroundPlane);

    // Cuadrícula visual - AHORA ALINEADA CON EL SISTEMA DE COORDENADAS DEL TABLERO
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.7 }); // Color más visible
    const points = [];
    // Líneas verticales (en x = 0, BS, 2*BS, ..., COLS*BS)
    for (let j = 0; j <= COLS; j++) {
        points.push(new THREE.Vector3(j * BLOCK_SIZE, 0, 0));              // Punto superior (Y=0)
        points.push(new THREE.Vector3(j * BLOCK_SIZE, -boardHeight, 0)); // Punto inferior (Y=-alto)
    }
    // Líneas horizontales (en y = 0, -BS, -2*BS, ..., -ROWS*BS)
    for (let i = 0; i <= ROWS; i++) {
        points.push(new THREE.Vector3(0, -i * BLOCK_SIZE, 0));           // Punto izquierdo (X=0)
        points.push(new THREE.Vector3(boardWidth, -i * BLOCK_SIZE, 0)); // Punto derecho (X=ancho)
    }

    const gridGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const gridLines = new THREE.LineSegments(gridGeometry, gridMaterial);
    // La cuadrícula ahora se dibuja desde (0,0) hasta (ancho, -alto), así que no necesita desplazamiento.
    // Solo una pequeña Z para estar delante del fondo.
    gridLines.position.set(0, 0, -BLOCK_SIZE / 2 + 0.01);
    scene.add(gridLines);
}


// --- Lógica de Piezas ---
function getRandomPiece() {
    const index = Math.floor(Math.random() * PIECES.length);
    const pieceData = PIECES[index];
    const shapeClone = pieceData.shape.map(row => row.slice());
    return {
        x: Math.floor(COLS / 2) - Math.floor(shapeClone[0].length / 2),
        y: 0, // Empezar arriba (fila lógica 0)
        shape: shapeClone,
        color: pieceData.color,
        mesh: null
    };
}

// Geometría y material base para los bloques (reutilizables)
const blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE * 0.95, BLOCK_SIZE * 0.95, BLOCK_SIZE * 0.95); // Ligeramente más pequeño
const edgeGeometry = new THREE.EdgesGeometry(blockGeometry);
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

function drawPiece() {
    // Limpiar mesh anterior
    if (currentPiece.mesh) {
        scene.remove(currentPiece.mesh);
        // Limpiar hijos (bloques y bordes) - IMPORTANTE para liberar memoria
        while(currentPiece.mesh.children.length > 0){
            let child = currentPiece.mesh.children[0];
            currentPiece.mesh.remove(child);
            if (child.geometry) child.geometry.dispose();
            // No desechamos materiales básicos si los reutilizamos (como edgeMaterial)
            // Si creas materiales específicos por pieza, sí deberías desecharlos aquí.
        }
    }

    const pieceGroup = new THREE.Group();
    // Crear un material específico para esta pieza (basado en su color)
    const pieceMaterial = new THREE.MeshStandardMaterial({
        color: currentPiece.color,
        roughness: 0.4,
        metalness: 0.1
    });

    currentPiece.shape.forEach((row, dy) => {
        row.forEach((value, dx) => {
            if (value) {
                // --- NUEVO CÁLCULO DE POSICIÓN ---
                // La celda (boardX, boardY) corresponde a la columna 'c' y fila 'r'
                // c = currentPiece.x + dx
                // r = currentPiece.y + dy
                // El centro X de la celda 'c' es (c + 0.5) * BLOCK_SIZE
                // El centro Y de la celda 'r' es -(r + 0.5) * BLOCK_SIZE (negativo por Y invertida)
                const blockX = (currentPiece.x + dx + 0.5) * BLOCK_SIZE;
                const blockY = -(currentPiece.y + dy + 0.5) * BLOCK_SIZE;

                // Crear el mesh del bloque
                const blockMesh = new THREE.Mesh(blockGeometry, pieceMaterial);
                blockMesh.position.set(blockX, blockY, 0);
                pieceGroup.add(blockMesh);

                // Añadir bordes (usando el mismo cálculo de posición)
                const wireframe = new THREE.LineSegments(edgeGeometry, edgeMaterial);
                wireframe.position.copy(blockMesh.position); // Copiar posición
                pieceGroup.add(wireframe);
            }
        });
    });

    currentPiece.mesh = pieceGroup;
    scene.add(currentPiece.mesh);
}


function drawBoard() {
    // Limpiar meshes antiguos del tablero
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (boardMeshes[r][c]) {
                let meshGroup = boardMeshes[r][c];
                 scene.remove(meshGroup);
                 // Limpiar hijos (bloque y borde)
                 while(meshGroup.children.length > 0){
                     let child = meshGroup.children[0];
                     meshGroup.remove(child);
                     if (child.geometry) child.geometry.dispose();
                     if (child.material && child.material !== edgeMaterial) { // No desechar material de borde compartido
                         child.material.dispose();
                     }
                 }
                boardMeshes[r][c] = null;
            }
        }
    }

    // Crear nuevos meshes basados en el estado lógico del tablero
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) { // Si la celda no está vacía
                // Crear material específico para este bloque fijo
                 const blockMaterial = new THREE.MeshStandardMaterial({
                    color: board[r][c], // Usar el color guardado
                    roughness: 0.4,
                    metalness: 0.1
                });

                // --- NUEVO CÁLCULO DE POSICIÓN ---
                // Centro X de la celda 'c' = (c + 0.5) * BLOCK_SIZE
                // Centro Y de la celda 'r' = -(r + 0.5) * BLOCK_SIZE
                const blockX = (c + 0.5) * BLOCK_SIZE;
                const blockY = -(r + 0.5) * BLOCK_SIZE;

                // Crear mesh y borde
                const blockMesh = new THREE.Mesh(blockGeometry, blockMaterial);
                blockMesh.position.set(blockX, blockY, 0);

                const wireframe = new THREE.LineSegments(edgeGeometry, edgeMaterial);
                wireframe.position.copy(blockMesh.position);

                // Agrupar bloque y borde
                const blockGroup = new THREE.Group();
                blockGroup.add(blockMesh);
                blockGroup.add(wireframe);

                scene.add(blockGroup);
                boardMeshes[r][c] = blockGroup; // Guardar referencia al grupo
            }
        }
    }
}


// --- Movimiento y Colisiones ---
function isValidMove(newX, newY, pieceShape) {
    for (let y = 0; y < pieceShape.length; y++) {
        for (let x = 0; x < pieceShape[y].length; x++) {
            if (pieceShape[y][x]) {
                const boardX = newX + x; // Columna lógica
                const boardY = newY + y; // Fila lógica

                // 1. Límites laterales (columnas 0 a COLS-1)
                if (boardX < 0 || boardX >= COLS) {
                    return false;
                }
                // 2. Límite inferior (filas 0 a ROWS-1)
                if (boardY >= ROWS) {
                    return false;
                }
                // 3. Límite superior (fila < 0 está bien mientras la pieza desciende)
                // 4. Colisión con bloques existentes (solo si estamos dentro del tablero Y>=0)
                if (boardY >= 0 && board[boardY][boardX]) {
                    return false;
                }
            }
        }
    }
    return true;
}

function movePiece(dx, dy) {
    if (gameOver) return;
    const newX = currentPiece.x + dx;
    const newY = currentPiece.y + dy;

    if (isValidMove(newX, newY, currentPiece.shape)) {
        currentPiece.x = newX;
        currentPiece.y = newY;
        drawPiece(); // Redibujar en la nueva posición lógica (el cálculo interno la posicionará visualmente)
        return true;
    }
    return false;
}

function rotatePiece() {
     if (gameOver) return;
    const originalShape = currentPiece.shape.map(row => row.slice()); // Clonar por si falla
    const shape = currentPiece.shape;
    const N = shape.length;
    const M = shape[0].length;
    const newShape = Array.from({ length: M }, () => Array(N).fill(0));

    // Rotar 90 grados clockwise
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < M; x++) {
            newShape[x][N - 1 - y] = shape[y][x];
        }
    }

    // Comprobar validez y "wall kicks" simples
    let potentialX = currentPiece.x;
    if (isValidMove(potentialX, currentPiece.y, newShape)) {
        // Válido en la posición actual
    } else if (isValidMove(potentialX + 1, currentPiece.y, newShape)) {
        potentialX++; // Kick derecha
    } else if (isValidMove(potentialX - 1, currentPiece.y, newShape)) {
         potentialX--; // Kick izquierda
    } else if (isValidMove(potentialX + 2, currentPiece.y, newShape)) { // Kick doble (para pieza I)
         potentialX += 2;
    } else if (isValidMove(potentialX - 2, currentPiece.y, newShape)) { // Kick doble (para pieza I)
         potentialX -= 2;
    }
     else {
        return; // No se pudo rotar ni con kicks
    }

    // Aplicar rotación y posible desplazamiento
    currentPiece.x = potentialX;
    currentPiece.shape = newShape;
    drawPiece();
}

// --- Lógica del Juego ---
function placePiece() {
    currentPiece.shape.forEach((row, dy) => {
        row.forEach((value, dx) => {
            if (value) {
                const boardX = currentPiece.x + dx;
                const boardY = currentPiece.y + dy;
                // Solo añadir al tablero si está dentro de los límites verticales lógicos
                if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
                     board[boardY][boardX] = currentPiece.color;
                }
            }
        });
    });

    // Eliminar la pieza activa de la escena (su mesh)
     if (currentPiece.mesh) {
         scene.remove(currentPiece.mesh);
          // Limpiar hijos (bloques y bordes)
        while(currentPiece.mesh.children.length > 0){
            let child = currentPiece.mesh.children[0];
            currentPiece.mesh.remove(child);
            if (child.geometry) child.geometry.dispose();
            // No desechar materiales globales
        }
    }
    currentPiece = null;

    // Redibujar el tablero con la pieza fijada (drawBoard usa la lógica actualizada)
    drawBoard();
}


function clearLines() {
    let linesCleared = 0;
    let rowsToRemove = [];

    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(cell => cell > 0)) {
            linesCleared++;
            rowsToRemove.push(r);
        }
    }

    if (linesCleared > 0) {
        // Eliminar filas completas (filtrando las que no están en rowsToRemove)
        board = board.filter((row, index) => !rowsToRemove.includes(index));

        // Añadir filas vacías al principio
        for (let i = 0; i < linesCleared; i++) {
            board.unshift(Array(COLS).fill(0));
        }

        // Actualizar puntuación
        const points = [0, 100, 300, 500, 800]; // Puntos por 1, 2, 3, 4 líneas
        score += points[linesCleared] || 0; // Usar lookup o 0 si linesCleared es 0 o >4
        scoreElement.textContent = `Score: ${score}`;

        // Redibujar el tablero visual completamente
        drawBoard();

        // Aumentar velocidad
        fallSpeed = Math.max(150, fallSpeed - linesCleared * 20); // Ajustar aceleración
        console.log("New Fall Speed:", fallSpeed);
    }
}


function checkGameOver() {
    // Si la nueva pieza colisiona inmediatamente al generarse en su posición inicial
    if (!isValidMove(currentPiece.x, currentPiece.y, currentPiece.shape)) {
        gameOver = true;
        gameOverElement.style.display = 'block'; // Mostrar mensaje
        if (gameLoopTimeout) clearTimeout(gameLoopTimeout); // Detener caídas
        console.log("Game Over! Final Score:", score);
         // Opcional: Hacer la última pieza semi-transparente o gris
         if(currentPiece.mesh) {
             currentPiece.mesh.children.forEach(child => {
                 if (child.material && child.material.color) {
                     //child.material.color.setHex(0x888888);
                     child.material.opacity = 0.5;
                     child.material.transparent = true;
                 }
             });
         }
    }
}

function gameLoop() {
    if (gameOver) return;

    if (!movePiece(0, 1)) { // Intenta mover hacia abajo
        // Si no puede moverse (colisión o fondo)
        placePiece();
        clearLines(); // Esto puede actualizar el tablero visualmente
        currentPiece = getRandomPiece();
        drawPiece(); // Dibuja la nueva pieza
        checkGameOver(); // Comprueba si la nueva pieza causa Game Over
    }

    // Programa la siguiente caída si el juego continúa
    if (!gameOver) {
        if (gameLoopTimeout) clearTimeout(gameLoopTimeout); // Limpiar anterior por si acaso
        gameLoopTimeout = setTimeout(gameLoop, fallSpeed);
    }
}

function resetGame() {
    console.log("Reiniciando juego...");
    if (gameLoopTimeout) clearTimeout(gameLoopTimeout);

    // Limpiar tablero lógico y visual
    createBoard(); // Reinicia array lógico
    drawBoard(); // Limpia meshes existentes y redibuja (ahora estará vacío)

    score = 0;
    scoreElement.textContent = `Score: ${score}`;
    fallSpeed = 1000; // Resetear velocidad
    gameOver = false;
    gameOverElement.style.display = 'none'; // Ocultar mensaje

    // Eliminar pieza actual de la escena si existe
    if (currentPiece && currentPiece.mesh) {
        scene.remove(currentPiece.mesh);
         while(currentPiece.mesh.children.length > 0){ // Limpiar recursos
            let child = currentPiece.mesh.children[0];
            currentPiece.mesh.remove(child);
            if (child.geometry) child.geometry.dispose();
            // No desechar mat globales
        }
        currentPiece = null;
    }

    // Crear y dibujar la primera pieza
    currentPiece = getRandomPiece();
    drawPiece();

    // Iniciar el bucle
    gameLoop();
}


// --- Manejadores de Eventos ---
function handleKeyPress(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
        event.preventDefault(); // Prevenir scroll con flechas y espacio
    }

    // Si el juego ha terminado, solo permitir reiniciar (si hubiera un botón de reinicio general)
    if (gameOver) {
        // Podrías añadir aquí que si pulsa 'Enter' o 'R' se reinicie
        // if (event.key === 'Enter' || event.key === 'r') {
        //     reiniciarJuego();
        // }
        return;
    }


    switch (event.key) {
        case 'ArrowLeft':
            movePiece(-1, 0);
            break;
        case 'ArrowRight':
            movePiece(1, 0);
            break;
        case 'ArrowDown':
             // Acelerar caída
             if (movePiece(0, 1)) {
                 // Bonus por bajar rápido (opcional)
                 score += 1;
                 scoreElement.textContent = `Score: ${score}`;
                 // Reiniciar timer para que no acumule velocidad extraña
                 clearTimeout(gameLoopTimeout);
                 gameLoopTimeout = setTimeout(gameLoop, fallSpeed);
             } else {
                 // Si no pudo bajar más, forzar ciclo de colocar/nueva pieza
                 clearTimeout(gameLoopTimeout);
                 gameLoop();
             }
            break;
        case 'ArrowUp':
            rotatePiece();
            break;
        case ' ': // Hard Drop (Espacio)
            while(movePiece(0, 1)) {
                 score += 2; // Bonus por hard drop
            }
            scoreElement.textContent = `Score: ${score}`;
            // Forzar ciclo de colocar/nueva pieza inmediatamente
            clearTimeout(gameLoopTimeout);
            gameLoop();
            break;
    }
}

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const boardHeight = ROWS * BLOCK_SIZE;
    const verticalMargin = 2 * BLOCK_SIZE;
    const frustumHeight = boardHeight + verticalMargin;
    const frustumWidth = frustumHeight * aspect;

    // Actualizar límites de la cámara ortográfica
    camera.left = frustumWidth / -2;
    camera.right = frustumWidth / 2;
    camera.top = frustumHeight / 2;
    camera.bottom = frustumHeight / -2;
    camera.updateProjectionMatrix(); // ¡Importante!

    renderer.setSize(window.innerWidth, window.innerHeight);
}


// --- Bucle de Animación ---
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// --- Hacer la función de reinicio globalmente accesible ---
window.reiniciarJuego = resetGame;

// --- Iniciar Todo ---
init();
