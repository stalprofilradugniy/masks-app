// Получаем ссылки на HTML элементы
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const loadingMessage = document.getElementById('loading-message');
const ctx = canvas.getContext('2d');

// Пути к изображениям масок (ЗАМЕНИТЕ НА СВОИ ФАЙЛЫ В ПАПКЕ /masks!)
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

// Объединяем все маски в один массив
const allMaskPaths = [...glassesPaths, ...crownPaths];
let currentMaskIndex = -1; // Индекс текущей маски (-1 означает нет маски)
let currentMaskImage = null; // Загруженное изображение текущей маски
let maskLoadPromise = null; // Promise для отслеживания загрузки маски

// Функция для загрузки моделей face-api.js
async function loadModels() {
    // Путь к папке с моделями. Так как мы используем CDN face-api,
    // он сам знает, откуда загружать модели по этому относительному пути.
    // Если бы face-api.min.js лежал локально, нужно было бы рядом создать папку models
    // и положить туда файлы моделей (их можно скачать с репозитория face-api.js).
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model'; // Или локальный путь '/models'

    console.log('Загрузка моделей face-api...');
    // Загружаем необходимые модели:
    // SsdMobilenetv1 - быстрая модель для обнаружения лиц
    // FaceLandmark68Net - модель для нахождения 68 точек (landmarks) на лице
    await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
    ]);
    console.log('Модели загружены.');
}

// Функция для запуска видео с веб-камеры
async function startVideo() {
    console.log('Запрос доступа к камере...');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' } // Запрашиваем фронтальную камеру
        });
        video.srcObject = stream;
        console.log('Камера успешно запущена.');
        // Ждем, пока метаданные видео (включая размеры) будут загружены
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                console.log('Метаданные видео загружены.');
                resolve(true);
            };
        });
    } catch (err) {
        console.error('Ошибка доступа к камере:', err);
        loadingMessage.innerText = `Ошибка доступа к камере: ${err.message}. Убедитесь, что вы разрешили доступ.`;
        return false;
    }
}

// Функция для смены маски на случайную
function switchMask() {
    let newIndex;
    // Выбираем случайный индекс, отличный от текущего (если масок больше 1)
    if (allMaskPaths.length > 1) {
        do {
            newIndex = Math.floor(Math.random() * allMaskPaths.length);
        } while (newIndex === currentMaskIndex);
    } else {
        newIndex = 0; // Если маска одна, всегда выбираем её
    }

    currentMaskIndex = newIndex;
    const maskPath = allMaskPaths[currentMaskIndex];
    console.log(`Загрузка маски: ${maskPath}`);

    // Создаем новый объект Image и начинаем загрузку
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Важно, если маски с другого домена (но у нас локальные)

    // Создаем Promise, который разрешится, когда маска загрузится (или с ошибкой)
    maskLoadPromise = new Promise((resolve, reject) => {
        img.onload = () => {
            console.log(`Маска ${maskPath} загружена.`);
            currentMaskImage = img; // Сохраняем загруженное изображение
            resolve(); // Сигнализируем об успешной загрузке
        };
        img.onerror = (err) => {
            console.error(`Ошибка загрузки маски: ${maskPath}`, err);
            currentMaskImage = null; // Сбрасываем маску в случае ошибки
            reject(err); // Сигнализируем об ошибке
        };
    });

    img.src = maskPath; // Начинаем загрузку изображения
}

