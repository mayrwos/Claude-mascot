(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.MascotI18n = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ru = {
    ui: {
      open: 'Открыть Claude',
      hide: 'Скрыть',
      openTitle: 'Открыть Claude (настраивается в меню)',
      hideTitle: 'Спрятать в трей · Ctrl+Alt+M — вернуть',
      ultra: 'ULTRACODE',
      waiting: 'Разрешить? Ответь в Claude Code',
      done: 'Готово!',
      doneIn: 'Готово за {t}',
      error: 'Ошибка',
      idleWaiting: 'Жду тебя',
      sessions: 'сессии',
      more: 'ещё {n}',
    },
    lines: {
      firstRun: ['Привет! Я Клод. Ткни в меня или наведи курсор: там две кнопки.'],
      idle: [
        'Чем займёмся?',
        'Я тут, если что',
        'Может, отрефакторим что-нибудь?',
        'Не забудь закоммитить',
        'Давай сделаем что-нибудь классное!',
        'Тесты зелёные? Тогда я спокоен',
        'Попей воды',
        'Разомнись немного, я подожду',
        'Бип-буп. Шучу, я Claude',
        'Мне нравится, как ты пишешь код',
        'Хороший код — как хорошая шутка: объяснять не нужно',
        'Ctrl+S уже нажимал?',
        'Сегодня отличный день для чистого кода',
      ],
      tips: [
        'Совет: Shift+Tab переключает режимы — план, авто-правки…',
        'Совет: Esc прерывает Claude, двойной Esc — откат назад',
        'Совет: /compact сжимает контекст длинной сессии',
        'Совет: /init создаст CLAUDE.md для проекта',
        'Совет: @файл — сослаться на файл в запросе',
        'Совет: ! в начале строки — выполнить команду в терминале',
        'Совет: /resume — вернуться к прошлой сессии',
        'Совет: /clear — начать с чистого листа',
        'Совет: правила проекта удобно хранить в CLAUDE.md',
        'Совет: напиши ultrathink в запросе — включу UltraCode',
        'Совет: перетащи меня мышкой, а двойной клик — прыжок!',
        'Совет: правый клик по мне — меню со всем-всем',
      ],
      night: ['Уже поздно… может, баиньки?', 'Ночной кодинг — романтика. Но сон тоже важен'],
      morning: ['Доброе утро! Кофе?', 'Утро! Что сегодня строим?'],
      drag: ['Уиии!', 'Куда летим?', 'Аккуратнее!', 'Я лечу!'],
      dragLong: ['Мне нравится тут летать'],
      dizzy: ['Голова кружится…', 'Ой-ой-ой, всё плывёт'],
      startle: ['А? Что? Я не спал!', 'Ой! Я тут!'],
      loveBurst: ['Я тоже тебя люблю!', 'Сейчас растаю'],
      petMilestone: ['{n} поглаживаний! Ты лучший'],
      greet: ['Claude Code в «{project}» — поехали!'],
      bye: ['Пока! Хорошо поработали'],
      done: ['Готово!', 'Сделано!', 'Задача выполнена'],
      error: ['Что-то пошло не так'],
      compact: ['Сжимаю контекст…'],
      idlePrompt: ['Я жду тебя'],
      welcome: ['С возвращением!'],
      sleep: ['Пойду вздремну…'],
      coffee: ['Кофе-брейк'],
      dance: ['Танцуем!'],
      ultra: ['ULTRACODE'],
      ultraOff: ['Обычный режим'],
      hooksHint: ['Подключи меня к Claude Code через меню — буду видеть, что он делает'],
    },
    verbs: [
      'Размышляю', 'Колдую', 'Мозгую', 'Кумекаю', 'Шуршу', 'Клодирую', 'Варю идеи',
      'Соображаю', 'Прикидываю', 'Вникаю', 'Плету код', 'Шаманю', 'Жонглирую байтами', 'Ворожу',
    ],
    tools: {
      Edit: 'Правлю', MultiEdit: 'Правлю', Write: 'Пишу', NotebookEdit: 'Правлю ноутбук', Read: 'Читаю',
      Bash: 'Запускаю', PowerShell: 'Запускаю', Grep: 'Ищу', Glob: 'Ищу файлы', WebFetch: 'Читаю сайт',
      WebSearch: 'Ищу в сети', Task: 'Зову помощника', Agent: 'Зову помощника', TodoWrite: 'Планирую',
      TaskCreate: 'Планирую', TaskUpdate: 'Планирую', LSP: 'Анализирую', Skill: 'Достаю навык',
      mcp: 'Использую', default: 'Работаю',
    },
  };

  const en = {
    ui: {
      open: 'Open Claude',
      hide: 'Hide',
      openTitle: 'Open Claude (configurable in the menu)',
      hideTitle: 'Hide to tray · Ctrl+Alt+M brings me back',
      ultra: 'ULTRACODE',
      waiting: 'Allow? Answer in Claude Code',
      done: 'Done!',
      doneIn: 'Worked for {t}',
      error: 'Error',
      idleWaiting: 'Waiting for you',
      sessions: 'sessions',
      more: '{n} more',
    },
    lines: {
      firstRun: ['Hi! I am Claude. Poke me, or hover me to see two buttons.'],
      idle: [
        'What are we building?',
        'I am right here',
        'Refactor something?',
        "Don't forget to commit",
        "Let's make something cool!",
        'Tests green? Then I am calm',
        'Drink some water',
        'Stretch a bit, I will wait',
        'Beep boop. Kidding, I am Claude',
        'I like the way you code',
        'Good code is like a good joke: no explanation needed',
        'Did you hit Ctrl+S?',
        'Great day for clean code',
      ],
      tips: [
        'Tip: Shift+Tab cycles modes — plan, auto-accept edits…',
        'Tip: Esc interrupts Claude, Esc Esc rewinds',
        'Tip: /compact shrinks a long session',
        'Tip: /init writes a CLAUDE.md for your project',
        'Tip: @file mentions a file in your prompt',
        'Tip: start a line with ! to run a shell command',
        'Tip: /resume picks up an earlier session',
        'Tip: /clear starts from a clean slate',
        'Tip: keep project rules in CLAUDE.md',
        'Tip: say ultrathink in a prompt and I go UltraCode',
        'Tip: drag me around, double-click to jump!',
        'Tip: right-click me for the full menu',
      ],
      night: ['It is late… bedtime?', 'Night coding is romantic. Sleep is too'],
      morning: ['Good morning! Coffee?', 'Morning! What are we building today?'],
      drag: ['Wheee!', 'Where are we going?', 'Careful!', 'I can fly!'],
      dragLong: ['I like flying up here'],
      dizzy: ['So dizzy…', 'Whoa, everything is spinning'],
      startle: ['Huh? I was not sleeping!', 'Oh! I am here!'],
      loveBurst: ['I love you too!', 'I am melting'],
      petMilestone: ['{n} pets! You are the best'],
      greet: ['Claude Code in "{project}" — let\'s go!'],
      bye: ['Bye! Good work today'],
      done: ['Done!', 'All done!', 'Task complete'],
      error: ['Something went wrong'],
      compact: ['Compacting context…'],
      idlePrompt: ['Waiting for you'],
      welcome: ['Welcome back!'],
      sleep: ['Time for a nap…'],
      coffee: ['Coffee break'],
      dance: ["Let's dance!"],
      ultra: ['ULTRACODE'],
      ultraOff: ['Back to normal'],
      hooksHint: ['Connect me to Claude Code from the menu and I will show what it is doing'],
    },
    verbs: [
      'Clauding', 'Pondering', 'Noodling', 'Percolating', 'Brewing', 'Musing', 'Conjuring',
      'Tinkering', 'Cogitating', 'Simmering', 'Vibing', 'Scheming', 'Wrangling', 'Mulling',
    ],
    tools: {
      Edit: 'Editing', MultiEdit: 'Editing', Write: 'Writing', NotebookEdit: 'Editing notebook', Read: 'Reading',
      Bash: 'Running', PowerShell: 'Running', Grep: 'Searching', Glob: 'Finding files', WebFetch: 'Reading',
      WebSearch: 'Searching the web', Task: 'Calling a helper', Agent: 'Calling a helper', TodoWrite: 'Planning',
      TaskCreate: 'Planning', TaskUpdate: 'Planning', LSP: 'Analyzing', Skill: 'Using a skill',
      mcp: 'Using', default: 'Working',
    },
  };

  const DICTS = { ru, en };

  function resolveLang(pref, locale) {
    if (pref === 'ru' || pref === 'en') return pref;
    return /^(ru|be|kk)\b/i.test(String(locale || '')) ? 'ru' : 'en';
  }

  function dict(lang) {
    return DICTS[lang] || en;
  }

  function format(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  }

  return { DICTS, resolveLang, dict, format };
});
