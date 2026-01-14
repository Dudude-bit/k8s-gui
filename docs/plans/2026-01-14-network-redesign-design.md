# Network Module Redesign

## Overview

Полный редизайн Network модуля (Services, Ingresses, Endpoints) для улучшения:
- Корректного отображения TLS информации
- Читаемости портов и данных
- Связанности между ресурсами
- Обработки ошибок и edge cases

## Проблемы текущей реализации

### TLS отображение
1. **Несоответствие между списком и деталями** - в списке проверяется только `tlsHosts`, а в деталях ещё и `hasCatchAllTls`
2. **"All hosts" при пустом массиве** - если `hosts: []`, показывается "All hosts" без объяснения
3. **Backend проблема** - если TLS секция без hosts, `tls_hosts` пустой, но `tls_configs` содержит запись

### Читаемость данных
4. **Формат портов непонятный** - `8080:30000>8000/TCP` неочевидно что есть что
5. **Resource Backend как сырая строка** - плохо читается

### Связанность
6. **Нет связи Service → Pods** - selector показывается, но какие поды выбраны не видно
7. **Нет ссылок на backend services** - в Ingress нельзя перейти к сервису

### Обработка ошибок
8. **"Open in Browser" скрывается без объяснения**
9. **Нестандартные порты не учитываются в URL**
10. **Events не показывают ошибки загрузки**

---

## Дизайн решения

### 1. Исправления TLS отображения

#### Backend изменения (src-tauri/src/resources/network.rs)

```rust
pub struct IngressTlsConfig {
    pub hosts: Vec<String>,
    pub secret_name: Option<String>,
    pub is_catch_all: bool,  // НОВОЕ: true если hosts пустой
}

pub struct IngressInfo {
    // существующие поля...
    pub tls_hosts: Vec<String>,
    pub tls_configs: Vec<IngressTlsConfig>,
    pub has_catch_all_tls: bool,  // НОВОЕ: для быстрой проверки
}
```

Логика парсинга:
```rust
let is_catch_all = tls.hosts.as_ref().map(|h| h.is_empty()).unwrap_or(true);

let has_catch_all_tls = tls_configs.iter().any(|c| c.is_catch_all);
```

#### IngressList - новое отображение TLS колонки

| Состояние | Отображение |
|-----------|-------------|
| Явные TLS хосты | `TLS (2)` зелёный бейдж с tooltip списка |
| Catch-all TLS | `TLS (all)` зелёный бейдж |
| Оба варианта | `TLS (2 + all)` |
| Нет TLS | `No TLS` серый бейдж |

#### IngressDetail - улучшенный TLS таб

