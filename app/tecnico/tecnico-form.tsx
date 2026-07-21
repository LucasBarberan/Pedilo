"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TecnicoForm({ initialActive }: { initialActive: boolean }) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(initialActive);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/tecnico/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "No se pudo activar el modo prueba");
        return;
      }
      setActive(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/tecnico/logout", { method: "POST" });
      setActive(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (active) {
    return (
      <div className="max-w-sm mx-auto mt-20 p-6 border rounded-lg space-y-4">
        <p className="text-sm">
          🧪 Modo prueba <strong>activado</strong> en este navegador. Los pedidos que
          hagas desde acá no afectan los datos reales.
        </p>
        <Button onClick={handleLogout} disabled={loading} variant="outline" className="w-full">
          Salir del modo prueba
        </Button>
        <Link href="/" className="block text-center text-sm text-muted-foreground hover:underline">
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleLogin} className="max-w-sm mx-auto mt-20 p-6 border rounded-lg space-y-4">
      <p className="text-sm text-muted-foreground">
        Activar modo prueba (uso interno — técnico de instalación).
      </p>
      <input
        type="text"
        placeholder="Usuario"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full border rounded px-3 py-2"
        autoComplete="off"
      />
      <input
        type="password"
        placeholder="PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        className="w-full border rounded px-3 py-2"
        autoComplete="off"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Ingresando..." : "Activar modo prueba"}
      </Button>
    </form>
  );
}
