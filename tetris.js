import * as THREE from 'three';

// --- Configuración del Juego ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 1; // Tamaño de cada cubo en la escena 3D
const EMPTY_COLOR = 0x444444; // Color para celdas vacías (opcional, para el fondo visual)

// --- Variables Globales ---
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
    {
        shape: [[1, 1, 1, 1]],
        color: 0xFF0000 // Rojo
    },
    // O
    {
        shape: [[1, 1], [1, 1]],
        color: 0xFFFF00 // Amarillo
    },
    // T
    {
        shape: [[0, 1, 0], [1, 1, 1]],
        color: 0x800080 // Púrpura
    },
    // S
    {
        shape: [[0, 1, 1], [1, 1, 0]],
        color: 0x00FF00 // Verde
    },
    // Z
    {
        shape: [[1, 1, 0], [0, 1, 1]],
        color: 0x0000FF // Azul
    },
    // J
    {
        shape: [[1, 0, 0], [1, 1, 1]],
        color: 0xFF7F00 // Naranja
    },
    // L
    {
        shape: [[0, 0, 1], [1, 1, 1]],
        color: 0x00FFFF // Cian
    }
];

// --- Inicialización ---
function init() {
    // Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // Cámara (Ortográfica es buena para este tipo de vista)
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = ROWS + 2; // Ajusta el tamaño de la vista
    const camHeight = frustumSize / 2;
    const camWidth = camHeight * aspect;

    camera = new THREE.OrthographicCamera(
        -camWidth, camWidth, camHeight, -camHeight, 1, 1000
    );

    // Ajustar posición de la cámara para ver el tablero
    camera.position.set(
        (COLS * BLOCK_SIZE) / 2 - BLOCK_SIZE / 2, // Centrado X
        -(ROWS * BLOCK_SIZE) / 2 + BLOCK_SIZE / 2, // Centrado Y (negativo porque Y es hacia arriba en Three.js)
        10 // Distancia Z
    );
    camera.lookAt(scene.position); // Mirar al centro de la escena (donde estará el tablero)


    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);


    // Crear el tablero lógico y visual
    createBoard();
    createVisualBoard();

    // Iniciar el juego
    resetGame();

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
    // Opcional: Añadir un plano de fondo o bordes
    const planeGeo = new THREE.PlaneGeometry(COLS * BLOCK_SIZE, ROWS * BLOCK_SIZE);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
    const backgroundPlane = new THREE.Mesh(planeGeo, planeMat);
    backgroundPlane.position.set(
         (COLS * BLOCK_SIZE) / 2 - BLOCK_SIZE / 2,
        -(ROWS * BLOCK_SIZE) / 2 + BLOCK_SIZE / 2,
        -1 // Detrás de los bloques
    );
    //scene.add(backgroundPlane); // Descomenta si quieres un fondo sólido

     // Crear marcadores de posición visuales (opcional, para ver la cuadrícula)
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x555555 });
    const points = [];
    // Líneas horizontales
    for (let i = 0; i <= ROWS; i++) {
        points.push(new THREE.Vector3(0, -i * BLOCK_SIZE, 0));
        points.push(new THREE.Vector3(COLS * BLOCK_SIZE, -i * BLOCK_SIZE, 0));
    }
    // Líneas verticales
    for (let j = 0; j <= COLS; j++) {
        points.push(new THREE.Vector3(j * BLOCK_SIZE, 0, 0));
        points.push(new THREE.Vector3(j * BLOCK_SIZE, -ROWS * BLOCK_SIZE, 0));
    }
    const gridGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const gridLines = new THREE.LineSegments(gridGeometry, gridMaterial);
     gridLines.position.set( -BLOCK_SIZE / 2, BLOCK_SIZE / 2, -0.5); // Ajustar posición
    scene.add(gridLines);
}


// --- Lógica de Piezas ---
function getRandomPiece() {
    const index = Math.floor(Math.random() * PIECES.length);
    const pieceData = PIECES[index];
    return {
        x: Math.floor(COLS / 2) - Math.floor(pieceData.shape[0].length / 2),
        y: 0, // Empezar arriba
        shape: pieceData.shape,
        color: pieceData.color,
        mesh: null // El mesh 3D se creará al dibujarla
    };
}