```
┌─────────────────────────────────────────────────┐
│ TLS Configuration                               │
├─────────────────────────────────────────────────┤
│ Explicit TLS Hosts:                             │
│ ┌─────────────────────────────────────────────┐ │
│ │ 🔒 example.com                              │ │
│ │    Secret: my-tls-secret                    │ │
│ ├─────────────────────────────────────────────┤ │
│ │ 🔒 api.example.com                          │ │
│ │    Secret: api-tls-secret                   │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ⚠️ Catch-all TLS:                               │
│ ┌─────────────────────────────────────────────┐ │
│ │ Secret: wildcard-cert                       │ │
│ │ Applies to: All hosts not explicitly listed │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

#### Access URLs - точное определение HTTPS

- Проверять `tlsHosts.includes(host)` ИЛИ `hasCatchAllTls`
- Показывать tooltip объясняющий почему HTTPS:
  - "TLS: explicit host configuration"
  - "TLS: catch-all certificate"

---

### 2. Улучшение читаемости портов в Services

#### ServiceList - новый формат портов

Вместо `8080:30000>8000/TCP` показывать компактно:
- `80→8080` (port → targetPort)
- Если есть NodePort: `80→8080 (30080)`

Tooltip с полной информацией:
```
Port: 80
Target Port: 8080
Node Port: 30080
Protocol: TCP
```

#### ServiceDetail - секция "How to Access This Service"

```
┌─────────────────────────────────────────────────┐
│ 🔗 How to Access This Service                   │
├─────────────────────────────────────────────────┤
│ Type: LoadBalancer                              │
│                                                 │
│ External Access:                                │
│ • http://203.0.113.50:80                       │ [Copy] [Open]
│                                                 │
│ Internal Access (within cluster):               │
│ • my-service.default.svc.cluster.local:80      │ [Copy]
│                                                 │
│ From same namespace:                            │
│ • my-service:80                                │ [Copy]
└─────────────────────────────────────────────────┘
```

Для разных типов сервисов:
- **ClusterIP**: только internal access
- **NodePort**: `<any-node-ip>:30080` + internal
- **LoadBalancer**: External IP + internal
- **ExternalName**: DNS alias информация

#### Цветовая индикация типов сервисов

| Тип | Цвет | Значение |
|-----|------|----------|
| ClusterIP | Серый | Internal only |
| NodePort | Синий | External via nodes |
| LoadBalancer | Зелёный | External via LB |
| ExternalName | Жёлтый | DNS alias |

#### Улучшенная таблица портов

```
┌────────┬────────────┬──────────┬──────────┐
│ Port   │ Target     │ NodePort │ Protocol │
├────────┼────────────┼──────────┼──────────┤
│ 80     │ 8080       │ 30080    │ TCP      │
│ 443    │ 8443       │ 30443    │ TCP      │
└────────┴────────────┴──────────┴──────────┘
```

---

### 3. Связанность ресурсов

#### ServiceDetail - секция "Matching Pods"

```
┌─────────────────────────────────────────────────┐
│ 🔗 Matching Pods (3 running, 1 pending)         │
├─────────────────────────────────────────────────┤
│ ● my-app-7d4b8c9-abc12   Running    10.0.1.15  │ → click
│ ● my-app-7d4b8c9-def34   Running    10.0.1.16  │ → click
│ ● my-app-7d4b8c9-ghi56   Running    10.0.1.17  │ → click
│ ○ my-app-7d4b8c9-jkl78   Pending    -          │ → click
└─────────────────────────────────────────────────┘
```

Функционал:
- Показывать поды, соответствующие selector
- Кликабельные ссылки на PodDetail
- Статус и IP каждого пода
- Счётчик по статусам в заголовке
- Если нет подов: "No pods match this selector"

#### Backend: новая команда

```rust
#[tauri::command]
pub async fn get_pods_by_selector(
    namespace: String,
    selector: std::collections::BTreeMap<String, String>,
    state: State<'_, AppState>,
) -> Result<Vec<PodInfo>, String> {
    // Конвертировать selector в label selector string
    // Запросить поды с этим selector
}
```

#### IngressDetail - кликабельные backend services

В Access URLs и Rules табах:
- `→ my-service:8080` становится ссылкой `<Link to="/services/default/my-service">`
- Tooltip показывает: тип сервиса, количество endpoints, статус
- Иконка ⚠️ если сервис не найден в кластере

#### Endpoints - связь с Service и Pods

- Заголовок страницы: ссылка на родительский Service
- Каждый address с targetRef: ссылка на Pod
- Not ready addresses: показать причину (если pod в CrashLoopBackOff и т.д.)

---

### 4. Обработка ошибок и edge cases

#### Ingress "Open in Browser" - информативные состояния

| Состояние | UI |
|-----------|-----|
| URL готов | ✅ Активная кнопка |
| Ждём LoadBalancer | ⏳ "Waiting for LoadBalancer IP" с анимацией |
| Wildcard host | ⚠️ "Wildcard host - enter URL manually" |
| Нет хостов | ❌ "No valid host configured" (disabled) |

#### Ingress Access URLs - нестандартные порты

Проверять LoadBalancer ports и показывать предупреждение:
```
⚠️ LoadBalancer uses non-standard port 8443
   Access via: https://203.0.113.50:8443
```

Также проверять известные annotations:
- `nginx.ingress.kubernetes.io/backend-protocol`
- `nginx.ingress.kubernetes.io/ssl-passthrough`

#### Events - обработка ошибок

```tsx
{eventsError ? (
    <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <span>Failed to load events: {eventsError.message}</span>
        <Button size="sm" onClick={refetchEvents}>Retry</Button>
    </Alert>
) : eventsLoading ? (
    <Skeleton className="h-20" />
) : events.length === 0 ? (
    <p className="text-muted-foreground">No events found</p>
) : (
    <EventsList events={events} />
)}
```

#### Пустые/невалидные состояния

| Ресурс | Состояние | Отображение |
|--------|-----------|-------------|
| Service | Нет портов, есть selector | "Headless service" (информация) |
| Service | Нет портов, нет selector | "Configuration issue: no ports defined" (предупреждение) |
| Endpoints | Нет ready addresses | "No ready endpoints - check pod status" + ссылка на поды |
| Ingress | Нет rules | "No routing rules configured" |

---

## Структура файлов

### Изменения в существующих файлах

```
src-tauri/src/resources/network.rs
├── IngressInfo: добавить has_catch_all_tls
├── IngressTlsConfig: добавить is_catch_all
└── Новая функция: get_pods_by_selector()

