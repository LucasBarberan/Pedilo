// components/delivery-map.tsx
"use client";

import { useEffect, useState } from "react";
import { APIProvider, Map, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";
import type { LatLng } from "@/lib/api/delivery";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLACES_API_KEY;
// Sin mapId propio, Advanced Markers igual funciona con el ID demo público de
// Google (mapa sin estilo custom) — mejor que no poder mostrar el mapa.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID || "DEMO_MAP_ID";

interface DeliveryMapProps {
  destinationLocation: LatLng;
  /** Si se pasa, el pin queda arrastrable y esto se llama al soltarlo con
   * las nuevas coordenadas — el padre decide qué hacer (recotizar, etc.). */
  onLocationChange?: (location: LatLng) => void;
}

/**
 * Mapa con el pin del domicilio elegido por el cliente — confirma
 * visualmente la dirección, y opcionalmente permite ajustarla arrastrando
 * el pin (útil cuando el autocomplete no da con el punto exacto). No
 * muestra el comercio: desde la perspectiva del cliente no aporta
 * información.
 *
 * Usa @vis.gl/react-google-maps (mismo patrón que maps-test/src/components/MapView.tsx,
 * ya validado funcionando) en vez de la API vanilla — evita los problemas de
 * timing de importLibrary()/tamaño de contenedor que tuvimos con la
 * implementación manual.
 */
export function DeliveryMap({ destinationLocation, onLocationChange }: DeliveryMapProps) {
  // Posición local del pin — se actualiza al instante al soltar el drag
  // (optimista), sin esperar la respuesta del Backend. Si no hiciéramos
  // esto, position quedaría atada directo a destinationLocation (prop del
  // padre), que solo cambia cuando la recotización termina: mientras tanto
  // el pin "saltaba" de vuelta a la posición vieja y después volvía a donde
  // se soltó, apenas llegaba la respuesta (bug reportado).
  const [pinPosition, setPinPosition] = useState(destinationLocation);

  // Sincroniza si destinationLocation cambia por una razón externa al drag
  // (ej. el cliente eligió otra dirección por autocomplete).
  useEffect(() => {
    setPinPosition(destinationLocation);
  }, [destinationLocation]);

  if (!API_KEY) return null;

  const center = { lat: pinPosition.latitude, lng: pinPosition.longitude };

  return (
    <APIProvider apiKey={API_KEY}>
      <div className="overflow-hidden rounded-xl ring-1 ring-black/5">
        <Map
          mapId={MAP_ID}
          defaultCenter={center}
          defaultZoom={16}
          // Google simplifica/reagrupa calles a bajo zoom (comportamiento
          // no configurable del renderer), lo que rompe la consistencia
          // visual del estilo custom. Como este mapa es solo para confirmar
          // un domicilio (no para explorar la ciudad), limitamos el rango a
          // nivel calle/manzana — nunca se llega al punto donde el estilo
          // "salta".
          minZoom={14}
          maxZoom={19}
          disableDefaultUI
          zoomControl
          gestureHandling="cooperative"
          style={{ width: "100%", height: "150px" }}
        >
          <AdvancedMarker
            position={center}
            title={onLocationChange ? "Arrastrá para ajustar tu domicilio" : "Tu domicilio"}
            draggable={!!onLocationChange}
            onDragEnd={(e) => {
              const pos = e.latLng;
              if (pos && onLocationChange) {
                const next = { latitude: pos.lat(), longitude: pos.lng() };
                setPinPosition(next); // optimista: fija el pin donde se soltó, ya
                onLocationChange(next);
              }
            }}
          >
            <Pin background="var(--brand-color)" glyphColor="#fff" borderColor="#fff" />
          </AdvancedMarker>
        </Map>
      </div>
    </APIProvider>
  );
}