function drawPiece() {
    // Limpiar mesh anterior si existe
    if (currentPiece.mesh) {
        scene.remove(currentPiece.mesh);
        currentPiece.mesh.geometry.dispose();
        // Nota: Los materiales se pueden reutilizar o desechar si es necesario
    }

    const pieceGroup = new THREE.Group(); // Usar un grupo para mover/rotar fácilmente
    const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    const material = new THREE.MeshStandardMaterial({
        color: currentPiece.color,
        roughness: 0.5,
        metalness: 0.2
     });

    currentPiece.shape.forEach((row, dy) => {
        row.forEach((value, dx) => {
            if (value) {
                const blockMesh = new THREE.Mesh(geometry, material);
                // Calcular posición en el mundo 3D
                // X: Origen + desplazamiento de la pieza + desplazamiento dentro de la pieza
                // Y: Origen (negativo) + desplazamiento de la pieza + desplazamiento dentro de la pieza
                blockMesh.position.set(
                    (currentPiece.x + dx) * BLOCK_SIZE,
                    -(currentPiece.y + dy) * BLOCK_SIZE,
                    0 // Posición Z
                );
                 // Ajustar origen para que el centro esté en la esquina inferior izquierda
                 blockMesh.position.x += BLOCK_SIZE / 2;
                 blockMesh.position.y += BLOCK_SIZE / 2;

                pieceGroup.add(blockMesh);
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
                boardMeshes[r][c].geometry.dispose(); // Liberar geometría
                // Podríamos reutilizar materiales
                boardMeshes[r][c] = null;
            }
        }
    }

    // Crear nuevos meshes basados en el estado lógico del tablero
    const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) { // Si la celda no está vacía
                const material = new THREE.MeshStandardMaterial({
                    color: board[r][c], // Usar el color guardado
                    roughness: 0.5,
                    metalness: 0.2
                });
                const blockMesh = new THREE.Mesh(geometry, material);
                blockMesh.position.set(
                    c * BLOCK_SIZE + BLOCK_SIZE / 2,
                    -r * BLOCK_SIZE - BLOCK_SIZE / 2, // Invertir Y
                    0
                );
                scene.add(blockMesh);
                boardMeshes[r][c] = blockMesh; // Guardar referencia al mesh
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

                // 1. Comprobar límites del tablero
                if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
                    return false;
                }
                // 2. Comprobar colisión con bloques existentes (solo si está dentro del tablero verticalmente)
                if (boardY >= 0 && board[boardY][boardX]) {
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
    // Rotación simple (transponer y revertir filas)
    const shape = currentPiece.shape;
    const N = shape.length; // Asume que es más o menos cuadrada para simplificar
    const M = shape[0].length;
    const newShape = Array.from({ length: M }, () => Array(N).fill(0));

    for (let y = 0; y < N; y++) {
        for (let x = 0; x < M; x++) {
            newShape[x][N - 1 - y] = shape[y][x];
        }
    }

    // Comprobar si la rotación es válida
    if (isValidMove(currentPiece.x, currentPiece.y, newShape)) {
        currentPiece.shape = newShape;
        drawPiece();
    } else {
        // Intento simple de "wall kick" - mover un poco a la derecha o izquierda
        if (isValidMove(currentPiece.x + 1, currentPiece.y, newShape)) {
            currentPiece.x++;
            currentPiece.shape = newShape;
            drawPiece();
        } else if (isValidMove(currentPiece.x - 1, currentPiece.y, newShape)) {
             currentPiece.x--;
             currentPiece.shape = newShape;
             drawPiece();
        }
         // Si aún no es válido, no rotar
    }
}

// --- Lógica del Juego ---
function placePiece() {
    // Añadir los bloques de la pieza al tablero lógico
    currentPiece.shape.forEach((row, dy) => {
        row.forEach((value, dx) => {
            if (value) {
                const boardX = currentPiece.x + dx;
                const boardY = currentPiece.y + dy;
                // Asegurarse de no escribir fuera de los límites (aunque isValidMove debería prevenirlo)
                if (boardY >= 0 && boardY < ROWS && boardX >= 0 && boardX < COLS) {
                     board[boardY][boardX] = currentPiece.color; // Guardar el color
                }
            }
        });
    });

    // Eliminar la pieza móvil de la escena
    if (currentPiece.mesh) {
        scene.remove(currentPiece.mesh);
        // No es necesario dispose aquí porque drawBoard() recreará todo
    }
    currentPiece = null; // Ya no hay pieza activa

    // Redibujar todo el tablero con la nueva pieza fija
    drawBoard();
}


function clearLines() {
    let linesCleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(cell => cell > 0)) { // Si la fila está llena
            linesCleared++;
            // Eliminar fila del tablero lógico
            board.splice(r, 1);
            // Añadir una fila vacía al principio
            board.unshift(Array(COLS).fill(0));
            // Como eliminamos una fila, necesitamos revisar la misma fila 'r' de nuevo
            r++;
        }
    }

    if (linesCleared > 0) {
        score += linesCleared * 100 * linesCleared; // Puntuación simple (más puntos por más líneas)
        scoreElement.textContent = `Score: ${score}`;
        // Redibujar el tablero después de limpiar líneas
        drawBoard();
         // Opcional: Aumentar velocidad
        // fallSpeed = Math.max(200, fallSpeed - linesCleared * 10);
    }
}


