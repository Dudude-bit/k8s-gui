# Secrets, ConfigMaps & Environment Variables Redesign

## Overview

Комплексный редизайн отображения Secrets, ConfigMaps и переменных окружения для обеспечения консистентности UI, полного охвата всех типов использования и добавления обратных ссылок.

## Проблемы

### Неконсистентность дизайна
- `SecretDetail` использует `SecretKeyValueList`, `ConfigMapDetail` имеет inline-реализацию
- Разные механизмы expand/reveal для похожих данных
- `SecretDataDialog` и `ConfigMapDataDialog` дублируют логику

### Неполный функционал
- EnvFrom показывает только имя источника, не разворачивает данные
- Нет обратных ссылок (какие workloads используют Secret/ConfigMap)
- Volume mounts с Secret/ConfigMap не показывают содержимое
- Image Pull Secrets и TLS Ingress не отображаются в связях

## Решение

### Подход к унификации

Семейство компонентов с общей базой из примитивов:
- Общие примитивы (`MaskedValue`, `CopyButton`, `SourceBadge`) для консистентности
- Базовый `KeyValueItem` для общей логики
- Специализированные обёртки для контекста (Secret, ConfigMap, EnvVar)

---

## Архитектура компонентов

### UI Примитивы

```
src/components/ui/
├── masked-value.tsx       # Значение с маской ••••• и toggle reveal
├── copy-button.tsx        # Кнопка копирования (уже есть)
└── source-badge.tsx       # Badge: Secret/ConfigMap/Direct/Field/Volume
```

### Shared компоненты (новые)

```
src/components/shared/
├── key-value-item.tsx     # Строка: key | value | source | actions
├── key-value-list.tsx     # Карточка со списком key-value + bulk actions
├── key-value-table.tsx    # Табличный вид для env vars
└── resource-link.tsx      # Ссылка на ресурс с иконкой (Secret, ConfigMap, Pod...)
```

### Resource компоненты (рефакторинг)

```
src/components/resources/
├── secret-data-view.tsx        # Secret detail → Data таб
├── configmap-data-view.tsx     # ConfigMap detail → Data таб
├── referenced-by.tsx           # "Used by" список (расширение RelatedResources)
├── environment-variables.tsx   # Переписанный, объединённый список
├── volume-mounts.tsx           # Volume mounts с содержимым
└── image-pull-secrets.tsx      # Image pull secrets display
```

---

## Backend API

### Новые Tauri команды

```rust
// Получить список ресурсов, использующих Secret/ConfigMap
#[tauri::command]
async fn get_resource_references(
    resource_type: String,  // "Secret" | "ConfigMap"
    name: String,
    namespace: String,
) -> Result<ResourceReferences, Error>
```

### Структура ответа

```typescript
interface ResourceReferences {
  // Использование в env vars
  envVars: ResourceReference[];

  // Использование в envFrom (bulk import)
  envFrom: ResourceReference[];

  // Использование как volume
  volumes: VolumeReference[];

  // Image pull secrets (только для Secrets)
  imagePullSecrets: ResourceReference[];

  // TLS в Ingress (только для Secrets)
  tlsIngress: IngressReference[];
}

interface ResourceReference {
  kind: string;           // "Pod" | "Deployment" | "StatefulSet" ...
  name: string;
  namespace: string;
  containerName?: string; // в каком контейнере
  key?: string;           // какой ключ используется (null = все)
}

interface VolumeReference extends ResourceReference {
  mountPath: string;      // куда смонтировано
  subPath?: string;
}

interface IngressReference {
  name: string;
  namespace: string;
  hosts: string[];        // для каких хостов TLS
}
```

---

## Secret/ConfigMap Detail View

### Структура табов

```
Secret Detail
├── Data          # Ключи и значения (с reveal/copy)
├── Referenced By # NEW: Кто использует этот Secret
├── Metadata      # Labels, Annotations
└── YAML          # Raw YAML (redacted для secrets)
```

### Data таб (унифицированный)

Использует новый `KeyValueList`:
- Bulk actions: "Reveal All" / "Hide All" / "Copy All as JSON"
- Каждая строка: key | masked value | char count | reveal | copy
- Для ConfigMap: значения не маскируются
- Для Secret: маскируются по умолчанию

### Referenced By таб (новый)

