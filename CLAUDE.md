# dev.beecommerce.pl — Zasady dla Claude Code

> Przeczytaj: `/home/bgaca/SECURITY_RULES.md` (NAJWYŻSZY PRIORYTET!)

## Konwencje nazewnictwa

| Element | Pattern | Przykład |
|---------|---------|----------|
| Katalog | `ai-project-{nazwa}` | `ai-project-hemplab` |
| Kontener | `{nazwa}-{service}` | `hemplab-app` |
| Hostname Docker | `{service}.{nazwa}.docker` | `app.hemplab.docker` |
| Sieć Docker | `{nazwa}-network` | `hemplab-network` |
| Subdomena (nowe) | `{nazwa}.ai.beecommerce.pl` | `moja-app.ai.beecommerce.pl` |
| Subdomena (stare) | `{nazwa}.dev.beecommerce.pl` | `hemplab.dev.beecommerce.pl` |

Projekty w: `/home/bgaca/projects/ai-project-{nazwa}/`

## Krytyczne reguły Docker

**ZAWSZE `expose:` + `hostname:`, NIGDY `ports:`**

```yaml
services:
  {nazwa}-app:
    hostname: app.{nazwa}.docker   # DNS dla nginx resolver
    expose: ["3000"]               # NIE ports!
    networks: [{nazwa}-network]
    deploy:
      resources:
        limits: {cpus: '1.0', memory: 512M}
        reservations: {cpus: '0.25', memory: 128M}
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  {nazwa}-network:
    name: {nazwa}-network
    driver: bridge
```

Aplikacja MUSI bindować na `0.0.0.0` (nie `127.0.0.1`):
```javascript
app.listen(PORT, '0.0.0.0', () => {});
```

Vite preview MUSI mieć `host: '0.0.0.0'` w vite.config.ts.

## Krytyczna reguła nginx

**resolver W LOCATION (nie w server!) — nginx startuje bez kontenerów:**

```nginx
location / {
    resolver 127.0.0.53 ipv6=off valid=10s;   # TUTAJ
    set $upstream app.{nazwa}.docker:3000;
    proxy_pass http://$upstream/;
}
```

## Tworzenie projektu (automatyzacja)

```bash
/home/bgaca/bin/setup-project.sh nazwa             # pełna automatyzacja
/home/bgaca/bin/setup-project.sh nazwa --dual-service  # frontend + backend
/home/bgaca/bin/add-route53-record.sh nazwa.ai.beecommerce.pl
/home/bgaca/bin/generate-nginx-vhost.sh nazwa
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d {nazwa}.ai.beecommerce.pl
```

## Istniejące projekty

| Projekt | Hostname Docker | Subdomena |
|---------|-----------------|-----------|
| agrosimex-lookbook | `frontend/backend.agrosimex-lookbook.docker` | agrosimex-lookbook.dev.beecommerce.pl |
| figma-css-generator | `app.figma-css.docker:3003` | figma-css.dev.beecommerce.pl |
| hemplab | `app.hemplab.docker:3026` | hemplab.dev.beecommerce.pl |
| hemplab2 | `app.hemplab2.docker:3027` | hemplab2.dev.beecommerce.pl |
| wsip-mvp | `frontend.wsip.docker:3000` | wsip.dev.beecommerce.pl |
| ai-portfolio | `app.ai-portfolio.docker:3020` | projects.dev.beecommerce.pl |
| ai-timetracker | `app.ai-timetracker.docker:3021` | timetracker.dev.beecommerce.pl |
| n8n | `127.0.0.1:5678` | n8n.dev.beecommerce.pl |

## Bezpieczeństwo — zakazy

**ABSOLUTNIE ZAKAZANE:**
- `ports:` w docker-compose (zawsze `expose:`)
- Modyfikacja nginx bez `nginx -t` test
- Usuwanie kontenerów bez backupu
- `chmod 777` / globalne paczki npm/pip na hoście
- Tworzenie projektów bez Dockera
- Hardcoded secrets w kodzie
- Uruchamianie przez PM2/Node bezpośrednio

**WYMAGA ZGODY UŻYTKOWNIKA:** nowa subdomena, zmiana nginx, nowa baza, zmiana resource limits

## SEO (obowiązkowe)

```tsx
export const metadata: Metadata = { robots: { index: true, follow: true } };
```
Zawsze: `<title>`, `<meta name="description">`, semantic HTML, alt text na obrazach.

## Quick reference

```bash
docker compose up -d --build   # start
docker compose logs -f          # logi
sudo nginx -t && sudo systemctl reload nginx
curl http://{service}.{nazwa}.docker:{port}/  # test DNS
docker stats                    # zasoby
```
