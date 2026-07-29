// components/address-autocomplete.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Sin h-9/shadow-xs/focus-visible:ring-ring/border-input fijos a propósito:
// el consumidor controla altura, sombra, color de foco y color de borde vía
// su propio className (checkout-form.tsx usa py-2 + focus:ring-[var(--brand-color)]
// sobre el border gris default del navegador). border-input apunta a la
// variable --input de shadcn, que en Pedilo vale blanco puro en modo claro
// (oklch(1 0 0)) — el borde quedaba invisible contra el fondo blanco de la
// card (bug reportado: "le falta un borde que tienen los demás inputs").
const INPUT_BASE_CLASS =
  "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

type AddressSelection = {
  address: string;
  placeId: string;
};

type Suggestion = {
  placeId: string;
  text: string;
};

/** Centro + radio para priorizar sugerencias cercanas (el comercio y su zona
 * de cobertura de delivery) — no excluye resultados fuera del radio, solo
 * los reordena más abajo (Places API `locationBias`, no `Restriction`). */
type LocationBias = { latitude: number; longitude: number; radiusMeters: number };

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onPlaceSelect: (selection: AddressSelection) => void;
  placeholder?: string;
  className?: string;
  /** Callback ref únicamente (no RefObject) — evita mutar una prop directamente. */
  onInputElement?: (el: HTMLInputElement | null) => void;
  locationBias?: LocationBias | null;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLACES_API_KEY;

/**
 * Autocomplete de direcciones — llama directo a Places API (New) vía REST
 * (fetch con X-Goog-Api-Key), sin cargar el script legacy de Google Maps JS
 * (que requiere habilitar la API vieja "Places API" en Cloud Console, además
 * de "Places API (New)"). Mismo patrón que maps-test/src/components/CustomSearchBox.tsx.
 * Key restringida por HTTP referrer, scope Places API (New) únicamente. Al
 * elegir una sugerencia, entrega `placeId` — el Backend es quien calcula
 * distancia/precio a partir de ese identificador (ver
 * openspec/changes/delivery-pricing/design.md).
 */
export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder,
  className,
  onInputElement,
  locationBias,
}: AddressAutocompleteProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Reenvía el nodo DOM al padre vía callback — nunca mutamos un ref
  // recibido como prop directamente (regla react-hooks/immutability).
  useEffect(() => {
    onInputElement?.(internalRef.current);
    return () => onInputElement?.(null);
  }, [onInputElement]);

  useEffect(() => {
    if (!API_KEY || !value || value.length < 3 || selected) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": API_KEY,
          },
          body: JSON.stringify({
            input: value,
            // includedRegionCodes es un filtro duro (excluye todo lo que no
            // sea AR) — regionCode por sí solo es solo un "bias" suave que
            // igual puede devolver resultados de otros países si el texto
            // matchea fuerte ahí.
            includedRegionCodes: ["ar"],
            languageCode: "es",
            // "route" (calle sin altura) queda afuera a propósito: si esa
            // sugerencia se elegía, el placeId resultante correspondía a la
            // vía genérica y perdía la altura numérica (bug reportado: "San
            // Luis 50" se guardaba como "San Luis" sin el 50).
            includedPrimaryTypes: ["street_address", "premise", "subpremise"],
            // Prioriza (sin excluir) direcciones cercanas al comercio — ej.
            // dentro de su radio de cobertura de delivery. Sigue mostrando
            // resultados fuera del radio, solo los ordena más abajo.
            ...(locationBias
              ? {
                  locationBias: {
                    circle: {
                      center: { latitude: locationBias.latitude, longitude: locationBias.longitude },
                      radius: locationBias.radiusMeters,
                    },
                  },
                }
              : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          setSuggestions([]);
          return;
        }

        const data = await res.json();
        const items: Suggestion[] = (data.suggestions || [])
          .filter((s: any) => s.placePrediction)
          .map((s: any) => ({
            placeId: s.placePrediction.placeId,
            text: s.placePrediction.text.text,
          }));

        setSuggestions(items);
        setShowDropdown(true);
        setHighlightedIndex(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setSuggestions([]);
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, selected, locationBias?.latitude, locationBias?.longitude, locationBias?.radiusMeters]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const handleSelect = useCallback(
    async (suggestion: Suggestion) => {
      onChange(suggestion.text);
      setShowDropdown(false);
      setSelected(true);

      if (!API_KEY) return;
      try {
        const res = await fetch(`https://places.googleapis.com/v1/places/${suggestion.placeId}`, {
          headers: {
            "X-Goog-Api-Key": API_KEY,
            "X-Goog-FieldMask": "formattedAddress,location",
          },
        });
        if (!res.ok) return;

        const data = await res.json();
        onPlaceSelect({
          address: data.formattedAddress ?? suggestion.text,
          placeId: suggestion.placeId,
        });
      } catch {
        // Si falla la resolución de detalles, dejamos el texto elegido igual
        // — el placeId nunca llega, la cotización server-side lo va a rechazar.
      }
    },
    [onChange, onPlaceSelect]
  );

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={internalRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setSelected(false);
        }}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        onKeyDown={(e) => {
          if (!showDropdown || suggestions.length === 0) {
            if (e.key === "Escape") setShowDropdown(false);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          } else if (e.key === "Enter") {
            if (highlightedIndex >= 0) {
              e.preventDefault();
              handleSelect(suggestions[highlightedIndex]);
            }
          } else if (e.key === "Escape") {
            setShowDropdown(false);
          }
        }}
        placeholder={placeholder}
        className={cn(INPUT_BASE_CLASS, className)}
        autoComplete="off"
      />
      {showDropdown && !selected && value.length >= 3 && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[280px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={cn(
                "block w-full border-b border-slate-100 px-3 py-2.5 text-left text-[13px] text-slate-800 last:border-b-0",
                i === highlightedIndex ? "bg-slate-50" : "hover:bg-slate-50"
              )}
            >
              {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
