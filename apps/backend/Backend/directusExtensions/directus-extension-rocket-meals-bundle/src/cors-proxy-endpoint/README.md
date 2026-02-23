# CORS Proxy Endpoint

Diesen Endpoint kann man nutzen, um CORS (Cross-Origin Resource Sharing) Probleme zu umgehen. Der Endpoint fungiert als Proxy, der eine Anfrage an eine externe URL leitet und das Ergebnis zurückgibt.

## Testing

### Quick Test
1. Login mit einem User in der Directus Admin UI
2. Gehe zur URL: `http://127.0.0.1/<DOMAIN_PATH>/api/cors-proxy?url=<encoded_url>`

Wo `http://127.0.0.1/<DOMAIN_PATH>/api` die URL deiner Directus API ist.

## Verwendung

### GET-Anfrage (einfache Anfragen)

```bash
GET /api/extensions/cors-proxy?url=<encoded_url>
```

**Parameter:**
- `url` (erforderlich): Die URL, die gefetched werden soll, URL-codiert

**Beispiel:**
```bash
# Die URL https://api.example.com/data sollte URL-codiert sein
curl "http://localhost:8055/api/extensions/cors-proxy?url=https%3A%2F%2Fapi.example.com%2Fdata"

# Oder mit dem vollständigen Pfad
curl "http://127.0.0.1/<DOMAIN_PATH>/api/cors-proxy?url=https%3A%2F%2Fapi.example.com%2Fdata"
```

**Response:**
- Erfolgreich (200): Der Inhalt der externen URL mit dem ursprünglichen Content-Type
- Fehler (400): Fehlende oder ungültige URL
- Fehler (500): Fehler beim Abrufen der URL

### POST-Anfrage (erweiterte Anfragen)

```bash
POST /api/extensions/cors-proxy
Content-Type: application/json

{
  "url": "https://api.example.com/data",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer token123",
    "Custom-Header": "value"
  },
  "body": {
    "key": "value"
  }
}
```

**Parameter:**
- `url` (erforderlich): Die URL, die gefetched werden soll
- `method` (optional, Standard: "GET"): HTTP-Methode (GET, POST, PUT, DELETE, etc.)
- `headers` (optional): Zusätzliche HTTP-Header
- `body` (optional): Der Request-Body (wird bei GET-Anfragen ignoriert)

**Beispiel mit JavaScript/Fetch:**
```javascript
const corsProxyUrl = "http://127.0.0.1/<DOMAIN_PATH>/api/cors-proxy";
const targetUrl = "https://api.example.com/data";

const response = await fetch(corsProxyUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    url: targetUrl,
    method: "GET"
  })
});

const data = await response.json();
console.log(data);
```

## Security Hinweise

⚠️ **Warnung:** Dieser Endpoint ermöglicht es jedem, externe URLs zu fetchen. Verwende ihn mit Vorsicht und implementiere ggf. zusätzliche Validierung:

1. **URL-Whitelist**: Es wäre ratsam, nur bestimmte Domains zu erlauben
2. **Authentifizierung**: Der Endpoint sollte ggf. hinter einer Authentifizierung liegen
3. **Timeout**: Lange Running Requests sollten begrenzt werden
4. **Size Limits**: Die Größe der Responses sollte begrenzt werden

## Anpassungen für Production

Für eine Production-Umgebung solltest du folgende Improvements vornehmen:

1. Whitelist von erlaubten Domains implementieren
2. Authentifizierung/Autorisierung hinzufügen
3. Rate-Limiting implementieren
4. Timeouts und Size-Limits setzen
5. Logging und Monitoring hinzufügen

