// Получаем ссылки на HTML элементы
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const loadingMessage = document.getElementById('loading-message');
const ctx = canvas.getContext('2d');

// --- Убедись, что эти пути ТОЧНО совпадают с файлами в папке /masks ---
const glassesPaths = [
    'masks/glasses1.png',
    'masks/glasses2.png',
    'masks/glasses3.png',
    'masks/glasses4.png',
    'masks/glasses5.png',
];
const crownPaths = [
    'masks/crown1.png',
    'masks/crown2.png',
    'masks/crown3.png',
    'masks/crown4.png',
    'masks/crown5.png',
];
// ---------------------------------------------------------------------

const allMaskPaths = [...glassesPaths, ...crownPaths];
let currentMaskIndex = -1;
let currentMaskImage = null;
let maskLoadPromise = null;
let isDetecting = false;

// --- Функция загрузки моделей ---
async function loadModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model';
    console.log('DEBUG: Загрузка моделей face-api...');
    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        ]);
        console.log('DEBUG: Модели face-api успешно загружены.');
        return true;
    } catch (err) {
        console.error('DEBUG: КРИТИЧЕСКАЯ ОШИБКА загрузки моделей:', err);
        loadingMessage.innerText = `Ошибка загрузки моделей: ${err.message}. Попробуйте обновить страницу.`;
        return false;
    }
}

