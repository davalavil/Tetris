// import * as THREE from 'three'; // <--- ELIMINA ESTA LÍNEA

// --- Configuración del Juego ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 1; // Tamaño de cada cubo en la escena 3D
const EMPTY_COLOR = 0x444444; // Color para celdas vacías (opcional, para el fondo visual)

// --- Variables Globales ---
// THREE ya estará disponible globalmente gracias al script en index.html
let scene, camera, renderer;
let board; // Array 2D para la lógica del juego (0 = vacío, >0 = color del bloque)
let boardMeshes; // Array 2D para los meshes de Three.js en el tablero
let currentPiece; // Objeto representando la pieza actual
let score = 0;
let gameOver = false;
let gameLoopTimeout;
let fallSpeed = 1000; // Milisegundos entre cada caída

const scoreElement = document.getElementById('score');
const gameOverElement = document.getElementById('game-over');

// --- Definiciones de Piezas (Tetrominós) ---
const PIECES = [
    // I
    { shape: [[1, 1, 1, 1]], color: 0xFF0000 }, // Rojo
    // O
    { shape: [[1, 1], [1, 1]], color: 0xFFFF00 }, // Amarillo
    // T
    { shape: [[0, 1, 0], [1, 1, 1]], color: 0x800080 }, // Púrpura
    // S
    { shape: [[0, 1, 1], [1, 1, 0]], color: 0x00FF00 }, // Verde
    // Z
    { shape: [[1, 1, 0], [0, 1, 1]], color: 0x0000FF }, // Azul
    // J
    { shape: [[1, 0, 0], [1, 1, 1]], color: 0xFF7F00 }, // Naranja
    // L
    { shape: [[0, 0, 1], [1, 1, 1]], color: 0x00FFFF }  // Cian
];

// --- Inicialización ---
function init() {
    // Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // Cámara (Ortográfica)
    const aspect = window.innerWidth / window.innerHeight;
    // Ajusta el tamaño de la vista para que quepa el tablero + un poco de margen
    const frustumHeight = ROWS * BLOCK_SIZE + 2 * BLOCK_SIZE;
    const frustumWidth = frustumHeight * aspect;

    camera = new THREE.OrthographicCamera(
        frustumWidth / -2, frustumWidth / 2,
        frustumHeight / 2, frustumHeight / -2,
        1, 1000
    );

    // Ajustar posición de la cámara para centrar el tablero
    // El centro del tablero lógico es (COLS/2, ROWS/2)
    // El centro de la vista 3D es (0,0)
    // Queremos mapear (COLS/2, ROWS/2) a (0,0) en la cámara
    // Coordenadas Three.js: X es derecha, Y es arriba
    // Coordenadas Tablero: X es derecha, Y es abajo
    camera.position.set(
        (COLS * BLOCK_SIZE) / 2 - BLOCK_SIZE / 2, // Centrado X
        -(ROWS * BLOCK_SIZE) / 2 + BLOCK_SIZE / 2, // Centrado Y (negativo)
        10 // Distancia Z
    );
    camera.lookAt( // Apuntar al mismo punto central para asegurar la orientación
         (COLS * BLOCK_SIZE) / 2 - BLOCK_SIZE / 2,
        -(ROWS * BLOCK_SIZE) / 2 + BLOCK_SIZE / 2,
         0
    );
    scene.add(camera); // Añadir cámara a la escena


    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Un poco más de luz ambiente
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5); // Posición de la luz
    scene.add(directionalLight);


    // Crear el tablero lógico y visual
    createBoard();
    createVisualBoard(); // Dibuja la cuadrícula/fondo

    // Iniciar el juego
    resetGame(); // Llama a esto para configurar el estado inicial

    // Manejador de eventos de teclado
    document.addEventListener('keydown', handleKeyPress);

    // Ajustar tamaño de ventana
    window.addEventListener('resize', onWindowResize, false);

    // Empezar bucle de renderizado
    animate();
}

