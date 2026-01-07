# K8s GUI Test Manifests

Тестовые манифесты для проверки всех функций k8s-gui.

## Быстрый старт

```bash
# Применить все ресурсы
kubectl apply -f comprehensive-test.yaml

# Проверить статус
kubectl get all -n k8s-gui-test

# Удалить все ресурсы
kubectl delete -f comprehensive-test.yaml
kubectl delete pv k8s-gui-test-pv
```

## Что создаётся

### Namespace
- `k8s-gui-test` — изолированный namespace для тестов

### Configuration (Config & Storage → Configuration)
| Ресурс | Имя | Описание |
|--------|-----|----------|
| ConfigMap | `app-config` | Простые key-value данные |
| ConfigMap | `nginx-config` | Многострочные данные (nginx.conf, index.html) |
| Secret | `app-secrets` | Opaque secret с credentials |
| Secret | `docker-registry-creds` | kubernetes.io/dockerconfigjson |
| Secret | `tls-secret` | kubernetes.io/tls |

### Storage
| Ресурс | Имя | Описание |
|--------|-----|----------|
| PersistentVolume | `k8s-gui-test-pv` | hostPath PV (1Gi) |
| PersistentVolumeClaim | `data-pvc` | PVC (500Mi) |

### Workloads
| Ресурс | Имя | Реплики | Описание |
|--------|-----|---------|----------|
| Deployment | `frontend` | 2 | nginx с ConfigMap volume |
| Deployment | `backend` | 3 | http-echo с env из ConfigMap/Secret |
| Deployment | `worker` | 2 | busybox с логами |
| StatefulSet | `redis` | 3 | Redis с volumeClaimTemplates |
| DaemonSet | `log-collector` | * | На каждой ноде |
| Job | `db-migration` | - | Одноразовая задача |
| CronJob | `backup-job` | - | Каждые 5 минут |

### Pods (standalone)
| Имя | Контейнеры | Описание |
|-----|------------|----------|
| `debug-pod` | main (nginx), sidecar (busybox) | Для тестирования логов, exec, port-forward |
| `failing-pod` | failing | Падает каждые 10 секунд |
| `init-pod` | init-wait, main | Init container demo |

### Network
| Ресурс | Имя | Тип | Описание |
|--------|-----|-----|----------|
| Service | `frontend` | ClusterIP | Frontend service |
| Service | `backend` | ClusterIP | Backend service |
| Service | `frontend-nodeport` | NodePort | Port 30080 |
| Service | `backend-lb` | LoadBalancer | External access |
| Service | `redis-headless` | ClusterIP (headless) | Для StatefulSet |
| Service | `external-api` | ExternalName | api.example.com |
| Service | `external-db` | ClusterIP | Для manual endpoints |
| Ingress | `main-ingress` | - | С TLS, paths: /, /api |
| Ingress | `api-ingress` | - | Без TLS, path rewrite |
| Endpoints | `external-db` | - | Manual endpoints |

## Что можно тестировать

### List views
- [ ] Pods — разные статусы (Running, CrashLoopBackOff, Init)
- [ ] Deployments — разное количество реплик
- [ ] StatefulSets — ordered pods (redis-0, redis-1, redis-2)
- [ ] DaemonSets — pods на каждой ноде
- [ ] Jobs — completed/running jobs
- [ ] CronJobs — scheduled jobs
- [ ] Services — все типы (ClusterIP, NodePort, LoadBalancer, ExternalName, Headless)
- [ ] Ingresses — с TLS и без
- [ ] ConfigMaps — простые и многострочные данные
- [ ] Secrets — разные типы (Opaque, dockerconfigjson, tls)
- [ ] PersistentVolumes — cluster-scoped
- [ ] PersistentVolumeClaims — bound/pending
- [ ] Endpoints — auto-created и manual

### Detail pages
- [ ] Pod detail — containers, volumes, env vars
- [ ] Deployment detail — replicas, strategy, conditions
- [ ] Service detail — endpoints, selectors
- [ ] Ingress detail — rules, TLS, backends

### Actions
- [ ] **Logs** — `debug-pod` (2 контейнера с логами)
- [ ] **Exec/Terminal** — `debug-pod` (nginx + busybox)
- [ ] **Port Forward** — `debug-pod:80`, `backend:8080`
- [ ] **Scale** — `frontend`, `backend` deployments
- [ ] **Restart** — любой deployment
- [ ] **Delete** — любой ресурс
- [ ] **View YAML** — все ресурсы
- [ ] **Edit YAML** — ConfigMaps, Secrets, Deployments
- [ ] **View Data** — Secrets (app-secrets)
- [ ] **Copy Keys** — Secrets

### Events
- [ ] Pod events — создание, scheduling
- [ ] Warning events — `failing-pod` crashes

### Filtering
- [ ] Namespace filter — `k8s-gui-test`
- [ ] Label selector — `app=k8s-gui-test`
- [ ] Status filter — Running, Pending, Failed
- [ ] Service type filter — ClusterIP, NodePort, LoadBalancer
- [ ] Secret type filter — Opaque, tls, dockerconfigjson

## Troubleshooting

### StatefulSet pending
Если redis pods в Pending — возможно нет default StorageClass:
```bash
kubectl get sc
# Если пусто, создайте локальный:
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
EOF
```

### LoadBalancer pending
В локальном кластере (minikube/kind) LoadBalancer будет в Pending. Это нормально.
Для minikube: `minikube tunnel`

### Ingress не работает
Убедитесь что установлен ingress controller:
```bash
# Для minikube
minikube addons enable ingress

# Для kind
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```