// --- Функция запуска видео ---
async function startVideo() {
    console.log('DEBUG: Запрос доступа к камере...');
    try {
        const constraints = {
             video: {
                width: { ideal: 720 },
                height: { ideal: 560 },
                facingMode: 'user'
             }
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

// --- Функция смены маски ---
function switchMask() {
    if (allMaskPaths.length === 0) {
        console.warn("DEBUG: Массив масок пуст, переключение невозможно.");
        currentMaskImage = null;
        return;
    }

    let newIndex;
    if (allMaskPaths.length > 1) {
        do {
            newIndex = Math.floor(Math.random() * allMaskPaths.length);
        } while (newIndex === currentMaskIndex);
    } else {
        newIndex = 0;
    }

    currentMaskIndex = newIndex;
    const maskPath = allMaskPaths[currentMaskIndex];
    console.log(`DEBUG: Попытка загрузки маски: ${maskPath}`);
    currentMaskImage = null; // Сбрасываем перед загрузкой

    const img = new Image();
    // img.crossOrigin = 'anonymous'; // Для GitHub Pages (тот же домен) не обязательно, но пусть будет

    maskLoadPromise = new Promise((resolve) => { // Убрал reject, чтобы не ломать цепочку
        img.onload = () => {
            // === ВАЖНАЯ ПРОВЕРКА ===
            if (img.naturalWidth === 0 || img.height === 0) {
                 console.error(`DEBUG: ОШИБКА: Маска ${maskPath} загружена, но имеет нулевые размеры! Файл поврежден или не является изображением?`);
                 currentMaskImage = null;
            } else {
                console.log(`DEBUG: Маска ${maskPath} УСПЕШНО ЗАГРУЖЕНА (размеры ${img.naturalWidth}x${img.height}).`);
                currentMaskImage = img; // Сохраняем ТОЛЬКО если загрузка успешна и размеры корректны
            }
            resolve(); // Всегда резолвим, чтобы цикл детекции продолжился
        };
        img.onerror = (err) => {
            // === ВАЖНАЯ ПРОВЕРКА ===
            console.error(`DEBUG: КРИТИЧЕСКАЯ ОШИБКА загрузки изображения маски: ${maskPath}. Проверьте путь и файл в репозитории!`, err);
            currentMaskImage = null; // Убедимся, что маска null
            resolve(); // Всегда резолвим
        };
    });

    img.src = maskPath;
    console.log(`DEBUG: Установлен src для маски: ${img.src}`); // Проверим, какой URL реально используется
}

// --- Основная функция детекции и рисования ---
async function detectFaceAndDrawMask() {
    if (isDetecting) {
        // console.log("DEBUG: Предыдущий цикл детекции еще не завершен, пропуск кадра.");
        requestAnimationFrame(detectFaceAndDrawMask); // Запросим следующий кадр
        return;
    }
    isDetecting = true;

    if (video.paused || video.ended || video.readyState < video.HAVE_CURRENT_DATA) {
         // console.log("DEBUG: Видео не готово или остановлено, ожидание...");
         isDetecting = false;
         requestAnimationFrame(detectFaceAndDrawMask);
         return;
    }

    // Ждем загрузки маски, если она идет
    if (maskLoadPromise) {
        // console.log("DEBUG: Ожидание загрузки маски...");
        await maskLoadPromise;
        // console.log("DEBUG: Ожидание загрузки маски завершено.");
        maskLoadPromise = null;
    }

    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

    try {
        // === ВАЖНАЯ ПРОВЕРКА ===
        // console.time("DEBUG: Время детекции лица"); // Замеряем время
        const detection = await faceapi.detectSingleFace(video, options).withFaceLandmarks();
        // console.timeEnd("DEBUG: Время детекции лица");

        // Убедимся, что размеры canvas соответствуют видео
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
             console.log("DEBUG: Обновление размеров canvas до", video.videoWidth, video.videoHeight);
             canvas.width = video.videoWidth;
             canvas.height = video.videoHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // === ВАЖНЫЕ ПРОВЕРКИ перед рисованием ===
        // console.log('DEBUG: Результат детекции (detection):', detection ? 'Лицо найдено' : 'Лицо НЕ найдено');
        // console.log('DEBUG: Текущий объект маски (currentMaskImage):', currentMaskImage ? `Загружен (${currentMaskImage.src.split('/').pop()})` : 'NULL');

        if (detection && currentMaskImage) {
            // console.log("DEBUG: Условие для рисования выполнено (detection && currentMaskImage).");
            const landmarks = detection.landmarks;
            const isCrown = crownPaths.includes(allMaskPaths[currentMaskIndex]);

            const jawOutline = landmarks.getJawOutline();
            const leftEyeBrow = landmarks.getLeftEyeBrow();
            const rightEyeBrow = landmarks.getRightEyeBrow();
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();

            // Ширина лица (по внешним точкам бровей)
             const faceWidth = rightEyeBrow[4].x - leftEyeBrow[0].x;

             let maskWidth, maskHeight, centerX, centerY;
             const scaleFactor = 1.1; // Коэффициент масштаба

            if (isCrown) {
                 maskWidth = faceWidth * 0.9 * scaleFactor;
                 maskHeight = currentMaskImage.height * (maskWidth / currentMaskImage.width);
                 centerX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;
                 const browTopY = Math.min(...leftEyeBrow.map(p => p.y), ...rightEyeBrow.map(p => p.y));
                 centerY = browTopY - maskHeight * 0.6;
            } else { // Очки
                 maskWidth = faceWidth * 1.0 * scaleFactor;
                 maskHeight = currentMaskImage.height * (maskWidth / currentMaskImage.width);
                 centerX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;
                 const eyeCenterY = (leftEye[1].y + leftEye[2].y + rightEye[1].y + rightEye[2].y) / 4;
                 centerY = eyeCenterY;
            }

            let drawX = centerX - maskWidth / 2;
            let drawY = centerY - maskHeight / 2;

            // Отражаем X для рисования на зеркальном видео
            const mirroredX = canvas.width - (drawX + maskWidth);

             // === ВАЖНАЯ ПРОВЕРКА перед вызовом drawImage ===
             console.log(`DEBUG: Параметры рисования: img=${currentMaskImage.src.split('/').pop()}, x=${mirroredX.toFixed(1)}, y=${drawY.toFixed(1)}, w=${maskWidth.toFixed(1)}, h=${maskHeight.toFixed(1)}`);

             if (currentMaskImage && !isNaN(mirroredX) && !isNaN(drawY) && !isNaN(maskWidth) && !isNaN(maskHeight) && maskWidth > 0 && maskHeight > 0) {
                 ctx.drawImage(currentMaskImage, mirroredX, drawY, maskWidth, maskHeight);
                 // console.log("DEBUG: Вызов ctx.drawImage выполнен.");
             } else {
                 console.warn("DEBUG: Пропуск ctx.drawImage из-за невалидных параметров или отсутствия изображения.");
             }

        } else {
             if (!detection) { /* console.log("DEBUG: Лицо не обнаружено в этом кадре."); */ } // Раскомментируй, если нужно видеть это постоянно
             if (!currentMaskImage && currentMaskIndex !== -1) { console.warn("DEBUG: Попытка рисования, но currentMaskImage is NULL (ошибка загрузки маски?)."); }
        }

    } catch (error) {
        console.error("DEBUG: ОШИБКА в цикле детекции/рисования:", error);
    } finally {
         isDetecting = false; // Разрешаем следующий запуск
    }

    requestAnimationFrame(detectFaceAndDrawMask);
}

// --- Инициализация ---
async function initialize() {
    console.log("DEBUG: Начало инициализации приложения.");
    const modelsLoaded = await loadModels();
    if (!modelsLoaded) {
        console.error("DEBUG: Инициализация прервана: модели не загружены.");
        return;
    }

    const videoStarted = await startVideo();
    if (!videoStarted) {
        console.error("DEBUG: Инициализация прервана: видео не запущено.");
        // Сообщение об ошибке уже должно быть видно
        return;
    }

    video.addEventListener('playing', () => {
         console.log("DEBUG: Видео начало воспроизводиться (событие 'playing').");

         // Убираем старый листенер, если он был, и добавляем новый
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
    }, { once: true }); // Сработает только один раз

    // Попытка запустить воспроизведение (важно для некоторых браузеров/автоплея)
    video.play().catch(err => {
         console.error("DEBUG: Ошибка при вызове video.play():", err);
         // Показать сообщение, если оно еще не показано и скрыто
         if (loadingMessage.classList.contains('hidden')) {
             loadingMessage.classList.remove('hidden');
             loadingMessage.innerText = "Не удалось автоматически запустить видео. Возможно, нужно взаимодействие с пользователем (клик) или проблема с разрешениями.";
         }
    });
}

// --- Старт ---
initialize();