src/generated/types.ts
└── Обновить типы после изменений backend

src/components/resources/
├── IngressList.tsx: новая TLS колонка с catch-all
├── ServiceList.tsx: новый формат портов, цветные типы
└── EndpointsList.tsx: добавить nodeName в not-ready tooltip

src/pages/
├── IngressDetail.tsx:
│   ├── Улучшенный TLS таб (explicit + catch-all секции)
│   ├── Кликабельные backend services
│   └── Информативные состояния "Open in Browser"
├── ServiceDetail.tsx:
│   ├── Новая секция "How to Access"
│   ├── Новая секция "Matching Pods"
│   └── Улучшенная таблица портов
└── EndpointsDetail.tsx:
    ├── Ссылка на родительский Service
    └── Кликабельные pod references
```

### Новые компоненты

```
src/components/network/
├── TlsBadge.tsx          # Универсальный бейдж TLS с tooltip
├── PortsDisplay.tsx      # Компактное отображение портов
├── ServiceAccessInfo.tsx # "How to Access" карточка
├── MatchingPods.tsx      # Список подов по selector
└── LinkedResource.tsx    # Кликабельная ссылка на ресурс с превью
```

---

## План реализации

### Этап 1: Backend изменения
- [ ] Добавить `is_catch_all` в `IngressTlsConfig`
- [ ] Добавить `has_catch_all_tls` в `IngressInfo`
- [ ] Реализовать `get_pods_by_selector` команду
- [ ] Обновить парсинг TLS в `From<Ingress> for IngressInfo`

### Этап 2: Regenerate types
- [ ] Запустить генерацию типов
- [ ] Обновить фронтенд типы

### Этап 3: TLS исправления
- [ ] Создать `TlsBadge.tsx` компонент
- [ ] Обновить TLS колонку в `IngressList.tsx`
- [ ] Переделать TLS таб в `IngressDetail.tsx`
- [ ] Исправить логику HTTPS в `generateAccessUrls`

### Этап 4: Services улучшения
- [ ] Создать `PortsDisplay.tsx` компонент
- [ ] Создать `ServiceAccessInfo.tsx` компонент
- [ ] Создать `MatchingPods.tsx` компонент
- [ ] Обновить `ServiceList.tsx` (порты, цвета типов)
- [ ] Обновить `ServiceDetail.tsx` (access info, matching pods, таблица портов)

### Этап 5: Связанность ресурсов
- [ ] Создать `LinkedResource.tsx` компонент
- [ ] Добавить кликабельные backend services в `IngressDetail.tsx`
- [ ] Добавить ссылку на Service в `EndpointsDetail.tsx`
- [ ] Добавить кликабельные pod references в Endpoints

### Этап 6: Error handling
- [ ] Добавить информативные состояния "Open in Browser"
- [ ] Добавить обработку ошибок Events
- [ ] Добавить предупреждения о нестандартных портах
- [ ] Обработать все edge cases (пустые состояния)

---

## Примеры UI

### TLS Badge варианты

```
[TLS (2)]           - зелёный, tooltip: "example.com, api.example.com"
[TLS (all)]         - зелёный, tooltip: "Catch-all TLS certificate"
[TLS (2 + all)]     - зелёный, tooltip: "2 explicit + catch-all"
[No TLS]            - серый outline
```

### Service Type Badge варианты

```
[ClusterIP]         - серый, internal
[NodePort]          - синий, external via node ports
[LoadBalancer]      - зелёный, external via load balancer
[ExternalName]      - жёлтый, DNS alias
```

### Port Display варианты

Компактно (в списке):
```
80→8080, 443→8443
80→8080 (30080)     - с NodePort
```

Полная таблица (в деталях):
```
┌────────┬────────────┬──────────┬──────────┐
│ Port   │ Target     │ NodePort │ Protocol │
├────────┼────────────┼──────────┼──────────┤
│ 80     │ http       │ 30080    │ TCP      │
│ 443    │ https      │ 30443    │ TCP      │
└────────┴────────────┴──────────┴──────────┘
```
