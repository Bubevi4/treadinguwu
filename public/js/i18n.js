// Frontend localization (Russian for RU region + English toggle).
// Detects RU locale or Russian timezones automatically when set to "auto".

const RU_LANGS = /^(ru|be|uk|kk)(-|$)/i;
const RU_TZ = new Set([
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Europe/Samara",
  "Europe/Volgograd",
  "Europe/Saratov",
  "Europe/Kirov",
  "Europe/Astrakhan",
  "Europe/Ulyanovsk",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Novosibirsk",
  "Asia/Barnaul",
  "Asia/Tomsk",
  "Asia/Novokuznetsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Chita",
  "Asia/Yakutsk",
  "Asia/Khandyga",
  "Asia/Vladivostok",
  "Asia/Ust-Nera",
  "Asia/Magadan",
  "Asia/Sakhalin",
  "Asia/Srednekolymsk",
  "Asia/Kamchatka",
  "Asia/Anadyr",
]);

export function isRuRegion() {
  try {
    const langs = navigator.languages?.length
      ? navigator.languages
      : [navigator.language || ""];
    if (langs.some((l) => RU_LANGS.test(l))) return true;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && RU_TZ.has(tz)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

let currentSetting = "auto";
let currentLang = isRuRegion() ? "ru" : "en";

export function setLang(setting = "auto") {
  currentSetting = setting === "ru" || setting === "en" ? setting : "auto";
  currentLang =
    currentSetting === "auto" ? (isRuRegion() ? "ru" : "en") : currentSetting;
  if (typeof document !== "undefined") {
    document.documentElement.lang = currentLang;
  }
  return currentLang;
}

export const getLang = () => currentLang;
export const getLangSetting = () => currentSetting;
export const locale = () => (currentLang === "ru" ? "ru-RU" : undefined);

const RU = {
  // HTML shell & topbar
  "tab.tester": "Тестер стратегий",
  "tab.screener": "Скринер",
  "tab.heatmap": "Тепловая карта",
  "tab.seasonals": "Сезонность",
  "tab.financials": "Финансы",
  "tab.paper": "Демо-торговля",
  "tab.editor": "Редактор индикаторов",
  "tab.ptq": "PTQ",
  "side.watchlist": "Котировки",
  "side.alerts": "Оповещения",
  "side.calendar": "Календарь",
  "side.news": "Новости",
  "tb.symbolTitle": "Сменить инструмент (или просто начните печатать)",
  "tb.tfCustomTitle": "Любой таймфрейм: 1s, 7m, 2h, 3D, 2W, 3M",
  "tb.tfCustomPlaceholder": "7m",
  "tb.chartTypeTitle": "Тип графика",
  "tb.indicators": "Индикаторы",
  "tb.compare": "Сравнить",
  "tb.compareTitle": "Сравнить инструменты",
  "tb.layoutTitle": "Сетка графиков",
  "tb.layout.1": "1 график",
  "tb.layout.2v": "2 рядом",
  "tb.layout.2h": "2 друг под другом",
  "tb.layout.3": "3 графика",
  "tb.layout.4": "4 графика",
  "tb.layout.6": "6 графиков",
  "tb.layout.8": "8 графиков",
  "tb.layout.16": "16 графиков",
  "tb.sync": "Синхр.",
  "tb.syncTitle": "Менять инструмент сразу на всех графиках",
  "tb.replay": "Симулятор",
  "tb.replayTitle": "Симулятор баров",
  "tb.alert": "Оповещение",
  "tb.alertTitle": "Создать оповещение",
  "tb.help": "Помощь",
  "tb.helpTitle": "Что нового, как обновить и частые вопросы",
  "tb.log": "Лог",
  "tb.logTitle": "Логарифмическая шкала цен",
  "tb.snapTitle": "Скачать снимок графика",
  "tb.csvTitle": "Экспорт данных графика (CSV)",
  "tb.settingsTitle": "Настройки",
  "tb.themeTitle": "Светлая / тёмная тема",
  "tb.statusTitle": "Статус источников данных",
  "tb.bottomToggleTitle": "Показать / скрыть панель",

  // Chart types
  "ctype.candles": "Свечи",
  "ctype.hollow": "Пустые свечи",
  "ctype.bars": "Бары",
  "ctype.heikin": "Хейкин Аши",
  "ctype.line": "Линия",
  "ctype.linemarkers": "Линия с точками",
  "ctype.step": "Ступенчатая",
  "ctype.area": "Область",
  "ctype.baseline": "Базовая линия",
  "ctype.columns": "Столбцы",
  "ctype.renko": "Ренко",
  "ctype.linebreak": "Линейный прорыв",
  "ctype.range": "Рендж-бары",
  "ctype.kagi": "Каги",
  "ctype.pnf": "Крестики-нолики",

  // Drawing tools
  "tool.cursor": "Курсор",
  "tool.trend": "Линия тренда",
  "tool.ray": "Луч",
  "tool.extended": "Прямая линия",
  "tool.hline": "Горизонтальная линия",
  "tool.hray": "Горизонтальный луч",
  "tool.vline": "Вертикальная линия",
  "tool.channel": "Параллельный канал",
  "tool.rect": "Прямоугольник",
  "tool.fib": "Коррекция Фибоначчи",
  "tool.measure": "Линейка (диапазон цен)",
  "tool.long": "Длинная позиция (Long)",
  "tool.short": "Короткая позиция (Short)",
  "tool.text": "Текстовая заметка",
  "draw.alert": "Оповещение при пересечении выбранной линии",
  "draw.delete": "Удалить выбранный объект (клавиша Delete)",
  "draw.clear": "Удалить все объекты на этом инструменте",
  "draw.selectFirst": "Сначала нажмите на объект рисования, чтобы выбрать его.",
  "draw.clearConfirm": "Удалить все графические объекты на {sym}?",
  "draw.bars": "баров",
  "draw.target": "Цель",
  "draw.stop": "Стоп",
  "draw.entry": "Вход",
  "draw.note": "Заметка",
  "draw.notePrompt": "Текст заметки:",

  // App / toolbar / modals
  "app.saveErr": "Не удалось сохранить: {msg}",
  "app.customLoadErr": "Не удалось загрузить индикатор {file}: {msg}",
  "app.compareWith": "Сравнить с…",
  "app.replayClick": "Нажмите на свечу, с которой нужно начать симуляцию.",
  "app.symbolHintTitle": "{sym} — сменить инструмент (или просто начните печатать)",
  "app.close": "Закрыть",
  "app.symbolSearch": "Поиск инструмента",
  "app.symbolPlaceholder": "BTC, AAPL, EURUSD, ^FTSE, VOD.L…",
  "app.symbolHelp": "Крипто: Binance (резерв — Coinbase и Kraken). Акции и ETF США: Nasdaq. Форекс: Kraken. Индексы, фьючерсы и прочие рынки используют тикеры Yahoo (YAHOO:^FTSE, YAHOO:GC=F).",
  "app.openRaw": "Открыть",
  "app.pressEnter": "нажмите Enter",
  "app.indSearchPlaceholder": "Поиск среди {n} индикаторов…",
  "app.indFoot": "Без ограничений на график. Свои индикаторы можно писать во вкладке «Редактор индикаторов».",
  "app.indNewBtn": "Новый индикатор",
  "app.indOverlay": "на цене",
  "app.indOwnPane": "отдельная панель",
  "app.indAdded": "Добавлен: {name}",
  "app.pickAnchor": "Нажмите на свечу на графике для привязки индикатора.",
  "app.priceGroup": "Цена",
  "app.otherIndGroup": "Другой индикатор",
  "app.pickOnChart": "Выбрать на графике",
  "app.noInputs": "Нет параметров.",
  "app.timeframe": "Таймфрейм",
  "app.sameAsChart": "Как на графике ({tf})",
  "app.mtfHint": "Старший таймфрейм обновляет значение только после закрытия своего бара — без заглядывания в будущее.",
  "app.colours": "Цвета",
  "app.defaults": "По умолчанию",
  "app.apply": "Применить",
  "app.settings": "Настройки",
  "app.barsPerChart": "Баров на графике",
  "app.timeAxis": "Шкала времени",
  "app.localTime": "Местное время",
  "app.utc": "UTC",
  "app.volumeOnChart": "Объём на графике цены",
  "app.show": "Показывать",
  "app.hide": "Скрыть",
  "app.afterDraw": "После рисования",
  "app.backToCursor": "Вернуться к курсору",
  "app.keepTool": "Оставить инструмент",
  "app.crosshair": "Перекрестие между графиками",
  "app.independent": "Независимое",
  "app.synced": "Синхронное",
  "app.language": "Язык интерфейса",
  "app.langAuto": "Авто (регион RU → Русский)",
  "app.langRu": "Русский",
  "app.langEn": "English",
  "app.chartLook": "Внешний вид графика",
  "app.upCandles": "Бычьи свечи",
  "app.downCandles": "Медвежьи свечи",
  "app.bg": "Фон",
  "app.followTheme": "По теме",
  "app.myColour": "Свой цвет",
  "app.bgColour": "Цвет фона",
  "app.gridLines": "Сетка",
  "app.gridBoth": "Обе",
  "app.gridVert": "Только вертикальная",
  "app.gridHorz": "Только горизонтальная",
  "app.gridNone": "Без сетки",
  "app.candleBorders": "Границы свечей",
  "app.wicks": "Тени свечей",
  "app.lastPriceLine": "Линия текущей цены",
  "app.dataFolderHint": "Все ваши данные хранятся локально в папке <code>data</code> рядом с приложением.",
  "app.updates": "Обновления",
  "app.updateVersion": "Версия",
  "app.updateLastCheck": "Последняя проверка",
  "app.updateNever": "ещё не проверялось",
  "app.updateCheckNow": "Проверить обновления",
  "app.updateChecking": "Проверка...",
  "app.updateUpToDate": "Установлена последняя версия",
  "app.updateDownloaded": "Обновление загружено. Перезапустите приложение.",
  "app.updateErr": "Ошибка обновления: {msg}",
  "app.updatePendingToast": "Обновление загружено. Перезапустите приложение, чтобы применить его.",
  "app.defaultLook": "Сбросить вид",
  "app.save": "Сохранить",
  "app.exportCsv": "Экспорт данных графика (CSV)",
  "app.csvTime": "Время",
  "app.csvUnixIso": "Unix секунды и ISO",
  "app.csvUnix": "Unix секунды",
  "app.csvUnixMs": "Unix миллисекунды",
  "app.csvCustom": "Свой формат",
  "app.csvPattern": "Шаблон",
  "app.csvTz": "Часовой пояс шаблона",
  "app.csvSep": "Разделитель",
  "app.csvComma": "Запятая ,",
  "app.csvSemi": "Точка с запятой ;",
  "app.csvTab": "Табуляция",
  "app.csvPipe": "Вертикальная черта |",
  "app.csvDecimals": "Знаков после запятой",
  "app.csvAsIs": "Как есть",
  "app.csvDecMark": "Десятичный разделитель",
  "app.csvPoint": "Точка 1234.5",
  "app.csvDecComma": "Запятая 1234,5",
  "app.csvHeader": "Строка заголовков",
  "app.yes": "Да",
  "app.no": "Нет",
  "app.columns": "Колонки",
  "app.csvHint": "Токены шаблона: YYYY YY MM DD HH mm ss. Укажите разделитель внутри шаблона (YYYY.MM.DD,HH:mm), чтобы разделить дату и время, как в MetaTrader. Настройки запоминаются.",
  "app.download": "Скачать",
  "app.selectLineFirst": "Сначала выберите линию на графике.",
  "app.alertLineTypes": "Оповещения работают для линий тренда, лучей, прямых и горизонтальных линий.",
  "app.lineHray": "Горизонтальный луч",
  "app.lineTrend": "Линия тренда (между двумя точками)",
  "app.lineRay": "Луч",
  "app.lineExt": "Прямая линия",
  "app.lineChan": "Первая линия канала",
  "app.alertNotifTitle": "Оповещение Quant Terminal",
  "app.alertBanner": "Оповещение",
  "app.healthWarn": "Некоторые источники недоступны ({list}); используются резервные.",
  "app.healthOk": "Все источники данных работают",
  "app.healthBad": "Локальный сервер не отвечает. Проверьте, запущен ли он.",
  "app.startupErr": "Ошибка запуска: {msg}",

  // Chart pane
  "chart.loading": "Загрузка {sym}…",
  "chart.noData": "Нет данных для этого инструмента и таймфрейма.",
  "chart.loadErr": "Не удалось загрузить {sym} ({tf}).\n{msg}",
  "chart.mtfErr": "Выберите таймфрейм не ниже текущего ({tf})",
  "chart.missingSrc": "Исходный индикатор отсутствует",
  "chart.latest": "последний",
  "chart.pickBar": "выберите бар",
  "chart.on": "на",
  "chart.missing": "(нет)",
  "chart.compare": "сравнение",
  "chart.remove": "Удалить",
  "chart.loadingSmall": "загрузка…",
  "chart.showHide": "Показать / скрыть",
  "chart.anchored": "Привязано.",
  "chart.replay": "Симулятор",
  "chart.replayBack": "Шаг назад",
  "chart.replayPlay": "Старт / пауза",
  "chart.replayFwd": "Шаг вперёд",
  "chart.replaySpeed": "Скорость",
  "chart.replayPick": "Выбрать новый стартовый бар",
  "chart.replayJump": "Перейти к…",
  "chart.replaySyncTitle": "Проигрывать все графики до одного момента",
  "chart.replayAll": "Все графики",
  "chart.replayExit": "К текущим",
  "chart.replayExitBtn": "Выход",
  "chart.replaySynced": "Синхр. симулятор",

  // Shared operands/rules
  "op.>": "выше",
  "op.<": "ниже",
  "op.>=": "выше или равно",
  "op.<=": "ниже или равно",
  "op.crossesAbove": "пересекает вверх",
  "op.crossesBelow": "пересекает вниз",
  "op.crosses": "пересекает",
  "rule.drawnLine": "Нарисованная линия",
  "rule.priceClose": "Цена (close)",
  "rule.value": "Значение",
  "rule.indicators": "Индикаторы",

  // Watchlist
  "wl.all": "Все списки",
  "wl.newBtn": "+ Список",
  "wl.newTitle": "Новый список",
  "wl.delBtn": "Удалить",
  "wl.delTitle": "Удалить этот список",
  "wl.addPlaceholder": "Добавить тикер в «{list}» (Enter)",
  "wl.newPrompt": "Название нового списка:",
  "wl.keepOne": "Должен остаться хотя бы один список.",
  "wl.delConfirm": "Удалить список «{list}»?",
  "wl.dragTitle": "Перетащите для сортировки",
  "wl.headTitle": "Добавлять новые тикеры в этот список",
  "wl.emptyAll": "Пусто. Перетащите инструмент сюда.",
  "wl.emptyOne": "Список пуст. Добавьте тикер выше.",

  // Alerts
  "al.new": "Новое оповещение",
  "al.perm": "Уведомления на рабочий стол",
  "al.recent": "Сработавшие",
  "al.wlPrefix": "Список: {name}",
  "al.active": "Активно",
  "al.stopped": "Остановлено",
  "al.once": "один раз",
  "al.oncePerBar": "раз за бар",
  "al.oncePerBarClose": "раз при закрытии бара",
  "al.fired": "сработало {n}x",
  "al.stop": "Стоп",
  "al.restart": "Запустить",
  "al.delete": "Удалить",
  "al.empty": "Оповещений пока нет. Они работают внутри сервера и сработают даже при закрытой вкладке, пока запущено приложение.",
  "al.logEmpty": "Пока ничего не срабатывало.",
  "al.yourLine": "ваша линия",
  "al.price": "Цена",
  "al.and": " и ",
  "al.or": " или ",
  "al.createTitle": "Создать оповещение",
  "al.symbol": "Инструмент",
  "al.check": "Проверка",
  "al.justThis": "Только этот тикер",
  "al.everyIn": "Каждый тикер из «{name}»",
  "al.tf": "Таймфрейм",
  "al.conditions": "Условия",
  "al.addCond": "+ Условие",
  "al.fireWhen": "Срабатывать когда",
  "al.matchAll": "все условия верны",
  "al.matchAny": "любое условие верно",
  "al.max5": "До 5 условий.",
  "al.trigger": "Частота",
  "al.trigOnce": "Только один раз",
  "al.trigBar": "Один раз за бар",
  "al.trigClose": "Один раз при закрытии бара",
  "al.msgOpt": "Сообщение (необязательно)",
  "al.msgPh": "BTC пробил уровень",
  "al.sendTo": "Также отправлять (необязательно)",
  "al.hookPh": "URL вебхука Discord, Slack или Telegram",
  "al.test": "Тест",
  "al.tgHint": "Telegram: https://api.telegram.org/bot&lt;token&gt;/sendMessage?chat_id=&lt;your id&gt;. Проверка каждые 15 секунд, пока работает приложение.",
  "al.createBtn": "Создать оповещение",
  "al.max5Toast": "В одном оповещении может быть не более 5 условий.",
  "al.testSent": "Тестовое сообщение отправлено.",
  "al.hookErr": "Вебхук ответил HTTP {status}",
  "al.needCond": "Добавьте условие.",
  "al.created": "Оповещение создано.",

  // Calendar
  "cal.economic": "Экономика",
  "cal.earnings": "Отчёты (Earnings)",
  "cal.dividends": "Дивиденды",
  "cal.all": "Все",
  "cal.medHigh": "Средняя + высокая",
  "cal.high": "Высокая важность",
  "cal.myLists": "Мои списки",
  "cal.loading": "Загрузка…",
  "cal.forecast": "прогноз",
  "cal.previous": "пред.",
  "cal.emptyEcon": "На этой неделе нет событий выбранной важности.",
  "cal.onWatchlist": "Есть в вашем списке",
  "cal.epsForecast": "прогноз EPS",
  "cal.lastYear": "прошл. год",
  "cal.cap": "кап.",
  "cal.perShare": "на акцию",
  "cal.paid": "выплата",
  "cal.perYear": "в год",
  "cal.emptyMine": "Ни одного тикера из ваших списков в ближайшие 5 торговых дней.",
  "cal.emptyOther": "Нет событий в ближайшие 5 торговых дней.",
  "cal.unavail": "Календарь недоступен: {msg}",

  // News, Seasonals, Financials
  "news.refresh": "Обновить",
  "news.loading": "Загрузка заголовков…",
  "news.unavail": "Новости недоступны: {msg}",
  "news.mAgo": "{m} мин назад",
  "news.hAgo": "{h} ч назад",
  "seas.byYear": "{sym} по календарным годам",
  "seas.years": "Лет",
  "seas.loading": "Загрузка дневной истории…",
  "seas.note": "{n} лет дневных баров · среднее по {c} полным годам",
  "seas.avgN": "Среднее за {c} лет",
  "seas.year": "Год",
  "seas.average": "Среднее",
  "seas.pctUp": "% лет в плюсе",
  "seas.foot": "Месячная доходность в %. Прошлая сезонность не гарантирует движение в следующем году.",
  "fin.notSupported": "Финансовые показатели доступны для акций США и криптовалют. Откройте акцию (AAPL, NVDA, JPM…) для отчётов и мультипликаторов или монету (BTCUSDT, SOLUSDT…) для капитализации и эмиссии.",
  "fin.loading": "Загрузка финансовых данных…",
  "fin.keyStats": "{sym} · ключевые показатели",
  "fin.source": "Источник: {src}.",
  "fin.income": "Прибыли и убытки",
  "fin.balance": "Баланс",
  "fin.cashflow": "Денежный поток",
  "fin.ratios": "Коэффициенты",
  "fin.annual": "Годовые",
  "fin.quarterly": "Квартальные",
  "fin.rev": "Выручка",
  "fin.ni": "Чистая прибыль",
  "fin.barsLegend": "Синий: выручка. Зелёный: чистая прибыль.",
  "fin.notAvail": "Нет данных для этой компании.",

  // Strategy tester
  "ts.load": "Загрузить стратегию…",
  "ts.examples": "Примеры",
  "ts.saved": "Сохранённые",
  "ts.run": "Запустить на графике",
  "ts.intro": "Все условия входа должны выполняться одновременно. Для выхода можно требовать все условия или любое одно. Пустой блок пропускается. Сигналы берутся по закрытию свечи и исполняются по открытию следующей.",
  "ts.entryLong": "Покупка (Long), когда",
  "ts.exitLong": "Продажа (выход из Long), когда",
  "ts.entryShort": "Шорт (Short), когда",
  "ts.exitShort": "Выход из Short, когда",
  "ts.exits": "Выходы",
  "ts.exitWhen": "Выходить когда",
  "ts.exitAll": "все условия выхода верны",
  "ts.exitAny": "верно хотя бы одно условие выхода",
  "ts.maxBars": "Выход через N баров (0 = выкл.)",
  "ts.risk": "Риск-менеджмент",
  "ts.sl": "Стоп-лосс %",
  "ts.tp": "Тейк-профит %",
  "ts.trail": "Трейлинг-стоп %",
  "ts.money": "Капитал и комиссии",
  "ts.cap": "Начальный капитал",
  "ts.pos": "Размер позиции %",
  "ts.fee": "Комиссия % за сторону",
  "ts.slip": "Проскальзывание %",
  "ts.spread": "Спред % (bid-ask)",
  "ts.liveSpread": "Живой спред",
  "ts.liveSpreadTitle": "Загрузить текущий спред bid/ask (крипто)",
  "ts.fillsHdr": "Исполнение внутри бара",
  "ts.stopsTargets": "Стопы и цели",
  "ts.intrabar.worst": "Сначала стоп, если бар задел оба уровня (осторожно)",
  "ts.intrabar.ohlc": "Путь TradingView: open, ближний экстремум, дальний, close",
  "ts.intrabar.magnifier": "Увеличение баров: реальные младшие свечи внутри бара",
  "ts.ownData": "Свои данные",
  "ts.impBars": "Импорт баров (CSV)",
  "ts.impSig": "Импорт сигнала (CSV)",
  "ts.impHint": "Бары: time, open, high, low, close, volume — один тикер на файл. График появится как CSV:NAME. Сигнал: time и position (1 лонг, 0 кэш, -1 шорт) по закрытию бара.",
  "ts.saveStrat": "Сохранить стратегию",
  "ts.editJson": "Редактировать JSON",
  "ts.emptyOut": "Выберите готовую или соберите свою стратегию и нажмите <b>Запустить на графике</b>. Тест пройдёт на активном графике и таймфрейме.",
  "ts.reading": "Чтение {name}…",
  "ts.importedBars": "Импортировано {bars} баров ({tf}) как {sym}{skip}. Доступен любой таймфрейм от {tf} и выше.",
  "ts.skippedRows": " (пропущено {n} строк без цены)",
  "ts.signalName": "Сигнал {name}",
  "ts.loadedSig": "Сигнал {name} загружен: {changes} смен позиции. Откройте нужные бары и нажмите «Запустить на графике».",
  "ts.spreadToast": "{sym} ({src}): bid {bid}, ask {ask}. Установлен спред {sp}%.",
  "ts.namePrompt": "Название стратегии:",
  "ts.savedToast": "Стратегия «{name}» сохранена.",
  "ts.jsonTitle": "JSON стратегии",
  "ts.jsonHint": "Тот же формат, который может генерировать ИИ-агент. Операнды: числа, поля цены, ключи индикаторов или key.output.",
  "ts.badJson": "Ошибка JSON: {msg}",
  "ts.noChartData": "На активном графике пока нет данных.",
  "ts.needEntry": "Добавьте хотя бы одно условие входа.",
  "ts.magFinest": "График уже на минимальном таймфрейме для детализации — используется путь OHLC.",
  "ts.magLoading": "Загрузка баров {tf} для детализации внутри свечей…",
  "ts.buyMarker": "Покупка",
  "ts.shortMarker": "Шорт",
  "ts.barsCount": "{n} баров",
  "ts.to": "по",
  "ts.expTrades": "Экспорт сделок (CSV)",
  "ts.clearMarks": "Очистить метки на графике",
  "ts.netProfit": "Чистая прибыль",
  "ts.buyHold": "Купи и держи",
  "ts.maxDd": "Макс. просадка",
  "ts.trades": "Сделок",
  "ts.winRate": "Винрейт",
  "ts.pf": "Профит-фактор",
  "ts.sharpe": "Шарп",
  "ts.sortino": "Сортино",
  "ts.avgTrade": "Средняя сделка",
  "ts.exposure": "Время в рынке",
  "ts.side": "Сторона",
  "ts.entryTime": "Вход",
  "ts.exitTime": "Выход",
  "ts.entryPx": "Цена входа",
  "ts.exitPx": "Цена выхода",
  "ts.pnlPct": "P&L %",
  "ts.bars": "Баров",
  "ts.exitReason": "Причина выхода",
  "ts.eqStrat": "Стратегия",
  "ts.eqBh": "Купи и держи",
  "ts.sideLong": "лонг",
  "ts.sideShort": "шорт",

  // Quant checks
  "qc.badge": "Бонус",
  "qc.title": "Квантовые проверки",
  "qc.desc": "Проверки уровня квант-фондов перед доверием к бэктесту: walk-forward, переобучение (PBO), дефлированный Шарп, стресс-тест комиссий, устойчивость параметров и Монте-Карло. Стратегия пересчитывается около 25 раз на вашем компьютере.",
  "qc.run": "Запустить проверки",
  "qc.checking": "Проверка…",
  "qc.runAgain": "Проверить снова",
  "qc.passed": "Пройдено {p} из {t} проверок",
  "qc.vAll": "Стратегия выдержала все проверки. Проверьте её на демо-торговле перед реальными деньгами.",
  "qc.vZero": "Все проверки провалены. Скорее всего, результат — случайность или подгонка под историю.",
  "qc.vSome": "Часть проверок не пройдена. Результат может быть частично случаен или подогнан под прошлое.",
  "qc.pass": "Пройдено",
  "qc.fail": "Не пройдено",
  "qc.wf": "Walk-forward",
  "qc.wfDesc": "На каждом участке выбирались лучшие настройки по прошлой истории и проверялись на следующем отрезке. Прибыльны {pos} из {tot} участков.",
  "qc.stretch": "Период",
  "qc.picked": "Выбраны настройки",
  "qc.ret": "Доходность",
  "qc.asSet": "как задано",
  "qc.nearby": "Соседние настройки",
  "qc.nearbyDesc": "Чистая доходность для каждой пары параметров. Настоящее преимущество — широкая зелёная зона, а не одна удачная клетка. Рамка — ваши настройки.",
  "qc.netRet": "Чистая доходность",
  "qc.yours": "(ваши)",
  "qc.mc": "Монте-Карло",
  "qc.mcText": "Перемешивание этих {trades} сделок {runs} раз: худшие 5% прогонов завершились на {p5}, медиана — {p50}, лучшие 5% — {p95}. Типичная макс. просадка {dd50}%, в 1 из 20 случаев она достигала {dd95}% и более. В убытке закончились {loss}% прогонов.",
  "qc.noTunables": "Для walk-forward, оценки переобучения и карты параметров нужен хотя бы один целочисленный параметр (например, период индикатора), поэтому на фиксированных правилах или импортированном сигнале они не запускаются.",
  "qc.foot": "Вероятностный Шарп {psr}; лучший Шарп среди {trials} случайных вариантов ожидался на уровне {sr0}. Проверки используют только исторические цены и не гарантируют будущую прибыль.",

  // PTQ UI
  "ptq.brand": "Part-Time Quant",
  "ptq.notConn": "Нет подключения",
  "ptq.notFound": "PTQ не найден по адресу {url}. Запустите PTQ на этом компьютере и повторите попытку.",
  "ptq.notRunning": "PTQ не запущен на {url}. Запустите PTQ локально, чтобы проверять и управлять стратегиями здесь.",
  "ptq.retry": "Проверить снова",
  "ptq.connected": "PTQ {ver} подключён{lic}",
  "ptq.noLic": " · лицензия на этом ПК не найдена",
  "ptq.lead": "Отправьте эти правила в локальный PTQ: он перепроверит их на {sym} ({tf}) своим движком, а прошедшую проверку стратегию можно будет запустить через ваш счёт.",
  "ptq.checkBtn": "Проверить в PTQ",
  "ptq.testing": "PTQ проверяет…",
  "ptq.testingHint": "При первой загрузке истории цен проверка может занять до минуты.",
  "ptq.checkAgain": "Проверить снова",
  "ptq.vApprove": "Прошла проверки PTQ",
  "ptq.vReduce": "Прошла с предупреждениями",
  "ptq.vBlock": "Не прошла проверки PTQ",
  "ptq.noVerdict": "Нет вердикта",
  "ptq.simPreview": "Движок PTQ не запущен, поэтому вернулся симулированный предпросмотр. Это не реальная проверка — запустите движок в PTQ и повторите.",
  "ptq.netRet": "Доходность PTQ",
  "ptq.sharpe": "Шарп PTQ",
  "ptq.maxDd": "Макс. просадка PTQ",
  "ptq.trades": "Сделок PTQ",
  "ptq.diffNote": "PTQ тестировал {inst} на {tf} со своими комиссиями и исполнением, поэтому цифры могут отличаться.",
  "ptq.savedAs": "Сохранено в PTQ как <b>{name}</b>.",
  "ptq.openInPtq": "Открыть в PTQ",
  "ptq.blockedHint": "PTQ не стал бы торговать эту стратегию в текущем виде. Измените правила и проверьте снова.",
  "ptq.armTitle": "Запустить торговлю в PTQ на вашей бирже",
  "ptq.arm1": "Подключите биржу в PTQ:",
  "ptq.arm1b": "Интеграции",
  "ptq.arm1c": ". Ключи хранятся только в PTQ.",
  "ptq.arm2a": "В терминале выполните",
  "ptq.copy": "Копировать",
  "ptq.copied": "Скопировано",
  "ptq.arm2b": "PTQ покажет условия и попросит добавить <code>--yes</code>. Без <code>--unattended</code> каждая сделка требует подтверждения. <code>--max-notional</code> ограничивает размер ордера.",
  "ptq.arm3a": "Следите во вкладке PTQ или на странице",
  "ptq.arm3b": "Автопилот",
  "ptq.armNote": "Живая торговля в PTQ: начинайте с малых сумм. Прошлые результаты не гарантируют будущих.",
  "ptq.refresh": "Обновить",
  "ptq.openApp": "Открыть PTQ",
  "ptq.trading": "Торговля",
  "ptq.ksEngaged": "<b>Остановлено.</b> Стоп-переключатель PTQ активен — новые ордера не выставляются. Снимите блокировку в PTQ, когда будете готовы.",
  "ptq.autoRunning": "Автопилот PTQ работает",
  "ptq.autoPaused": "Автопилот PTQ на паузе",
  "ptq.unattendedOff": " (авто-торговля без подтверждения выключена)",
  "ptq.killBtn": "Остановить всю торговлю PTQ",
  "ptq.killHint": "Мгновенно прекращает новые ордера. Открытые позиции сохраняются — закройте их в PTQ или на бирже.",
  "ptq.killConfirm": "Остановить всю торговлю в PTQ? Новые ордера не будут отправляться, пока вы не снимете блокировку в PTQ.",
  "ptq.killToast": "PTQ остановлен. Новые ордера отключены.",
  "ptq.account": "Счёт",
  "ptq.equity": "Капитал",
  "ptq.cash": "Свободно",
  "ptq.today": "За сегодня",
  "ptq.exposure": "Загрузка",
  "ptq.fromBroker": "Источник: {src}.",
  "ptq.noExch": "В PTQ ещё не подключена биржа.",
  "ptq.connectExch": "Подключить в PTQ",
  "ptq.positions": "Позиции",
  "ptq.mkt": "Рынок",
  "ptq.qty": "Кол-во",
  "ptq.entry": "Вход",
  "ptq.val": "Стоимость",
  "ptq.pnl": "P&L",
  "ptq.noPos": "Нет открытых позиций.",
  "ptq.armed": "Запущенные стратегии",
  "ptq.strat": "Стратегия",
  "ptq.mkts": "Рынки",
  "ptq.maxOrd": "Лимит ордера",
  "ptq.confTrades": "Подтверждение",
  "ptq.exp": "Истекает",
  "ptq.halted": "остановлена",
  "ptq.unattended": "Нет (авто)",
  "ptq.disarm": "Отключить",
  "ptq.disarmed": "отключена",
  "ptq.disarmConfirm": "Отключить эту стратегию? PTQ перестанет торговать по ней.",
  "ptq.disarmToast": "Стратегия отключена.",
  "ptq.noArms": "Нет запущенных стратегий. Нажмите «Проверить в PTQ» в тестере стратегий.",
  "ptq.recentOrders": "Последние ордера PTQ",
  "ptq.time": "Время",
  "ptq.side": "Сторона",
  "ptq.price": "Цена",
  "ptq.status": "Статус",
  "ptq.sim": " (симуляция)",
  "ptq.live": " (реал)",
  "ptq.noOrders": "Ордеров пока нет.",

  // Screener & Heatmap
  "sc.market": "Рынок",
  "sc.crypto": "Крипто (пары к USDT)",
  "sc.us": "Акции США",
  "sc.etf": "ETF США",
  "sc.india": "Индия (NSE, топ-100)",
  "sc.search": "Поиск",
  "sc.priceFrom": "Цена от",
  "sc.priceTo": "Цена до",
  "sc.chgFrom": "Изм. % от",
  "sc.chgTo": "Изм. % до",
  "sc.minVol": "Мин. объём",
  "sc.minCap": "Мин. кап.",
  "sc.sector": "Сектор",
  "sc.all": "Все",
  "sc.techFilter": "Технический фильтр:",
  "sc.on": "На",
  "sc.scan100": "Сканировать топ-100",
  "sc.scanning": "Сканирую {n}…",
  "sc.clearScan": "Сбросить скан",
  "sc.matched": "Совпадений: {h} из {t}.",
  "sc.colSym": "Тикер",
  "sc.colName": "Название",
  "sc.colPrice": "Цена",
  "sc.colChg": "Изм. %",
  "sc.colVolUsdt": "Объём (USDT)",
  "sc.colVol": "Объём",
  "sc.colCap": "Капитализация",
  "sc.colSec": "Сектор",
  "sc.footCount": "Найдено: {n}{more}. Нажмите на строку, чтобы открыть график.",
  "sc.showing500": " (показаны 500)",
  "sc.usNote": " Живые цены для 200 крупнейших компаний; для остальных — последнее закрытие.",
  "sc.inNote": " Цены Yahoo в рупиях. Объём — число акций за сегодня.",
  "hm.us": "Акции США (200 крупнейших)",
  "hm.crypto": "Крипто (топ-100 по объёму)",
  "hm.sizeBy": "Размер по",
  "hm.cap": "Капитализации",
  "hm.vol": "Объёму",
  "hm.hint": "Цвет = изменение за сегодня. Нажмите на плитку, чтобы открыть график.",
  "hm.other": "Другое",
  "hm.tipCap": "Капитализация {v}",

  // Paper trading
  "pp.ticket": "Заявка · {sym}",
  "pp.type": "Тип",
  "pp.market": "Рыночная",
  "pp.limit": "Лимитная",
  "pp.stop": "Стоп",
  "pp.price": "Цена",
  "pp.amt": "Сумма ($)",
  "pp.sl": "Стоп-лосс % (опц.)",
  "pp.tp": "Тейк-профит % (опц.)",
  "pp.buy": "Купить",
  "pp.sell": "Продать / шорт",
  "pp.account": "Счёт",
  "pp.initBal": "Начальный баланс",
  "pp.fee": "Комиссия % за сделку",
  "pp.reset": "Сбросить счёт",
  "pp.replayNote": "<b>Торговля в симуляторе.</b> Ордера исполняются по ценам проигрываемых свечей на отдельном учебном счёте. Шагайте или запустите воспроизведение для срабатывания лимитных и стоп-ордеров.",
  "pp.liveNote": "Симуляция исполнения по текущей цене. Без реальных денег и подключения к бирже.",
  "pp.equity": "Капитал",
  "pp.cash": "Свободно",
  "pp.totalPnl": "Общий P&L",
  "pp.positions": "Позиции",
  "pp.close": "Закрыть",
  "pp.noPos": "Нет открытых позиций.",
  "pp.working": "Активные ордера",
  "pp.bracket": " (брекет)",
  "pp.cancel": "Отменить",
  "pp.none": "Нет.",
  "pp.history": "История сделок",
  "pp.realized": "Реализ. P&L",
  "pp.needPriceAmt": "Нужны текущая цена и сумма больше 0.",
  "pp.setPrice": "Укажите цену ордера.",
  "pp.placed": "Ордер ({type}, {side}) размещён.",
  "pp.fillToast": "Демо-{side}: {qty} {sym} по {px}",
  "pp.resetConfirm": "Сбросить демо-счёт? Позиции, ордера и история будут очищены.",
  "pp.sideBuy": "покупка",
  "pp.sideSell": "продажа",

  // Indicator editor
  "ed.new": "Новый индикатор",
  "ed.yours": "Ваши индикаторы",
  "ed.hint": "Каждый индикатор — небольшой JS-файл в папке <code>custom</code> (пример: <code>docs/indicator-template.js</code>). Перед сохранением код проверяется. Вы также можете попросить ИИ-агента в чате добавить нужный индикатор.",
  "ed.namePh": "Название индикатора",
  "ed.save": "Сохранить",
  "ed.saveAdd": "Сохранить и на график",
  "ed.edit": "Открыть",
  "ed.addToChart": "На график",
  "ed.none": "Пока нет.",
  "ed.loadErr": "Сохранено, но браузер не смог загрузить файл. Проверьте код.",
  "ed.saved": "Сохранено: {file}",
  "ed.delConfirm": "Удалить {file}?",
};

export function t(key, vars) {
  let s = currentLang === "ru" && RU[key] != null ? RU[key] : null;
  if (s == null) return null;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v ?? ""));
    }
  }
  return s;
}

