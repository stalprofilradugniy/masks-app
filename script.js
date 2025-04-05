// Получаем ссылки на HTML элементы
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const loadingMessage = document.getElementById('loading-message');
const ctx = canvas.getContext('2d');

// --- Пути к маскам (проверь их наличие и имена!) ---
const glassesPaths = [
    'masks/glasses1.png', 'masks/glasses2.png', 'masks/glasses3.png', 'masks/glasses4.png', 'masks/glasses5.png',
];
const crownPaths = [
    'masks/crown1.png', 'masks/crown2.png', 'masks/crown3.png', 'masks/crown4.png', 'masks/crown5.png',
];
// -----------------------------------------------------

const allMaskPaths = [...glassesPaths, ...crownPaths];
let currentMaskIndex = -1;
let currentMaskImage = null;
let maskLoadPromise = null;
let isDetecting = false;

// --- ИЗМЕНЕНО: Функция загрузки моделей с локального пути ---
async function loadModels() {
    // Указываем путь к папке 'models' относительно index.html
    const MODEL_URL = 'models';
    console.log(`DEBUG: Загрузка локальных моделей из папки: ${MODEL_URL}`);
    try {
        // ИЗМЕНЕНО: Загружаем модели, файлы которых у тебя есть
        // TinyFaceDetector - быстрый детектор
        // FaceLandmark68Net - стандартная модель для 68 точек лица
        // Если у тебя есть только tiny-версия landmark-модели, используй faceLandmark68TinyNet
        console.log("DEBUG: Загрузка tinyFaceDetector...");
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        console.log("DEBUG: Загрузка faceLandmark68Net...");
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        // Если нужна tiny-версия landmark:
        // await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);

        console.log('DEBUG: Локальные модели успешно загружены.');
        return true;
    } catch (err) {
        console.error('DEBUG: КРИТИЧЕСКАЯ ОШИБКА загрузки локальных моделей:', err);
        loadingMessage.innerText = `Ошибка загрузки локальных моделей: ${err.message}. Проверьте наличие файлов в папке /models и их имена.`;
        return false;
    }
}

// --- Функция запуска видео (без изменений) ---
async function startVideo() {
    console.log('DEBUG: Запрос доступа к камере...');
    try {
        const constraints = {
             video: { width: { ideal: 720 }, height: { ideal: 560 }, facingMode: 'user' }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        console.log('DEBUG: Камера: поток получен.');
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.width = video.videoWidth;
                video.height = video.videoHeight;
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                console.log(`DEBUG: Камера: метаданные загружены. Размеры: ${video.videoWidth}x${video.videoHeight}`);
                resolve(true);
            };
             video.onerror = (err) => {
                console.error('DEBUG: КРИТИЧЕСКАЯ ОШИБКА видео элемента:', err);
                loadingMessage.innerText = `Ошибка видео: ${err}. Попробуйте обновить страницу или проверить камеру.`;
                resolve(false);
            }
        });
    } catch (err) {
        console.error('DEBUG: КРИТИЧЕСКАЯ ОШИБКА доступа к камере:', err);
        loadingMessage.innerText = `Ошибка доступа к камере: ${err.message}. Убедитесь, что вы разрешили доступ и камера не используется другим приложением.`;
        return false;
    }
}

// --- Функция смены маски (с отладочными логами) ---
function switchMask() {
    if (allMaskPaths.length === 0) {
        console.warn("DEBUG: Массив масок пуст.");
        currentMaskImage = null; return;
    }
    let newIndex;
    if (allMaskPaths.length > 1) {
        do { newIndex = Math.floor(Math.random() * allMaskPaths.length); } while (newIndex === currentMaskIndex);
    } else { newIndex = 0; }
    currentMaskIndex = newIndex;
    const maskPath = allMaskPaths[currentMaskIndex];
    console.log(`DEBUG: Попытка загрузки маски: ${maskPath}`);
    currentMaskImage = null;
    const img = new Image();
    maskLoadPromise = new Promise((resolve) => {
        img.onload = () => {
            if (img.naturalWidth === 0 || img.height === 0) {
                 console.error(`DEBUG: ОШИБКА: Маска ${maskPath} загружена, но имеет нулевые размеры!`);
                 currentMaskImage = null;
            } else {
                console.log(`DEBUG: Маска ${maskPath} УСПЕШНО ЗАГРУЖЕНА (размеры ${img.naturalWidth}x${img.height}).`);
                currentMaskImage = img;
            } resolve();
        };
        img.onerror = (err) => {
            console.error(`DEBUG: КРИТИЧЕСКАЯ ОШИБКА загрузки изображения маски: ${maskPath}.`, err);
            currentMaskImage = null; resolve();
        };
    });
    img.src = maskPath;
    console.log(`DEBUG: Установлен src для маски: ${img.src}`);
}