// --- Lógica del Tablero ---
function createBoard() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    boardMeshes = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function createVisualBoard() {
    // Opcional: Plano de fondo sutil
    const planeGeo = new THREE.PlaneGeometry(COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE);
    const planeMat = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide, roughness: 0.8 });
    const backgroundPlane = new THREE.Mesh(planeGeo, planeMat);
    // Centrar el plano donde está el tablero
    backgroundPlane.position.set(
         (COLS * BLOCK_SIZE) / 2 - BLOCK_SIZE / 2,
        -(ROWS * BLOCK_SIZE) / 2 + BLOCK_SIZE / 2,
        -BLOCK_SIZE // Ligeramente detrás de los bloques
    );
    scene.add(backgroundPlane);

     // Crear cuadrícula visual
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5 });
    const points = [];
    const startX = 0;
    const endX = COLS * BLOCK_SIZE;
    const startY = 0;
    const endY = -ROWS * BLOCK_SIZE; // Y va hacia abajo

    // Líneas horizontales
    for (let i = 0; i <= ROWS; i++) {
        points.push(new THREE.Vector3(startX, -i * BLOCK_SIZE, 0));
        points.push(new THREE.Vector3(endX, -i * BLOCK_SIZE, 0));
    }
    // Líneas verticales
    for (let j = 0; j <= COLS; j++) {
        points.push(new THREE.Vector3(j * BLOCK_SIZE, startY, 0));
        points.push(new THREE.Vector3(j * BLOCK_SIZE, endY, 0));
    }
    const gridGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const gridLines = new THREE.LineSegments(gridGeometry, gridMaterial);
     // Ajustar posición de la cuadrícula para alinearla con los bloques
     gridLines.position.set( -BLOCK_SIZE / 2, BLOCK_SIZE / 2, -BLOCK_SIZE/2 + 0.01 ); // Ligeramente delante del fondo
    scene.add(gridLines);
}


// --- Lógica de Piezas ---
function getRandomPiece() {
    const index = Math.floor(Math.random() * PIECES.length);
    const pieceData = PIECES[index];
    // Clonar la forma para evitar modificaciones accidentales al original
    const shapeClone = pieceData.shape.map(row => row.slice());
    return {
        x: Math.floor(COLS / 2) - Math.floor(shapeClone[0].length / 2),
        y: 0, // Empezar arriba
        shape: shapeClone,
        color: pieceData.color,
        mesh: null // El mesh 3D se creará al dibujarla
    };
}

function drawPiece() {
    if (currentPiece.mesh) {
        scene.remove(currentPiece.mesh);
        // Limpiar geometría y material del grupo anterior si es necesario para liberar memoria
        currentPiece.mesh.children.forEach(child => {
             if (child.geometry) child.geometry.dispose();
             // Los materiales se pueden reutilizar, pero si creas uno nuevo cada vez, también deberías desecharlos
             // if (child.material) child.material.dispose();
        });
    }

    const pieceGroup = new THREE.Group();
    // Crear una geometría y material reutilizables para los bloques de esta pieza
    const geometry = new THREE.BoxGeometry(BLOCK_SIZE * 0.95, BLOCK_SIZE * 0.95, BLOCK_SIZE * 0.95); // Un poco más pequeño para ver separación
    const material = new THREE.MeshStandardMaterial({
        color: currentPiece.color,
        roughness: 0.4,
        metalness: 0.1
     });
    // Añadir un borde ligero
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });


    currentPiece.shape.forEach((row, dy) => {
        row.forEach((value, dx) => {
            if (value) {
                const blockMesh = new THREE.Mesh(geometry, material);
                blockMesh.position.set(
                    (currentPiece.x + dx) * BLOCK_SIZE,
                    -(currentPiece.y + dy) * BLOCK_SIZE, // Y invertida
                    0 // Posición Z
                );
                // Ajustar origen para que el centro esté en el centro del bloque
                blockMesh.position.x += BLOCK_SIZE / 2;
                blockMesh.position.y -= BLOCK_SIZE / 2; // Y va hacia arriba en Three.js

                pieceGroup.add(blockMesh);

                // Añadir bordes
                const wireframe = new THREE.LineSegments(edgesGeometry, edgeMaterial);
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
                scene.remove(boardMeshes[r][c]);
                 // Limpiar geometría y material
                if (boardMeshes[r][c].geometry) boardMeshes[r][c].geometry.dispose();
                if (boardMeshes[r][c].material) boardMeshes[r][c].material.dispose();
                 // Si tiene hijos (como los bordes), también eliminarlos
                boardMeshes[r][c].children.forEach(child => {
                     if (child.geometry) child.geometry.dispose();
                     if (child.material) child.material.dispose();
                });
                boardMeshes[r][c] = null;
            }
        }
    }

    // Crear nuevos meshes basados en el estado lógico del tablero
    const geometry = new THREE.BoxGeometry(BLOCK_SIZE * 0.95, BLOCK_SIZE * 0.95, BLOCK_SIZE * 0.95);
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });


    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) { // Si la celda no está vacía
                const material = new THREE.MeshStandardMaterial({
                    color: board[r][c], // Usar el color guardado
                    roughness: 0.4,
                    metalness: 0.1
                });
                const blockMesh = new THREE.Mesh(geometry, material);
                blockMesh.position.set(
                    c * BLOCK_SIZE + BLOCK_SIZE / 2,
                    -r * BLOCK_SIZE - BLOCK_SIZE / 2, // Invertir Y y ajustar centro
                    0
                );

                // Crear un grupo para el bloque y su borde
                const blockGroup = new THREE.Group();
                blockGroup.add(blockMesh);

                 // Añadir bordes
                const wireframe = new THREE.LineSegments(edgesGeometry, edgeMaterial);
                wireframe.position.copy(blockMesh.position); // Copiar posición
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
            if (pieceShape[y][x]) { // Si es un bloque de la pieza
                const boardX = newX + x;
                const boardY = newY + y;

                // 1. Comprobar límites laterales e inferior del tablero
                if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
                    return false;
                }
                // 2. Comprobar límite superior (no debería pasar, pero por seguridad)
                if (boardY < 0) {
                   continue; // Permite que partes de la pieza estén por encima al inicio
                }
                // 3. Comprobar colisión con bloques existentes
                if (board[boardY][boardX]) {
                    return false;
                }
            }
        }
    }
    return true; // Movimiento válido
}

