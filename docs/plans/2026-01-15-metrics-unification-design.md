# Унификация отображения метрик с цветовой индикацией

**Дата:** 2026-01-15
**Статус:** Approved

## Цель

Унифицировать отображение метрик (CPU, Memory) во всём приложении с добавлением:
- Контекста лимитов и requests
- Умной цветовой индикации
- Адаптивного отображения (компактное в таблицах, полное в деталях)

## Ключевые решения

### 1. Адаптивное отображение
- **Таблицы:** компактный вид (значение + цветовой индикатор + tooltip)
- **Страницы деталей:** полная информация (usage / request / limit + прогресс-бар)

### 2. База для расчёта процента (умный выбор)
Приоритет: Limit → Request → ничего

| Есть Limit | Есть Request | Результат |
|------------|--------------|-----------|
| Да | Любой | % от limit |
| Нет | Да | % от request + пометка "no limit" |
| Нет | Нет | Только абсолютное значение |

### 3. Пороги цветовой индикации (разные для CPU и Memory)

| Метрика | Warning (жёлтый) | Critical (красный) | Обоснование |
|---------|------------------|-------------------|-------------|
| CPU | 80% | 95% | Throttling терпим |
| Memory | 70% | 85% | OOMKill критичен |

### 4. Индикация отсутствия лимитов
- Текстовая метка: `*` в таблицах, `(no limit)` в деталях
- Пунктирный прогресс-бар вместо сплошного
- Сноска внизу таблицы: `* — pod has no resource limit configured`

## Архитектура

### Новый тип данных

```typescript
interface MetricState {
  value: number              // текущее использование
  displayValue: string       // "256Mi"
  percentage: number | null  // процент (или null если нечего считать)
  base: 'limit' | 'request' | null  // от чего считали
  level: 'normal' | 'warning' | 'critical'
  hasLimit: boolean
  hasRequest: boolean
}
```

### Структура файлов

```
src/lib/
├── k8s-quantity.ts          # Существующий (без изменений)
├── metrics-utils.ts         # НОВЫЙ: логика расчёта и цветов
│   ├── calculateMetricState()
│   ├── getThresholds()
│   └── getUtilizationLevel()

src/components/ui/
└── metric-card.tsx          # Рефакторинг
    ├── MetricValue          # Базовый: значение с опц. процентом
    ├── MetricBar            # Прогресс-бар (сплошной/пунктирный)
    ├── MetricBadge          # Компактный для таблиц
    ├── MetricCard           # Карточка для деталей
    └── MetricPair           # CPU + Memory вместе
```

### Логика calculateMetricState()

```typescript
function calculateMetricState(
  type: 'cpu' | 'memory',
  usage: number | null,
  request: number | null,
  limit: number | null
): MetricState

// 1. Если usage === null → вернуть "нет данных"
// 2. Выбор базы: limit → request → null
// 3. Расчёт процента от выбранной базы
// 4. Определение level по порогам типа метрики
// 5. Форматирование displayValue
```

## Компоненты

### MetricBadge (для таблиц)
```tsx
<MetricBadge
  type="memory"
  usage={400 * 1024 * 1024}
  request={256 * 1024 * 1024}
  limit={512 * 1024 * 1024}
/>
// Рендер: цветной бейдж "256Mi"
// Tooltip: "256Mi / 512Mi (50%)"
```

### MetricCard (для деталей)
```tsx
<MetricCard
  title="Memory"
  type="memory"
  usage={400 * 1024 * 1024}
  request={256 * 1024 * 1024}
  limit={512 * 1024 * 1024}
/>
// ┌─────────────────────────┐
// │ Memory           78%    │
// │ ████████████░░░░░░░░░░░ │
// │ 400Mi / 512Mi limit     │
// │ Request: 256Mi          │
// └─────────────────────────┘
```

## Применение по страницам

### Таблица подов
- Расширить данные пода — добавить агрегированные requests/limits
- Использовать MetricBadge с tooltip
- Сноска `*` для подов без лимитов

### Таблица нод
- Добавить колонки CPU/Memory
- База = allocatable capacity ноды

### Pod Detail
- Секция "Resource Usage" на уровне пода (агрегация)
- MetricCard для каждого контейнера с usage vs limits

### Deployment/StatefulSet/DaemonSet Detail
- Агрегированные метрики всех подов
- Мини-таблица подов с индивидуальными метриками

### Cluster Overview
- Применить новые пороги
- TopPodsCard с контекстом лимитов
- Опционально: сводка по лимитам в кластере

## План реализации

1. `metrics-utils.ts` — новый файл с логикой
2. `metric-card.tsx` — рефакторинг компонентов
3. Хелперы агрегации в `metrics.ts`
4. PodList — применить обновлённый MetricBadge
5. NodeList — добавить колонки метрик
6. PodDetail — секция Resource Usage
7. Deployment/StatefulSet/DaemonSet Detail — агрегированные метрики
8. ClusterOverview — новые пороги, улучшенный TopPodsCard

## Затрагиваемые файлы

- `src/lib/metrics-utils.ts` — новый
- `src/components/ui/metric-card.tsx` — рефакторинг
- `src/lib/metrics.ts` — добавить агрегацию
- `src/components/resources/PodList.tsx`
- `src/components/resources/NodeList.tsx`
- `src/components/resources/columns.tsx`
- `src/pages/PodDetail.tsx`
- `src/pages/DeploymentDetail.tsx`
- `src/pages/StatefulSetDetail.tsx`
- `src/pages/DaemonSetDetail.tsx`
- `src/pages/ClusterOverview.tsx`
- `src/components/overview/TopPodsCard.tsx`