/** Translate with explicit English fallback so callers stay compact and readable. */
export function tr(key, en, vars) {
  let s = t(key, vars);
  if (s != null) return s;
  s = en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v ?? ""));
    }
  }
  return s;
}

const GROUPS_RU = {
  "Quant (bonus)": "Квантовые (бонус)",
  "Moving averages": "Скользящие средние",
  Momentum: "Импульс",
  Trend: "Тренд",
  Volatility: "Волатильность",
  Volume: "Объём",
  Patterns: "Паттерны",
  Custom: "Пользовательские",
  Other: "Другое",
};

export const trGroup = (g) =>
  currentLang === "ru" ? GROUPS_RU[g] || g : g;

const STRATEGIES_RU = {
  "EMA cross (9/21)": "Пересечение EMA (9/21)",
  "RSI mean reversion (30/55)": "Возврат к среднему RSI (30/55)",
  "Supertrend follow": "Следование за Supertrend",
  "MACD + 200 EMA trend filter": "MACD + тренд-фильтр EMA 200",
  "Bollinger breakout": "Пробой полос Боллинджера",
};

export const trStrategy = (name) =>
  currentLang === "ru" ? STRATEGIES_RU[name] || name : name;

const EXIT_REASONS_RU = {
  Stop: "Стоп-лосс",
  Target: "Тейк-профит",
  "Exit long": "Выход из лонга",
  "Exit short": "Выход из шорта",
  Reverse: "Разворот",
  "Time exit": "Выход по времени",
  "End of data": "Конец истории",
};

