import Link from 'next/link';
export default function NoEncontrado() {
  return (
    <main id="contenido" className="grid min-h-screen place-items-center bg-ocean px-6 text-center text-white">
      <div><p className="eyebrow-claro">Error 404</p><h1 className="display mt-3 text-white">Esta página se la llevó la marea</h1>
        <p className="mt-4 text-[#D6E0E2]">La dirección no existe o fue movida.</p><Link href="/" className="btn-oro mt-8">Volver al inicio</Link></div>
    </main>
  );
}
