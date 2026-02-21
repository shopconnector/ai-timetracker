# CLAUDE.md - Instrukcje MUST HAVE dla serwera dev.beecommerce.pl

> **UWAGA:** Te instrukcje są OBOWIĄZKOWE przy KAŻDYM projekcie na tym serwerze.
> Claude Code MUSI przestrzegać tych zasad bez wyjątków.

---

## 1. STRUKTURA PROJEKTÓW - ZASADY ŻELAZNE

### 1.1 Lokalizacja projektów
```
/home/bgaca/projects/
├── ai-project-{nazwa}/          # Każdy projekt w osobnym katalogu
│   ├── docker-compose.yml       # OBOWIĄZKOWY
│   ├── Dockerfile               # OBOWIĄZKOWY (lub docker/{service}.Dockerfile)
│   ├── .env                     # Zmienne środowiskowe (NIE COMMITOWAĆ!)
│   ├── .env.example             # Przykład zmiennych (DO REPOZYTORIUM)
│   ├── .dockerignore            # OBOWIĄZKOWY
│   ├── .gitignore               # OBOWIĄZKOWY
│   ├── README.md                # Dokumentacja projektu
│   └── src/                     # Kod źródłowy
```

### 1.2 Konwencja nazewnictwa
| Element | Pattern | Przykład |
|---------|---------|----------|
| Katalog projektu | `ai-project-{nazwa}` | `ai-project-hemplab` |
| Kontener Docker | `{nazwa}-{service}` | `hemplab-app`, `hemplab-backend` |
| **Hostname Docker** | `{service}.{nazwa}.docker` | `app.hemplab.docker` |
| Sieć Docker | `{nazwa}-network` | `hemplab-network` |
| Subdomena | `{nazwa}.dev.beecommerce.pl` | `hemplab.dev.beecommerce.pl` |

---

## 2. DOCKER - OBOWIĄZKOWA KONTENERYZACJA

### 2.1 NIGDY nie uruchamiaj aplikacji bezpośrednio przez PM2/Node
**ZAWSZE używaj Docker Compose!**

### 2.2 Architektura: hostname Docker + resolver (OBOWIĄZKOWE)

**Kluczowa zmiana:** Zamiast mapowania portów na localhost (`ports:`), używamy:
- `expose:` - port dostępny tylko w sieci Docker
- `hostname:` - nazwa DNS do rezolwowania przez dns-proxy-server
- `resolver` w nginx - dynamiczne rozwiązywanie hostname

**Zalety:**
- ✅ Brak konfliktów portów na localhost
- ✅ Lepsza izolacja sieciowa
- ✅ Nginx może się uruchomić bez kontenerów (graceful degradation)

### 2.3 Szablon docker-compose.yml (OBOWIĄZKOWY)
```yaml
services:
  {nazwa}-app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: {nazwa}-app
    hostname: app.{nazwa}.docker           # KLUCZOWE: hostname dla DNS!
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - NODE_ENV=production
    expose:
      - "3000"                              # NIE ports, tylko expose!
    networks:
      - {nazwa}-network
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M

networks:
  {nazwa}-network:
    name: {nazwa}-network
    driver: bridge
```

### 2.4 Szablon dla projektu z Frontend + Backend
```yaml
services:
  {nazwa}-frontend:
    build:
      context: .
      dockerfile: docker/frontend.Dockerfile
    container_name: {nazwa}-frontend
    hostname: frontend.{nazwa}.docker
    restart: unless-stopped
    expose:
      - "3001"
    networks:
      - {nazwa}-network
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3001/"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.5'

  {nazwa}-backend:
    build:
      context: .
      dockerfile: docker/backend.Dockerfile
    container_name: {nazwa}-backend
    hostname: backend.{nazwa}.docker
    restart: unless-stopped
    expose:
      - "3002"
    volumes:
      - ./data:/app/data
    networks:
      - {nazwa}-network
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3002/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  {nazwa}-network:
    name: {nazwa}-network
    driver: bridge
```