export const trExitReason = (r) =>
  currentLang === "ru" ? EXIT_REASONS_RU[r] || r : r;

export function trFills(s) {
  if (currentLang !== "ru" || !s) return s;
  if (s === "Stop first when a bar touches both")
    return "Сначала стоп при касании обоих уровней";
  if (s === "OHLC path: open, nearer extreme, far extreme, close")
    return "Путь OHLC: open, ближний экстремум, дальний, close";
  const m = /^Bar magnifier: lower-timeframe bars inside (\d+) of (\d+) bars(.*)$/.exec(s);
  if (m)
    return `Детализация баров: младший ТФ внутри ${m[1]} из ${m[2]} баров${m[3] ? ", остальное по пути OHLC" : ""}`;
  return s;
}

export function trFees(s) {
  if (currentLang !== "ru" || !s) return s;
  const m = /^([^%]+)% fee \+ ([^%]+)% slippage per side(?: \+ ([^%]+)% spread)?$/.exec(s);
  if (!m) return s;
  return `комиссия ${m[1]}% + проск. ${m[2]}% за сторону${m[3] ? ` + спред ${m[3]}%` : ""}`;
}

const QUANT_GATES_RU = {
  "Walk-forward": "Walk-forward",
  "Overfitting (PBO)": "Переобучение (PBO)",
  "Deflated Sharpe": "Дефлированный Шарп",
  "Cost stress": "Стресс-тест издержек",
  "Nearby settings": "Соседние настройки",
};