// --- Основная функция детекции и рисования (ИЗМЕНЕНЫ опции детектора) ---
async function detectFaceAndDrawMask() {
    if (isDetecting) {
        requestAnimationFrame(detectFaceAndDrawMask); return;
    }
    isDetecting = true;

    if (video.paused || video.ended || video.readyState < video.HAVE_CURRENT_DATA) {
         isDetecting = false; requestAnimationFrame(detectFaceAndDrawMask); return;
    }

    if (maskLoadPromise) { await maskLoadPromise; maskLoadPromise = null; }

    // --- ИЗМЕНЕНО: Используем опции для TinyFaceDetector ---
    const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 512, // Популярный размер для этой модели, можно пробовать 320, 416, 608
        scoreThreshold: 0.5 // Порог уверенности для обнаружения лица (0.1 - 0.9)
    });
    // -------------------------------------------------------

    try {
        // Используем ту же функцию detectSingleFace, но с новыми опциями
        const detection = await faceapi.detectSingleFace(video, options).withFaceLandmarks(); // Указываем .withFaceLandmarks() чтобы получить точки лица

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
             canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // console.log('DEBUG: Результат детекции:', detection ? 'Лицо найдено' : 'Лицо НЕ найдено'); // Раскомментируй для частой отладки
        // console.log('DEBUG: Текущий объект маски:', currentMaskImage ? `Загружен (${currentMaskImage.src.split('/').pop()})` : 'NULL');

        if (detection && currentMaskImage) {
            const landmarks = detection.landmarks;
            // Если использовали faceLandmark68TinyNet, точки могут быть менее точными
            const isCrown = crownPaths.includes(allMaskPaths[currentMaskIndex]);
            const jawOutline = landmarks.getJawOutline();
            const leftEyeBrow = landmarks.getLeftEyeBrow();
            const rightEyeBrow = landmarks.getRightEyeBrow();
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();

            const faceWidth = rightEyeBrow[4].x - leftEyeBrow[0].x;
            let maskWidth, maskHeight, centerX, centerY;
            const scaleFactor = 1.1;

            if (isCrown) {
                 maskWidth = faceWidth * 0.9 * scaleFactor;
                 maskHeight = currentMaskImage.height * (maskWidth / currentMaskImage.width);
                 centerX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;
                 const browTopY = Math.min(...leftEyeBrow.map(p => p.y), ...rightEyeBrow.map(p => p.y));
                 centerY = browTopY - maskHeight * 0.6;
            } else {
                 maskWidth = faceWidth * 1.0 * scaleFactor;
                 maskHeight = currentMaskImage.height * (maskWidth / currentMaskImage.width);
                 centerX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;
                 const eyeCenterY = (leftEye[1].y + leftEye[2].y + rightEye[1].y + rightEye[2].y) / 4;
                 centerY = eyeCenterY;
            }

            let drawX = centerX - maskWidth / 2;
            let drawY = centerY - maskHeight / 2;
            const mirroredX = canvas.width - (drawX + maskWidth);

            // console.log(`DEBUG: Параметры рисования: img=${currentMaskImage.src.split('/').pop()}, x=${mirroredX.toFixed(1)}, y=${drawY.toFixed(1)}, w=${maskWidth.toFixed(1)}, h=${maskHeight.toFixed(1)}`);

            if (currentMaskImage && !isNaN(mirroredX) && !isNaN(drawY) && !isNaN(maskWidth) && !isNaN(maskHeight) && maskWidth > 0 && maskHeight > 0) {
                 // --- ТЕСТ: Рисуем прямоугольник (если маски все еще не видны) ---
                 // ctx.fillStyle = 'rgba(0, 255, 0, 0.5)'; // Зеленый полупрозрачный
                 // ctx.fillRect(mirroredX, drawY, maskWidth, maskHeight);
                 // console.log("DEBUG: Нарисован тестовый ЗЕЛЕНЫЙ прямоугольник.");
                 // --- Закомментируй строки выше и раскомментируй строку ниже для рисования маски ---
                 ctx.drawImage(currentMaskImage, mirroredX, drawY, maskWidth, maskHeight);

            } else {
                 console.warn("DEBUG: Пропуск ctx.drawImage из-за невалидных параметров.");
            }
        } else {
             // Логирование отсутствия детекции или маски при необходимости
        }

    } catch (error) {
        console.error("DEBUG: ОШИБКА в цикле детекции/рисования:", error);
    } finally {
         isDetecting = false;
    }

    requestAnimationFrame(detectFaceAndDrawMask);
}

// --- Инициализация (без изменений) ---
async function initialize() {
    console.log("DEBUG: Начало инициализации приложения (локальные модели).");
    const modelsLoaded = await loadModels();
    if (!modelsLoaded) { console.error("DEBUG: Инициализация прервана: модели не загружены."); return; }

    const videoStarted = await startVideo();
    if (!videoStarted) { console.error("DEBUG: Инициализация прервана: видео не запущено."); return; }

    video.addEventListener('playing', () => {
         console.log("DEBUG: Видео начало воспроизводиться (событие 'playing').");
         document.body.removeEventListener('click', switchMask);
         document.body.addEventListener('click', switchMask);
         console.log("DEBUG: Обработчик клика для смены маски добавлен.");
         console.log("DEBUG: Загрузка ПЕРВОЙ случайной маски...");
         switchMask();
         loadingMessage.classList.add('hidden');
         console.log("DEBUG: Сообщение о загрузке скрыто.");
         console.log("DEBUG: Запуск ОСНОВНОГО цикла детекции/рисования...");
         requestAnimationFrame(detectFaceAndDrawMask);
         console.log('DEBUG: Инициализация УСПЕШНО завершена!');
    }, { once: true });

    video.play().catch(err => {
         console.error("DEBUG: Ошибка при вызове video.play():", err);
         if (loadingMessage.classList.contains('hidden')) {
             loadingMessage.classList.remove('hidden');
             loadingMessage.innerText = "Не удалось автоматически запустить видео.";
         }
    });
}

// --- Старт ---
initialize();