### 2.5 ZAKAZANE - ports na localhost
```yaml
# ŹLE - stara metoda, nie używać!
ports:
  - "127.0.0.1:3001:3000"
  - "3001:3000"
  - "0.0.0.0:3001:3000"

# DOBRZE - nowa metoda z hostname Docker
expose:
  - "3000"
hostname: app.{nazwa}.docker
```

### 2.6 Szablon Dockerfile (Node.js / Next.js)
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 && \
    chown -R nextjs:nodejs /app
USER nextjs

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["npm", "start"]
```

### 2.7 Szablon Dockerfile (Vite/React)
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .

ARG VITE_API_KEY
ENV VITE_API_KEY=$VITE_API_KEY

RUN npm run build

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --spider -q http://localhost:3001/ || exit 1

EXPOSE 3001

# WAŻNE: Use vite preview, NOT serve!
CMD ["npm", "run", "preview"]
```

### 2.8 Vite/React - konfiguracja (OBOWIĄZKOWA)
```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '127.0.0.1',
    port: 3001,
  },
  preview: {
    host: '0.0.0.0',  // WYMAGANE w Docker!
    port: 3001,
    allowedHosts: [
      '{nazwa}.dev.beecommerce.pl',
      'frontend.{nazwa}.docker',  // hostname Docker
      'localhost'
    ]
  }
});
```