function movePiece(dx, dy) {
    if (gameOver) return;
    const newX = currentPiece.x + dx;
    const newY = currentPiece.y + dy;

    if (isValidMove(newX, newY, currentPiece.shape)) {
        currentPiece.x = newX;
        currentPiece.y = newY;
        drawPiece(); // Redibujar la pieza en la nueva posición
        return true; // Movimiento exitoso
    }
    return false; // Colisión
}

function rotatePiece() {
     if (gameOver) return;
    // Clonar la forma actual para no modificarla si la rotación falla
    const originalShape = currentPiece.shape.map(row => row.slice());
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

    // Comprobar si la rotación es válida en la posición actual
    if (isValidMove(currentPiece.x, currentPiece.y, newShape)) {
        currentPiece.shape = newShape;
        drawPiece();
        return; // Rotación exitosa
    }

    // Intentos de "wall kick" simples (mover 1 unidad a izq/der)
    if (isValidMove(currentPiece.x + 1, currentPiece.y, newShape)) {
        currentPiece.x++;
        currentPiece.shape = newShape;
        drawPiece();
        return;
    }
     if (isValidMove(currentPiece.x - 1, currentPiece.y, newShape)) {
         currentPiece.x--;
         currentPiece.shape = newShape;
         drawPiece();
         return;
    }
    // Si llegamos aquí, la rotación (con kicks simples) falló, restaurar forma original
    // (No es estrictamente necesario ya que no modificamos currentPiece.shape si falla,
    // pero es buena práctica si la lógica fuera más compleja)
    currentPiece.shape = originalShape;
}

// --- Lógica del Juego ---
function placePiece() {
    currentPiece.shape.forEach((row, dy) => {
        row.forEach((value, dx) => {
            if (value) {
                const boardX = currentPiece.x + dx;
                const boardY = currentPiece.y + dy;
                if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
                     board[boardY][boardX] = currentPiece.color;
                }
            }
        });
    });

    if (currentPiece.mesh) {
        scene.remove(currentPiece.mesh);
         // Limpiar meshes de la pieza activa
         currentPiece.mesh.children.forEach(child => {
             if (child.geometry) child.geometry.dispose();
             // Materiales podrían reutilizarse si fueran complejos
             // if (child.material) child.material.dispose();
         });
    }
    currentPiece = null; // No hay pieza activa

    drawBoard(); // Redibuja el tablero completo con la pieza ya fijada
}


function clearLines() {
    let linesCleared = 0;
    let rowsToRemove = [];

    // Identificar filas completas
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(cell => cell > 0)) {
            linesCleared++;
            rowsToRemove.push(r);
        }
    }

    if (linesCleared > 0) {
        // Eliminar filas completas del tablero lógico
        // Es más eficiente eliminar de abajo hacia arriba o usar filter
        board = board.filter((row, index) => !rowsToRemove.includes(index));

        // Añadir filas vacías al principio
        for (let i = 0; i < linesCleared; i++) {
            board.unshift(Array(COLS).fill(0));
        }

        // Actualizar puntuación
        score += linesCleared * 100 * linesCleared; // Puntuación exponencial simple
        scoreElement.textContent = `Score: ${score}`;

        // Redibujar el tablero visual
        drawBoard(); // Redibuja todo el tablero lógico actualizado

         // Opcional: Aumentar velocidad
         fallSpeed = Math.max(150, fallSpeed - linesCleared * 15); // Acelera un poco más
    }
}