```
┌─────────────────────────────────────────────────────────┐
│ Referenced By                                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ▼ Environment Variables (3)                             │
│   ┌─────────────────────────────────────────────────┐   │
│   │ 📦 Deployment: api-server                       │   │
│   │    Container: main → DB_PASSWORD (key: password)│   │
│   └─────────────────────────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────┐   │
│   │ 📦 StatefulSet: worker                          │   │
│   │    Container: app → envFrom (all keys)          │   │
│   └─────────────────────────────────────────────────┘   │
│                                                         │
│ ▼ Volume Mounts (1)                                     │
│   ┌─────────────────────────────────────────────────┐   │
│   │ 📦 Deployment: nginx                            │   │
│   │    Container: web → /etc/ssl/certs              │   │
│   └─────────────────────────────────────────────────┘   │
│                                                         │
│ ▼ TLS Ingress (1)                                       │
│   ┌─────────────────────────────────────────────────┐   │
│   │ 🌐 Ingress: api-ingress                         │   │
│   │    Hosts: api.example.com, www.example.com      │   │
│   └─────────────────────────────────────────────────┘   │
│                                                         │
│ ▸ Image Pull Secrets (0)                                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Каждый ресурс — кликабельная ссылка
- Группировка по типу использования
- Collapsible секции с count badge
- Пустые секции свёрнуты по умолчанию

---

## Container Configuration View

### Новый таб "Configuration" в Pod/Deployment detail

Заменяет текущее отображение env vars в ContainerCard. Единый таб с collapsible секциями:

```
┌─────────────────────────────────────────────────────────┐
│ Configuration                     [Filter: All ▼]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ▼ Environment Variables (12)        [Reveal Secrets]   │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Name          │ Value        │ Source               │ │
│ ├───────────────┼──────────────┼──────────────────────┤ │
│ │ NODE_ENV      │ production   │ Direct               │ │
│ │ DB_HOST       │ postgres.svc │ ConfigMap: db-config │ │
│ │ DB_PASSWORD   │ ••••••••  👁 │ Secret: db-creds     │ │
│ │ API_KEY       │ ••••••••  👁 │ Secret: api-secrets  │ │
│ │ LOG_LEVEL     │ info         │ EnvFrom: app-config  │ │
│ │ CACHE_TTL     │ 3600         │ EnvFrom: app-config  │ │
│ │ ...           │              │                      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ▼ Volume Mounts (3)                                     │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Mount Path       │ Source              │ Keys       │ │
│ ├──────────────────┼─────────────────────┼────────────┤ │
│ │ /etc/ssl/certs   │ Secret: tls-cert    │ tls.crt,   │ │
│ │                  │                     │ tls.key    │ │
│ │ /app/config      │ ConfigMap: app-cfg  │ all keys   │ │
│ │ /data            │ PVC: data-volume    │ —          │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ▸ Image Pull Secrets (1)                                │
│   docker-registry-creds                                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Ключевые особенности

- **Объединённый список env vars**: direct + secretKeyRef + configMapKeyRef + envFrom
- **Source колонка**: кликабельная ссылка на Secret/ConfigMap
- **Reveal secrets**: глобальный toggle + per-row для секретов
- **Volume mounts**: показывает тип источника и какие ключи монтируются
- **Expand volume content**: кнопка чтобы увидеть содержимое файлов (для Secret/ConfigMap volumes)
- **Filter dropdown**: фильтр по источнику (All / Secrets only / ConfigMaps only / Direct only)

---

## План реализации

### Этап 1: UI примитивы и shared компоненты

```
1.1 Создать src/components/ui/masked-value.tsx
1.2 Создать src/components/ui/source-badge.tsx
1.3 Создать src/components/shared/key-value-item.tsx
1.4 Создать src/components/shared/key-value-list.tsx
1.5 Создать src/components/shared/key-value-table.tsx
1.6 Создать src/components/shared/resource-link.tsx
```

### Этап 2: Backend API

```
2.1 Добавить get_resource_references команду в Rust
2.2 Добавить TypeScript типы в generated/types
2.3 Добавить команду в src/lib/commands.ts
```

### Этап 3: Secret/ConfigMap detail refactoring

```
3.1 Создать secret-data-view.tsx (использует key-value-list)
3.2 Создать configmap-data-view.tsx (использует key-value-list)
3.3 Создать referenced-by.tsx компонент
3.4 Обновить SecretDetail.tsx — использовать новые компоненты
3.5 Обновить ConfigMapDetail.tsx — использовать новые компоненты
3.6 Удалить старые SecretDataDialog, ConfigMapDataDialog
```

### Этап 4: Container Configuration view

```
4.1 Создать volume-mounts.tsx компонент
4.2 Создать image-pull-secrets.tsx компонент
4.3 Переписать environment-variables.tsx с объединённым списком
4.4 Создать container-configuration.tsx (объединяет всё)
4.5 Обновить ContainerCard — использовать новый компонент
4.6 Обновить PodDetail, DeploymentDetail и другие workloads
```

### Этап 5: Cleanup

```
5.1 Удалить неиспользуемые старые компоненты
5.2 Обновить экспорты в index.ts файлах
5.3 Проверить консистентность стилей
```

---

## Типы использования Secret/ConfigMap (полный охват)

| Тип | Где в YAML | Отображение |
|-----|-----------|-------------|
| env secretKeyRef | `env[].valueFrom.secretKeyRef` | Environment Variables таблица |
| env configMapKeyRef | `env[].valueFrom.configMapKeyRef` | Environment Variables таблица |
| envFrom secret | `envFrom[].secretRef` | Environment Variables таблица (развёрнуто) |
| envFrom configMap | `envFrom[].configMapRef` | Environment Variables таблица (развёрнуто) |
| volume secret | `volumes[].secret` | Volume Mounts таблица |
| volume configMap | `volumes[].configMap` | Volume Mounts таблица |
| imagePullSecrets | `imagePullSecrets[]` | Image Pull Secrets секция |
| TLS Ingress | `tls[].secretName` | Referenced By → TLS Ingress |

---

## Безопасность

- Secrets маскируются по умолчанию во всех контекстах
- Lazy loading для секретов (загружаются только при reveal)
- ConfigMaps не маскируются (не содержат sensitive data)
- YAML view для secrets — redacted версия