export function trQuantGate(g) {
  if (currentLang !== "ru") return g;
  const label = QUANT_GATES_RU[g.label] || g.label;
  let value = g.value;
  let m;
  if ((m = /^([\d.-]+) Sharpe on data the settings were never picked on \(needs above 0\)$/.exec(value))) {
    value = `Шарп ${m[1]} на данных вне выборки (нужно > 0)`;
  } else if ((m = /^([\d.]+)% chance the best-looking settings are below average on unseen data \(needs under 50%\)$/.exec(value))) {
    value = `Вероятность ${m[1]}%, что лучшие настройки окажутся ниже среднего на новых данных (нужно < 50%)`;
  } else if ((m = /^([\d.]+) probability the edge is real after (\d+) versions? tried \(needs above 0\.95\)$/.exec(value))) {
    value = `Вероятность реального преимущества ${m[1]} после ${m[2]} вариантов (нужно > 0.95)`;
  } else if ((m = /^([+-]?[\d.]+)% with double fees and ([\d.]+)% slippage a side( and double the spread)? \(needs above 0\)$/.exec(value))) {
    value = `${m[1]}% при двойных комиссиях и ${m[2]}% проскальзывания${m[3] ? " и двойном спреде" : ""} (нужно > 0)`;
  } else if ((m = /^(\d+)% of nearby settings keep at least half the Sharpe \(needs 60%\+\)$/.exec(value))) {
    value = `${m[1]}% соседних настроек сохраняют ≥ 50% Шарпа (нужно ≥ 60%)`;
  }
  return { ...g, label, value };
}