function checkGameOver() {
    // El game over ocurre si una nueva pieza colisiona inmediatamente
    // Esto se comprueba justo después de crear la nueva pieza
    if (!isValidMove(currentPiece.x, currentPiece.y, currentPiece.shape)) {
        gameOver = true;
        gameOverElement.style.display = 'block';
        if (gameLoopTimeout) clearTimeout(gameLoopTimeout);
        console.log("Game Over! Final Score:", score);
        // Opcional: Podrías poner los bloques de la última pieza en gris o algo
    }
}

function gameLoop() {
    if (gameOver) return;

    // Intenta mover la pieza hacia abajo
    if (!movePiece(0, 1)) {
        // Si no pudo moverse (colisión o llegó al fondo)
        placePiece();        // 1. Fija la pieza en el tablero
        clearLines();        // 2. Revisa y limpia líneas completas
        currentPiece = getRandomPiece(); // 3. Genera la siguiente pieza
        drawPiece();         // 4. Dibuja la nueva pieza
        checkGameOver();     // 5. Comprueba si el juego terminó con la nueva pieza
    }

    // Programa la siguiente caída si el juego no ha terminado
    if (!gameOver) {
        // Limpia el timeout anterior por si acaso (ej. si se aceleró con flecha abajo)
        if (gameLoopTimeout) clearTimeout(gameLoopTimeout);
        gameLoopTimeout = setTimeout(gameLoop, fallSpeed);
    }
}

function resetGame() {
    console.log("Reiniciando juego...");
    // Limpiar timeouts pendientes
    if (gameLoopTimeout) clearTimeout(gameLoopTimeout);

    // Limpiar tablero lógico y visual
    createBoard(); // Reinicia el array lógico
    drawBoard(); // Limpia y redibuja el tablero visual vacío (o con fondo/cuadrícula)

    score = 0;
    scoreElement.textContent = `Score: ${score}`;
    fallSpeed = 1000; // Resetear velocidad
    gameOver = false;
    gameOverElement.style.display = 'none';

    // Eliminar pieza actual si existe de la escena
    if (currentPiece && currentPiece.mesh) {
        scene.remove(currentPiece.mesh);
        // Limpiar recursos de la pieza vieja
         currentPiece.mesh.children.forEach(child => {
             if (child.geometry) child.geometry.dispose();
             // if (child.material) child.material.dispose();
         });
        currentPiece = null;
    }

    // Crear y dibujar la primera pieza del nuevo juego
    currentPiece = getRandomPiece();
    drawPiece(); // Dibuja la pieza inicial

    // Iniciar el bucle del juego
    gameLoop();
}


// --- Manejadores de Eventos ---
function handleKeyPress(event) {
     // Prevenir scroll de página con flechas
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
    }

    if (gameOver) return;

    switch (event.key) {
        case 'ArrowLeft':
            movePiece(-1, 0);
            break;
        case 'ArrowRight':
            movePiece(1, 0);
            break;
        case 'ArrowDown':
             // Mover hacia abajo más rápido
             if (movePiece(0, 1)) {
                 // Si se movió, reseteamos el timer de caída para que la bajada sea más controlada
                 clearTimeout(gameLoopTimeout);
                 gameLoopTimeout = setTimeout(gameLoop, fallSpeed);
                 // Opcional: añadir un pequeño bonus de puntos por bajar rápido
                 // score += 1;
                 // scoreElement.textContent = `Score: ${score}`;
             } else {
                 // Si no se pudo mover (ya tocó fondo), forzar el ciclo de colocar/nueva pieza
                 clearTimeout(gameLoopTimeout);
                 gameLoop();
             }
            break;
        case 'ArrowUp':
            rotatePiece();
            break;
         // Podrías añadir ' ' (espacio) para hard drop
         /*
         case ' ':
             while(movePiece(0, 1)) {
                 // Sigue bajando hasta que no pueda más
             }
             // Forzar ciclo de colocar/nueva pieza inmediatamente
             clearTimeout(gameLoopTimeout);
             gameLoop();
             break;
         */
    }
}

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumHeight = ROWS * BLOCK_SIZE + 2 * BLOCK_SIZE;
    const frustumWidth = frustumHeight * aspect;

    camera.left = frustumWidth / -2;
    camera.right = frustumWidth / 2;
    camera.top = frustumHeight / 2;
    camera.bottom = frustumHeight / -2;
    camera.updateProjectionMatrix(); // Actualizar matriz de proyección

    renderer.setSize(window.innerWidth, window.innerHeight);
}


// --- Bucle de Animación ---
function animate() {
    requestAnimationFrame(animate);
    // Solo renderizar, la lógica del juego va en gameLoop con setTimeout
    renderer.render(scene, camera);
}

// --- Hacer la función de reinicio globalmente accesible ---
window.reiniciarJuego = resetGame;

// --- Iniciar Todo ---
init();
