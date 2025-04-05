// Получаем ссылки на HTML элементы
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const loadingMessage = document.getElementById('loading-message');
const ctx = canvas.getContext('2d');

// --- ВАЖНО: УБЕДИСЬ, ЧТО ЭТИ ПУТИ ТОЧНО СОВПАДАЮТ С ФАЙЛАМИ В ПАПКЕ /masks В РЕПОЗИТОРИИ ---
// --- ПРОВЕРЬ РЕГИСТР БУКВ И РАСШИРЕНИЕ .png ---
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
// -----------------------------------------------------------------------------------------

// Объединяем все маски в один массив
const allMaskPaths = [...glassesPaths, ...crownPaths];
let currentMaskIndex = -1; // Индекс текущей маски (-1 означает нет маски)
let currentMaskImage = null; // Загруженное изображение текущей маски
let maskLoadPromise = null; // Promise для отслеживания загрузки маски
let faceDetectionIntervalId = null; // ID для интервала детекции
let isDetecting = false; // Флаг, чтобы избежать параллельного запуска детекции

// Функция для загрузки моделей face-api.js
async function loadModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model';
    console.log('Загрузка моделей face-api...');
    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
        ]);
        console.log('Модели загружены.');
        return true;
    } catch (err) {
        console.error('Ошибка загрузки моделей:', err);
        loadingMessage.innerText = `Ошибка загрузки моделей: ${err.message}. Попробуйте обновить страницу.`;
        return false;
    }
}

// Функция для запуска видео с веб-камеры
async function startVideo() {
    console.log('Запрос доступа к камере...');
    try {
        // Запрашиваем стандартные размеры, если возможно
        const constraints = {
             video: {
                width: { ideal: 720 },
                height: { ideal: 560 },
                facingMode: 'user'
             }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        console.log('Камера успешно запущена.');
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                // Устанавливаем реальные размеры видео как размеры элемента video и canvas
                // чтобы избежать искажений aspect ratio
                video.width = video.videoWidth;
                video.height = video.videoHeight;
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                console.log(`Метаданные видео загружены. Размеры: ${video.videoWidth}x${video.videoHeight}`);
                resolve(true);
            };
             video.onerror = (err) => {
                console.error('Ошибка видео элемента:', err);
                loadingMessage.innerText = `Ошибка видео: ${err}. Попробуйте обновить страницу или проверить камеру.`;
                resolve(false); // Резолвим как false при ошибке видео
            }
        });
    } catch (err) {
        console.error('Ошибка доступа к камере:', err);
        loadingMessage.innerText = `Ошибка доступа к камере: ${err.message}. Убедитесь, что вы разрешили доступ и камера не используется другим приложением.`;
        return false;
    }
}