### 2.9 Backend Express - bind address
```javascript
// server.js - MUSI być 0.0.0.0 w Docker!
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

## 3. NGINX - HOSTNAME DOCKER + RESOLVER

### 3.1 Wymagania infrastruktury

**dns-proxy-server (WYMAGANY)**
- Resolvuje hostname `*.docker`
- Sprawdź: `docker ps | grep dns-proxy`
- GitHub: [mageddo/dns-proxy-server](https://github.com/mageddo/dns-proxy-server)

### 3.2 Szablon vhosta z resolver (OBOWIĄZKOWY)
```nginx
server {
    listen 80;
    server_name {nazwa}.dev.beecommerce.pl;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name {nazwa}.dev.beecommerce.pl;

    ssl_certificate /etc/letsencrypt/live/{nazwa}.dev.beecommerce.pl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{nazwa}.dev.beecommerce.pl/privkey.pem;

    access_log /var/log/nginx/{nazwa}.dev.beecommerce.pl.access.log;
    error_log /var/log/nginx/{nazwa}.dev.beecommerce.pl.error.log;

    # Basic Auth dla dev projektów
    auth_basic "Restricted Access";
    auth_basic_user_file /storage/www/vhosts/htpasswd.ai.beecommerce.pl;

    # Frontend (hostname Docker + resolver)
    location / {
        resolver 127.0.0.53 ipv6=off valid=10s;
        set $upstream_frontend frontend.{nazwa}.docker:3001;
        proxy_pass http://$upstream_frontend/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # API Backend (hostname Docker + resolver)
    location /api/ {
        resolver 127.0.0.53 ipv6=off valid=10s;
        set $upstream_backend backend.{nazwa}.docker:3002;
        proxy_pass http://$upstream_backend/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
        proxy_read_timeout 300s;
    }

    # Static files (opcjonalnie, bez auth)
    location /static/ {
        auth_basic off;
        alias /home/bgaca/projects/ai-project-{nazwa}/public/static/;
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

### 3.3 WAŻNE: resolver W LOCATION, nie w server!
```nginx
# DOBRZE - resolver w location (nginx startuje bez kontenerów)
location / {
    resolver 127.0.0.53 ipv6=off valid=10s;
    set $upstream app.{nazwa}.docker:3000;
    proxy_pass http://$upstream/;
}

# ŹLE - resolver w server (nginx nie wstanie bez kontenerów)
server {
    resolver 127.0.0.53;  # NIE TUTAJ!
}
```

### 3.4 Parametry resolver
- `127.0.0.53` = systemd-resolved stub (przekieruje do dns-proxy-server)
- `ipv6=off` = wyłącza IPv6 (Vite nie obsługuje)
- `valid=10s` = cache DNS 10 sekund

### 3.5 Procedura tworzenia vhosta
```bash
# 1. Poproś Piotra o DNS: {nazwa}.dev.beecommerce.pl → 51.83.252.221

# 2. Utwórz vhost
sudo nano /etc/nginx/sites-available/{nazwa}.dev.beecommerce.pl

# 3. Włącz site
sudo ln -s ../sites-available/{nazwa}.dev.beecommerce.pl /etc/nginx/sites-enabled/

# 4. Test konfiguracji
sudo nginx -t

# 5. SSL certyfikat
sudo certbot --nginx -d {nazwa}.dev.beecommerce.pl

# 6. Reload nginx
sudo systemctl reload nginx
```

### 3.6 Po zmianach nginx ZAWSZE:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 3.7 Basic Auth - konfiguracja htpasswd

**Domyślnie** wszystkie projekty używają wspólnego pliku htpasswd:
```nginx
auth_basic_user_file /storage/www/vhosts/htpasswd.ai.beecommerce.pl;
```

**Opcjonalnie** można utworzyć oddzielny plik htpasswd dla każdego projektu:
```nginx
# Oddzielny plik htpasswd per projekt
auth_basic_user_file /storage/www/vhosts/htpasswd.{nazwa}.dev.beecommerce.pl;
```

**Tworzenie oddzielnego htpasswd:**
```bash
# Utwórz nowy plik htpasswd dla projektu
sudo htpasswd -c /storage/www/vhosts/htpasswd.{nazwa}.dev.beecommerce.pl username

# Dodaj kolejnego użytkownika (bez -c!)
sudo htpasswd /storage/www/vhosts/htpasswd.{nazwa}.dev.beecommerce.pl another_user
```

**Kiedy używać oddzielnego htpasswd:**
- Projekt wymaga innych danych logowania niż domyślne
- Projekt ma być udostępniony zewnętrznemu klientowi z osobnym hasłem
- Potrzeba różnych poziomów dostępu dla różnych projektów

**Wyłączenie Basic Auth dla wybranych lokalizacji:**
```nginx
location /api/public/ {
    auth_basic off;
    # ... proxy config
}
```

---

## 4. PROCEDURA TWORZENIA NOWEGO PROJEKTU

### Krok 1: Struktura katalogów
```bash
mkdir -p /home/bgaca/projects/ai-project-{nazwa}/{docker,src,data}
cd /home/bgaca/projects/ai-project-{nazwa}
```

### Krok 2: Pliki Docker
- `Dockerfile` lub `docker/{service}.Dockerfile`
- `docker-compose.yml` z:
  - `hostname: {service}.{nazwa}.docker`
  - `expose: ["PORT"]` (NIE ports!)
  - `networks: [{nazwa}-network]`
  - healthcheck
  - resource limits

### Krok 3: Konfiguracja aplikacji
- **vite.config.ts:** `preview.host = '0.0.0.0'`, dodaj hostname do `allowedHosts`
- **server.js:** `app.listen(PORT, '0.0.0.0')`

### Krok 4: DNS (poprosić Piotra)
```
{nazwa}.dev.beecommerce.pl → 51.83.252.221
```

### Krok 5: Nginx vhost
```bash
sudo nano /etc/nginx/sites-available/{nazwa}.dev.beecommerce.pl
sudo ln -s ../sites-available/{nazwa}.dev.beecommerce.pl /etc/nginx/sites-enabled/
```
**WAŻNE:** resolver W LOCATION (nie w server!) żeby nginx wstawał bez kontenerów!

### Krok 6: Build & Start
```bash
docker compose up -d --build
docker ps  # sprawdź healthy
```

### Krok 7: SSL
```bash
sudo certbot --nginx -d {nazwa}.dev.beecommerce.pl
```

### Krok 8: Test
```bash
curl https://{nazwa}.dev.beecommerce.pl/
```

### Krok 9: Usunięcie z PM2 (jeśli migracja)
```bash
pm2 stop {nazwa} && pm2 delete {nazwa} && pm2 save
```

---

## 5. ZMIENNE ŚRODOWISKOWE I SECRETS

### 5.1 Plik .env (NIGDY nie commitować!)
```bash
# .env
NODE_ENV=production
VITE_API_KEY=your-api-key-here
DATABASE_URL=postgresql://user:pass@db:5432/dbname
```

### 5.2 Plik .env.example (DO repozytorium)
```bash
# .env.example
NODE_ENV=production
VITE_API_KEY=your-api-key-here
DATABASE_URL=postgresql://user:password@db:5432/database
```

### 5.3 .gitignore (OBOWIĄZKOWY)
```gitignore
# Secrets - NEVER commit!
.env
.env.local
.env.*.local
*.pem
*.key

# Dependencies
node_modules/

# Build
dist/
build/
.next/

# Logs
*.log
logs/

# Data
data/
uploads/
```

### 5.4 .dockerignore (OBOWIĄZKOWY)
```dockerignore
node_modules/
.next/
dist/
.git/
.env
*.log
```

---

## 6. BEZPIECZEŃSTWO - ZASADY ŻELAZNE

### 6.1 NIGDY nie rób:
- `ports:` w docker-compose (używaj `expose:`)
- Hardcoded secrets w kodzie
- Root w kontenerze (użyj non-root user)
- Publiczne API bez autentykacji
- Brak rate limitingu

### 6.2 ZAWSZE rób:
- `expose:` + `hostname:` zamiast `ports:`
- Basic Auth dla projektów deweloperskich
- HTTPS (SSL przez Let's Encrypt)
- Health checks w Docker
- Resource limits (CPU, RAM)
- Regularne aktualizacje obrazów

---

## 7. MONITORING I LOGI

### 7.1 Health endpoint (OBOWIĄZKOWY)
```javascript
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### 7.2 Logi Docker
```bash
docker logs {nazwa}-app --tail 100 -f
docker logs {nazwa}-app --timestamps
```

---

## 8. TROUBLESHOOTING

### Problem: Nginx zwraca 502 Bad Gateway
**Rozwiązanie:**
1. Sprawdź czy kontener działa: `docker ps | grep {nazwa}`
2. Sprawdź hostname: `curl http://{service}.{nazwa}.docker:{port}/`
3. Sprawdź logi: `docker logs {nazwa}-app`
4. Sprawdź czy dns-proxy-server działa: `docker ps | grep dns-proxy`

### Problem: Kontener nie odpowiada
**Najczęstsza przyczyna:** Aplikacja binduje na `127.0.0.1` zamiast `0.0.0.0`
```javascript
// ŹLE:
app.listen(PORT, '127.0.0.1', () => {});
// DOBRZE:
app.listen(PORT, '0.0.0.0', () => {});
```

### Problem: Vite preview nie działa
**Rozwiązanie:** Dodaj `host: '0.0.0.0'` w `vite.config.ts`:
```typescript
preview: {
  host: '0.0.0.0',
  port: 3001,
}
```

### Problem: DNS nie resolvuje hostname .docker
**Rozwiązanie:** Sprawdź dns-proxy-server:
```bash
docker ps | grep dns-proxy
docker logs dns-proxy-server-dps-1
```

---

## 9. ZAKAZY - CZEGO CLAUDE CODE NIE MOŻE ROBIĆ

### 9.1 ABSOLUTNIE ZAKAZANE:
1. **Używanie `ports:` w docker-compose** - zawsze `expose:`
2. **Modyfikacja nginx** bez `nginx -t` test
3. **Usuwanie kontenerów** bez backupu
4. **Zmiana uprawnień** systemowych (chmod 777)
5. **Instalacja globalnych pakietów** npm/pip na hoście
6. **Tworzenie projektów bez Dockera**
7. **Hardcoded secrets** w kodzie
8. **Uruchamianie aplikacji przez PM2/Node** bezpośrednio

### 9.2 WYMAGANA ZGODA UŻYTKOWNIKA:
- Tworzenie nowej subdomeny
- Zmiana konfiguracji nginx
- Dodanie nowej bazy danych
- Zmiana resource limits
- Modyfikacja istniejących projektów

---

## 10. ISTNIEJĄCE PROJEKTY - MAPA

| Projekt | Hostname Docker | Subdomena | Status |
|---------|-----------------|-----------|--------|
| agrosimex-lookbook | `frontend.agrosimex-lookbook.docker:80` | agrosimex-lookbook.dev.beecommerce.pl | ✅ Docker |
| agrosimex-lookbook | `backend.agrosimex-lookbook.docker:3002` | (API) | ✅ Docker |
| figma-css-generator | `app.figma-css.docker:3003` | figma-css.dev.beecommerce.pl | ✅ Docker |
| hemplab | `app.hemplab.docker:3026` | hemplab.dev.beecommerce.pl | ✅ Docker |
| hemplab2 | `app.hemplab2.docker:3027` | hemplab2.dev.beecommerce.pl | ✅ Docker |
| wsip-mvp | `frontend.wsip.docker:3000` | wsip.dev.beecommerce.pl | ✅ Docker (7 mikroserwisów) |
| ai-portfolio | `app.ai-portfolio.docker:3020` | projects.dev.beecommerce.pl | ✅ Docker |
| ai-timetracker | `app.ai-timetracker.docker:3021` | timetracker.dev.beecommerce.pl | ✅ Docker |
| n8n | `127.0.0.1:5678` | n8n.dev.beecommerce.pl | ✅ Docker |

---

## 11. QUICK REFERENCE - KOMENDY

```bash
# === DOCKER ===
docker compose up -d --build    # Start projektu
docker compose down             # Stop projektu
docker compose logs -f          # Logi
docker compose ps               # Status

# === NGINX ===
sudo nginx -t                   # Test konfiguracji
sudo systemctl reload nginx     # Reload (no downtime)

# === DNS TEST ===
curl http://{service}.{nazwa}.docker:{port}/

# === SSL ===
sudo certbot --nginx -d {nazwa}.dev.beecommerce.pl

# === DEBUGGING ===
docker exec -it {kontener} sh   # Shell w kontenerze
docker stats                    # Zużycie zasobów
docker network ls               # Lista sieci
```

---

## 12. SEO RULES (OBOWIĄZKOWE)

### Meta Robots Tag
**ZAWSZE używaj `index, follow` dla stron publicznych:**

```tsx
// Next.js App Router
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

// HTML
<meta name="robots" content="index, follow" />
```

### Dodatkowe wymagania SEO:
- Zawsze `<title>` tag
- Zawsze `<meta name="description">`
- Semantic HTML
- Proper heading hierarchy (h1 → h2 → h3)
- Alt text dla obrazów

---

**Wersja:** 1.3.0
**Data:** 2026-02-02
**Autor:** Piotr Stanek (DevOps) + aktualizacja

**Changelog v1.3.0:**
- Dodanie sekcji 3.7 - konfiguracja oddzielnych plików htpasswd per projekt
- Dokumentacja jak tworzyć i zarządzać htpasswd dla poszczególnych vhostów

**Changelog v1.2.0:**
- Usunięcie wymagania `dns-proxy-server_default` network (niepotrzebne)
- dns-proxy-server resolvuje wszystkie hostname Docker automatycznie
- Aktualizacja mapy projektów (wszystko w Docker, PM2 pusty)
- Zmiana healthcheck z curl na wget (mniejszy image)

**Changelog v1.1.0:**
- Zmiana z `ports:` na `expose:` + `hostname:`
- Dodanie resolver 127.0.0.53 w nginx location