export function applyDomI18n() {
  if (typeof document === "undefined") return;
  const setText = (sel, key, en) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = tr(key, en);
  };
  const setTitle = (sel, key, en) => {
    const el = document.querySelector(sel);
    if (el) el.title = tr(key, en);
  };
  setTitle("#symbolBtn", "tb.symbolTitle", "Change symbol (or just start typing)");
  setTitle("#tfCustom", "tb.tfCustomTitle", "Any timeframe: 1s, 7m, 2h, 3D, 2W, 3M");
  setTitle("#chartType", "tb.chartTypeTitle", "Chart type");
  setText("#indicatorsBtn span", "tb.indicators", "Indicators");
  setTitle("#indicatorsBtn", "tb.indicators", "Indicators");
  setText("#compareBtn span", "tb.compare", "Compare");
  setTitle("#compareBtn", "tb.compareTitle", "Compare symbols");
  setTitle("#layoutSel", "tb.layoutTitle", "Chart layout");
  const layouts = [
    ["1", "1 chart"],
    ["2v", "2 side by side"],
    ["2h", "2 stacked"],
    ["3", "3 charts"],
    ["4", "4 charts"],
    ["6", "6 charts"],
    ["8", "8 charts"],
    ["16", "16 charts"],
  ];
  for (const [v, en] of layouts) {
    setText(`#layoutSel option[value="${v}"]`, `tb.layout.${v}`, en);
  }
  const syncLbl = document.querySelector("#syncSymbol")?.parentElement;
  if (syncLbl) {
    syncLbl.title = tr("tb.syncTitle", "Change the symbol on every chart at once");
    const txt = [...syncLbl.childNodes].find((n) => n.nodeType === 3);
    if (txt) txt.textContent = ` ${tr("tb.sync", "Sync")}`;
  }
  setText("#replayBtn span", "tb.replay", "Replay");
  setTitle("#replayBtn", "tb.replayTitle", "Bar replay");
  setText("#alertBtn span", "tb.alert", "Alert");
  setTitle("#alertBtn", "tb.alertTitle", "Create alert");
  const help = document.querySelector('a.tb[href*="help"]');
  if (help) {
    help.textContent = tr("tb.help", "Help");
    help.title = tr("tb.helpTitle", "What's new, how to update, and common questions");
  }
  setText("#logBtn", "tb.log", "Log");
  setTitle("#logBtn", "tb.logTitle", "Logarithmic price scale");
  setTitle("#snapBtn", "tb.snapTitle", "Download chart image");
  setTitle("#csvBtn", "tb.csvTitle", "Export chart data (CSV)");
  setTitle("#settingsBtn", "tb.settingsTitle", "Settings");
  setTitle("#themeBtn", "tb.themeTitle", "Light / dark");
  setTitle("#status", "tb.statusTitle", "Data status");
  setTitle("#bottomToggle", "tb.bottomToggleTitle", "Show / hide panel");

  const bottomTabs = [
    ["tester", "Strategy tester"],
    ["screener", "Screener"],
    ["heatmap", "Heatmap"],
    ["seasonals", "Seasonals"],
    ["financials", "Financials"],
    ["paper", "Paper trading"],
    ["editor", "Indicator editor"],
    ["ptq", "PTQ"],
  ];
  for (const [id, en] of bottomTabs) {
    setText(`#bottomTabs [data-tab="${id}"]`, `tab.${id}`, en);
  }
  const sideTabs = [
    ["watchlist", "Watchlist"],
    ["alerts", "Alerts"],
    ["calendar", "Calendar"],
    ["news", "News"],
  ];
  for (const [id, en] of sideTabs) {
    setText(`#sideTabs [data-tab="${id}"]`, `side.${id}`, en);
  }
}