function checkGameOver() {
    // Si la nueva pieza colisiona inmediatamente al aparecer
    if (!isValidMove(currentPiece.x, currentPiece.y, currentPiece.shape)) {
        gameOver = true;
        gameOverElement.style.display = 'block';
        if (gameLoopTimeout) clearTimeout(gameLoopTimeout); // Detener el bucle
        console.log("Game Over!");
    }
}

function gameLoop() {
    if (gameOver) return;

    // 1. Mover la pieza hacia abajo
    const moved = movePiece(0, 1); // Intenta mover hacia abajo

    // 2. Si no pudo moverse hacia abajo (colisión)
    if (!moved) {
        placePiece(); // Colocar la pieza en el tablero
        clearLines(); // Comprobar y limpiar líneas completas
        currentPiece = getRandomPiece(); // Generar nueva pieza
        drawPiece(); // Dibujar la nueva pieza
        checkGameOver(); // Comprobar si el juego ha terminado
    }

    // 3. Programar la siguiente caída
    if (!gameOver) {
        gameLoopTimeout = setTimeout(gameLoop, fallSpeed);
    }
}

function resetGame() {
    // Limpiar tablero lógico
    createBoard();
    // Limpiar meshes del tablero visual (drawBoard lo hará)
    score = 0;
    scoreElement.textContent = `Score: ${score}`;
    gameOver = false;
    gameOverElement.style.display = 'none';

    // Eliminar pieza actual si existe
    if (currentPiece && currentPiece.mesh) {
        scene.remove(currentPiece.mesh);
    }

    // Obtener y dibujar la primera pieza
    currentPiece = getRandomPiece();
    drawPiece();
    drawBoard(); // Asegura que el tablero visual esté limpio al inicio


    // Reiniciar y empezar el bucle
    if (gameLoopTimeout) clearTimeout(gameLoopTimeout);
    gameLoopTimeout = setTimeout(gameLoop, fallSpeed);
}


// --- Manejadores de Eventos ---
function handleKeyPress(event) {
    if (gameOver) return;

    switch (event.key) {
        case 'ArrowLeft':
        case 'a': // Añadir teclas alternativas si quieres
            movePiece(-1, 0);
            break;
        case 'ArrowRight':
        case 'd':
            movePiece(1, 0);
            break;
        case 'ArrowDown':
        case 's':
            // Mover hacia abajo y reiniciar el temporizador de caída si tiene éxito
             if (movePiece(0, 1)) {
                 // Reiniciar el timer para que no haya doble caída inmediata
                 clearTimeout(gameLoopTimeout);
                 gameLoopTimeout = setTimeout(gameLoop, fallSpeed);
             } else {
                 // Si no se pudo mover más hacia abajo, forzar el ciclo para colocarla
                 clearTimeout(gameLoopTimeout);
                 gameLoop();
             }
            break;
        case 'ArrowUp':
        case 'w':
            rotatePiece();
            break;
    }
}

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = ROWS + 2;
    const camHeight = frustumSize / 2;
    const camWidth = camHeight * aspect;

    camera.left = -camWidth;
    camera.right = camWidth;
    camera.top = camHeight;
    camera.bottom = -camHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}


// --- Bucle de Animación ---
function animate() {
    requestAnimationFrame(animate);
    // Aquí podrías añadir animaciones extra si quisieras (rotación de cámara, etc.)
    renderer.render(scene, camera);
}

// --- Hacer la función de reinicio global ---
window.reiniciarJuego = resetGame;

// --- Iniciar Todo ---
init();