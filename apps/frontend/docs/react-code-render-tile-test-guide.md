# Testanleitung: React Code Renderer Tile im Dashboard

Diese Anleitung stellt sicher, dass der Test **nicht** auf dem Welcome-Screen endet, sondern die Kachel wirklich auf dem Dashboard geprüft wird.

## Ziel
- Vom Welcome-Screen ins Dashboard wechseln.
- React Code Renderer Kachel hinzufügen.
- Kachel auf volle Breite bringen.
- TSX/JSX-Code rendern.
- Verifizieren, dass **kein** Babel-Fehler `Preset ... requires a filename` erscheint.

## Manueller Testablauf
1. Frontend starten:
   - `yarn workspace frontend dev --host 0.0.0.0 --port 4173`
2. `http://localhost:4173` öffnen.
3. Auf dem Welcome-Screen den Button **Dashboard** klicken.
4. Oben rechts den **Settings**-Button klicken (Edit-Mode aktivieren).
5. **Add (+)** klicken und Tile **React Code Renderer** auswählen.
6. Die neue Kachel auf volle Breite ziehen:
   - Unten rechts den Resize-Handle der Kachel greifen.
   - Nach rechts ziehen, bis die Kachel die gewünschte Breite hat (ideal: gesamte Grid-Breite).
7. In **Code Eingabe** folgenden Code einfügen:

```tsx
import React from 'react'

export default function App() {
  return <Text data-testid="render-ok">Render OK</Text>
}
```

8. **Render / Refresh** klicken.
9. Prüfen:
   - Im iframe steht `Render OK`.
   - Es wird **kein** Fehler mit `requires a filename` angezeigt.

## Playwright-Checkliste (für automatisierte Agent-Tests)
- Immer mit Welcome-Screen starten (`/`).
- Button **Dashboard** klicken.
- Edit-Mode aktivieren.
- React Code Renderer hinzufügen.
- Beispielcode einfügen + `Render / Refresh` klicken.
- Inhalt im iframe prüfen.
- Screenshot vom Dashboard mit sichtbarer React Code Renderer Kachel speichern.

## Akzeptanzkriterien
- Testdurchlauf enthält explizit den Schritt Welcome -> Dashboard.
- React Code Renderer wurde sichtbar gerendert.
- Kein Babel-Fehler bzgl. `filename`.
- Screenshot zeigt Dashboard (nicht nur Welcome).