// Функция для смены маски на случайную
function switchMask() {
    if (allMaskPaths.length === 0) {
        console.warn("Нет доступных масок для переключения.");
        currentMaskImage = null; // Убедимся, что маска сброшена
        return; // Выходим, если массив пуст
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
    console.log(`Загрузка маски: ${maskPath}`);
    currentMaskImage = null; // Сбрасываем текущую маску перед загрузкой новой

    const img = new Image();
    img.crossOrigin = 'anonymous'; // На всякий случай, хотя для локальных путей не строго нужно

    maskLoadPromise = new Promise((resolve, reject) => {
        img.onload = () => {
            console.log(`Маска ${maskPath} загружена.`);
            currentMaskImage = img;
            resolve();
        };
        img.onerror = (err) => {
            console.error(`Ошибка загрузки маски: ${maskPath}. Проверьте путь и наличие файла!`, err);
            // Не реджектим промис, чтобы приложение не падало,
            // просто currentMaskImage останется null.
            // В detectFaceAndDrawMask будет проверка на null.
             currentMaskImage = null; // Убедимся что маска null
             resolve(); // Все равно резолвим, чтобы цикл детекции продолжился
        };
    });

    img.src = maskPath; // Начинаем загрузку
}

// Основная функция для обнаружения лиц и рисования
async function detectFaceAndDrawMask() {
    // Предотвращаем повторный запуск, если предыдущий еще не завершился
    if (isDetecting) {
        return;
    }
    isDetecting = true;

    // Проверяем, готово ли видео
    if (video.readyState < video.HAVE_CURRENT_DATA) {
         console.log("Видео еще не готово для детекции.");
         isDetecting = false;
         requestAnimationFrame(detectFaceAndDrawMask); // Попробовать снова в следующем кадре
         return;
    }


    // Ожидаем завершения загрузки текущей маски, если она еще грузится
    if (maskLoadPromise) {
        try {
            await maskLoadPromise;
        } catch (error) {
           // Ошибки загрузки уже логируются в switchMask
        }
        maskLoadPromise = null; // Сбрасываем Promise после завершения
    }

    // Опции для детектора лиц (можно поиграть с minConfidence)
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

    try {
        // Находим одно лицо на видео с его точками (landmarks)
        const detection = await faceapi.detectSingleFace(video, options).withFaceLandmarks();

        // Убедимся, что размеры canvas соответствуют видео (на случай изменения)
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
             console.log("Обновление размеров canvas");
             canvas.width = video.videoWidth;
             canvas.height = video.videoHeight;
        }


        // Очищаем холст перед новым рисованием
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Если лицо найдено и текущая маска УСПЕШНО загружена (не null)
        if (detection && currentMaskImage) {
            // console.log("Лицо найдено, маска загружена. Рисуем..."); // Раскомментируй для отладки
            const landmarks = detection.landmarks;
            const isCrown = crownPaths.includes(allMaskPaths[currentMaskIndex]);

            // Получаем координаты ключевых точек
            const jawOutline = landmarks.getJawOutline(); // Контур челюсти
            const leftEyeBrow = landmarks.getLeftEyeBrow();
            const rightEyeBrow = landmarks.getRightEyeBrow();
            const nose = landmarks.getNose();
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();


             // --- Расчет позиции и размера маски ---
             // Ширина лица (по внешним точкам бровей)
             const faceWidth = rightEyeBrow[4].x - leftEyeBrow[0].x;

             let maskWidth, maskHeight, centerX, centerY;
             const scaleFactor = 1.1; // Небольшое увеличение маски для лучшего покрытия

            if (isCrown) {
                 // --- Расчет для короны ---
                 maskWidth = faceWidth * 0.9 * scaleFactor; // Корона чуть уже лица, но увеличенная
                 maskHeight = currentMaskImage.height * (maskWidth / currentMaskImage.width); // Сохраняем пропорции

                 // Центр по X - середина между бровями
                 centerX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;

                 // Центр по Y - немного выше самой верхней точки бровей
                 const browTopY = Math.min(...leftEyeBrow.map(p => p.y), ...rightEyeBrow.map(p => p.y));
                 centerY = browTopY - maskHeight * 0.6; // Поднимаем центр короны над бровями

            } else {
                 // --- Расчет для очков ---
                 maskWidth = faceWidth * 1.0 * scaleFactor; // Очки по ширине лица, увеличенные
                 maskHeight = currentMaskImage.height * (maskWidth / currentMaskImage.width);

                 // Центр по X - как у короны
                 centerX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;

                 // Центр по Y - примерно на уровне переносицы (между верхними точками глаз)
                 // Используем среднее Y верхних точек глаз
                 const eyeCenterY = (leftEye[1].y + leftEye[2].y + rightEye[1].y + rightEye[2].y) / 4;
                 // Или немного ниже, ближе к центру глаз:
                 // const eyeCenterY = (landmarks.getLeftEyeCenter().y + landmarks.getRightEyeCenter().y) / 2;

                 centerY = eyeCenterY; // Помещаем центр очков на этот уровень
            }

            // Координаты верхнего левого угла для рисования
            let drawX = centerX - maskWidth / 2;
            let drawY = centerY - maskHeight / 2;

             // --- Рисуем маску на холсте ---
             // Важно: Видео отражено через CSS (scaleX(-1)).
             // Координаты от face-api соответствуют НЕОТРАЖЕННОМУ видео.
             // Отражаем координату X для рисования относительно ширины холста.
            const mirroredX = canvas.width - (drawX + maskWidth);

            // console.log(`Drawing at ${mirroredX.toFixed(1)}, ${drawY.toFixed(1)} size ${maskWidth.toFixed(1)}x${maskHeight.toFixed(1)}`); // Отладка координат
            ctx.drawImage(currentMaskImage, mirroredX, drawY, maskWidth, maskHeight);

        } else {
            // Закомментировал, чтобы не спамить в консоль, если лицо не найдено
            // if (!detection) console.log("Лицо не обнаружено.");
            // if (!currentMaskImage && currentMaskIndex !== -1) console.log("Маска не загружена или ошибка загрузки.");
        }

    } catch (error) {
        console.error("Ошибка в цикле детекции/рисования:", error);
        // Можно добавить логику остановки или перезапуска при серьезной ошибке
    } finally {
         isDetecting = false; // Разрешаем следующий запуск
    }


    // Запускаем эту функцию снова для следующего кадра
    requestAnimationFrame(detectFaceAndDrawMask);
    // ИЛИ использовать setInterval для меньшей частоты и нагрузки:
    // Замени requestAnimationFrame(detectFaceAndDrawMask) ниже на setTimeout,
    // и убери вызов requestAnimationFrame(detectFaceAndDrawMask) из initialize()
    // setTimeout(detectFaceAndDrawMask, 100); // например, 10 раз в секунду
}

// --- Инициализация приложения ---
async function initialize() {
    const modelsLoaded = await loadModels();
    if (!modelsLoaded) return; // Прерываем инициализацию, если модели не загружены

    const videoStarted = await startVideo();

    if (videoStarted) {
        // Убедимся, что video готово к воспроизведению перед добавлением обработчика
        video.addEventListener('playing', () => {
             console.log("Видео начало воспроизводиться.");

             // Добавляем слушатель клика/тапа для смены маски ТОЛЬКО после начала воспроизведения
             document.body.addEventListener('click', switchMask);

             // Загружаем первую случайную маску
             switchMask();

             // Скрываем сообщение о загрузке
             loadingMessage.classList.add('hidden');

             // Начинаем цикл обнаружения лиц и рисования масок
             console.log("Запуск цикла детекции...");
             // Убираем setTimeout, полагаемся на requestAnimationFrame
              requestAnimationFrame(detectFaceAndDrawMask);

             console.log('Приложение готово!');
        }, { once: true }); // Выполнить только один раз

         // На случай если 'playing' не сработает (маловероятно, но все же)
         video.play().catch(err => {
             console.error("Ошибка при вызове video.play():", err);
             if (!loadingMessage.classList.contains('hidden')) {
                  loadingMessage.innerText = "Не удалось запустить видео. Проверьте разрешения браузера.";
             }
         });

    } else {
        // Если видео не запустилось, сообщение об ошибке уже показано в startVideo
        console.error('Не удалось запустить видео, приложение не может работать.');
        if (!loadingMessage.classList.contains('hidden')) { // Убедимся, что сообщение видно
             loadingMessage.innerText = "Не удалось запустить видео. Проверьте камеру и разрешения.";
        }
    }
}

// Запускаем инициализацию при загрузке скрипта
initialize();
