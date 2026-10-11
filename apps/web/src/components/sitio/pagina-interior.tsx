import { Encabezado } from './encabezado';
import { Pie } from './secciones';

/** Estructura de las páginas internas: encabezado sólido, título y pie. */
export function PaginaInterior({ eyebrow, titulo, intro, children }: { eyebrow: string; titulo: string; intro?: string; children: React.ReactNode }) {
  return (
    <>
      <Encabezado solido />
      <main id="contenido">
        <section className="bg-ocean pb-10 pt-28 text-white md:pb-12 md:pt-32">
          <div className="contenedor"><p className="eyebrow-claro">{eyebrow}</p><h1 className="display mt-3 text-white">{titulo}</h1>
            {intro && <p className="mt-4 max-w-3xl text-[#D6E0E2]">{intro}</p>}</div>
        </section>
        <section className="seccion"><div className="contenedor max-w-5xl">{children}</div></section>
      </main>
      <Pie />
    </>
  );
}