// Основная функция для обнаружения лиц и рисования
async function detectFaceAndDrawMask() {
    // Ожидаем завершения загрузки текущей маски, если она еще грузится
    if (maskLoadPromise) {
        try {
            await maskLoadPromise;
        } catch (error) {
            // Ошибка загрузки маски уже обработана в switchMask
        }
        maskLoadPromise = null; // Сбрасываем Promise после завершения
    }

    // Опции для детектора лиц
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

    // Находим одно лицо на видео с его точками (landmarks)
    const detection = await faceapi.detectSingleFace(video, options).withFaceLandmarks();

    // Устанавливаем реальные размеры canvas равными размерам видеоэлемента
    // Это важно делать перед каждым рисованием, если размеры могут меняться
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Очищаем холст перед новым рисованием
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Если лицо найдено и текущая маска загружена
    if (detection && currentMaskImage) {
        const landmarks = detection.landmarks;
        const isCrown = crownPaths.includes(allMaskPaths[currentMaskIndex]);

        // Получаем координаты ключевых точек
        const leftEyeBrow = landmarks.getLeftEyeBrow(); // Точки левой брови
        const rightEyeBrow = landmarks.getRightEyeBrow(); // Точки правой брови
        const nose = landmarks.getNose(); // Точки носа
        const jawOutline = landmarks.getJawOutline(); // Контур челюсти

        // --- Расчет позиции и размера маски ---

        // Ширина лица (примерно по бровям или контуру челюсти)
        const faceWidth = jawOutline[16].x - jawOutline[0].x; // Ширина по контуру челюсти
        // Альтернатива: ширина по бровям
        // const faceWidth = rightEyeBrow[4].x - leftEyeBrow[0].x;

        let maskWidth, maskHeight, centerX, centerY;

        if (isCrown) {
            // --- Расчет для короны ---
            maskWidth = faceWidth * 0.9; // Корона чуть уже лица
            maskHeight = currentMaskImage.height * (maskWidth / currentMaskImage.width); // Сохраняем пропорции

            // Центр по X - середина между бровями
            centerX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;

            // Центр по Y - немного выше самой верхней точки бровей
            const browTopY = Math.min(...leftEyeBrow.map(p => p.y), ...rightEyeBrow.map(p => p.y));
            centerY = browTopY - maskHeight * 0.6; // Поднимаем центр короны над бровями

        } else {
            // --- Расчет для очков ---
            maskWidth = faceWidth * 1.0; // Очки по ширине лица (можно добавить коэфф. * 1.1 и т.п.)
            maskHeight = currentMaskImage.height * (maskWidth / currentMaskImage.width);

            // Центр по X - как у короны
            centerX = (leftEyeBrow[0].x + rightEyeBrow[4].x) / 2;

            // Центр по Y - примерно на уровне переносицы (между глаз)
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();
            centerY = (leftEye[0].y + rightEye[3].y) / 2; // Середина между верхним краем левого и правого глаза
            // Альтернатива: верхняя точка носа
            // centerY = nose[0].y;
        }

        // Координаты верхнего левого угла для рисования
        let drawX = centerX - maskWidth / 2;
        let drawY = centerY - maskHeight / 2;

        // --- Рисуем маску на холсте ---

        // Важно: Видео у нас отражено через CSS (scaleX(-1)).
        // Координаты от face-api соответствуют НЕОТРАЖЕННОМУ видео.
        // Чтобы нарисовать маску на холсте, который лежит поверх ОТРАЖЕННОГО видео,
        // нам нужно отразить координату X для рисования относительно ширины холста.
        const mirroredX = canvas.width - (drawX + maskWidth);

        ctx.drawImage(currentMaskImage, mirroredX, drawY, maskWidth, maskHeight);

    } else {
        // Если лицо не найдено или маска не загружена, ничего не рисуем (холст уже очищен)
        // console.log("Лицо не найдено или маска не загружена");
    }

    // Запускаем эту функцию снова для следующего кадра
    requestAnimationFrame(detectFaceAndDrawMask);
    // Вместо requestAnimationFrame можно использовать setInterval для меньшей частоты:
    // setTimeout(() => detectFaceAndDrawMask(), 100); // Обновление каждые 100 мс
}

// --- Инициализация приложения ---
async function initialize() {
    await loadModels(); // Сначала загружаем модели
    const videoStarted = await startVideo(); // Затем запускаем видео

    if (videoStarted) {
        // Убедимся, что размеры canvas установлены после загрузки метаданных видео
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Добавляем слушатель клика/тапа для смены маски
        // Используем 'click' - он работает и для мыши, и для тапов на сенсорных экранах
        document.body.addEventListener('click', switchMask);

        // Загружаем первую случайную маску
        switchMask();

        // Скрываем сообщение о загрузке
        loadingMessage.classList.add('hidden');

        // Начинаем цикл обнаружения лиц и рисования масок
        // Небольшая задержка перед первым запуском, чтобы видео успело "прогреться"
        setTimeout(detectFaceAndDrawMask, 500);

        console.log('Приложение готово!');
    } else {
        // Если видео не запустилось, оставляем сообщение об ошибке
        console.error('Не удалось запустить видео, приложение не может работать.');
    }
}

// Запускаем инициализацию при загрузке скрипта
initialize();